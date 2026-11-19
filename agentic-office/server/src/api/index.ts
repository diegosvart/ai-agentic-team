import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import type { ApiError, HealthResponse, StateResponse } from '@agentic-office/shared';
import { DEFAULT_CORS_ORIGINS } from '../config';
import type { Config, ConnectorRegistry, Engine, EventBus, LLMProvider, Store } from '../contracts';
import {
  actionCreateSchema,
  actionPatchSchema,
  agentCreateSchema,
  agentPatchSchema,
  fieldLabel,
  limitQuery,
  requestSchema,
  resolveSchema,
} from './schemas';

export interface ApiDeps {
  store: Store;
  bus: EventBus;
  engine: Engine;
  connectors: ConnectorRegistry;
  llm: LLMProvider;
  config: Config;
}

/** Error de API con estado HTTP explicito (validaciones propias de este modulo). */
class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

const CODE_STATUS: Record<string, number> = { not_found: 404, conflict: 409, forbidden: 403 };
const KEEPALIVE_MS = 20_000;

function mapError(err: unknown): { status: number; body: ApiError } {
  if (err instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: 'Datos inválidos',
        details: err.issues.map((i) => ({ path: i.path.join('.'), field: fieldLabel(i.path), message: i.message })),
      },
    };
  }
  if (err instanceof HttpError) {
    return { status: err.status, body: { error: err.message, ...(err.details !== undefined && { details: err.details }) } };
  }
  const e = err as { code?: unknown; statusCode?: unknown; message?: unknown } | null;
  // Duck typing: StoreError y EngineError exponen `code`.
  if (e && typeof e.code === 'string' && e.code in CODE_STATUS) {
    return { status: CODE_STATUS[e.code] as number, body: { error: String(e.message ?? e.code) } };
  }
  // Errores propios de Fastify (JSON malformado, cuerpo demasiado grande...).
  if (e && typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500) {
    return { status: e.statusCode, body: { error: String(e.message ?? 'Solicitud invalida') } };
  }
  return { status: 500, body: { error: 'Error interno del servidor' } };
}

export function buildApp(deps: ApiDeps): FastifyInstance {
  const { store, bus, engine, connectors, llm, config } = deps;
  const app = Fastify({ logger: false, forceCloseConnections: true });

  /** Unico punto de resolucion de tenant: en el futuro saldra de la sesion. */
  const tenantOf = (_req: FastifyRequest): string => store.getDefaultTenant().id;
  const changed = (tenantId: string) => bus.publish(tenantId, { type: 'config.changed' });

  // Sin login (SPEC decision 6) la API no debe poder manejarse desde cualquier web que visite el
  // operador: solo el mismo origen y los origenes configurados (CORS_ORIGINS).
  const allowedOrigins = new Set(config.corsOrigins ?? DEFAULT_CORS_ORIGINS.split(','));
  const sameOrigin = (req: FastifyRequest, origin: string) => {
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  };
  const originAllowed = (req: FastifyRequest): boolean => {
    const origin = req.headers.origin;
    return origin === undefined || allowedOrigins.has(origin) || sameOrigin(req, origin);
  };
  app.register(cors, {
    // Fastify-cors con funcion de 2 argumentos no expone la peticion: se decide en el hook de abajo
    // y aqui solo se refleja la cabecera para los origenes autorizados.
    origin: (origin, cb) => cb(null, origin === undefined || allowedOrigins.has(origin)),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  // CORS solo impide leer la respuesta; un POST "simple" (sin cuerpo, p. ej. aprobar) se ejecutaria
  // igual. Por eso las peticiones que modifican estado desde otro origen se rechazan aqui.
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (!originAllowed(req)) return reply.status(403).send({ error: 'Origen no permitido' } satisfies ApiError);
  });

  app.setErrorHandler((err, _req, reply) => {
    const { status, body } = mapError(err);
    if (status >= 500) console.error('[api]', err);
    return reply.status(status).send(body);
  });

  const webDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../../web/dist');
  const hasWeb = existsSync(resolve(webDist, 'index.html'));
  if (hasWeb) app.register(fastifyStatic, { root: webDist });

  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    if (hasWeb && req.method === 'GET' && !path.startsWith('/api')) return reply.sendFile('index.html');
    return reply.status(404).send({ error: 'No encontrado' } satisfies ApiError);
  });

  // ---------- Salud y estado ----------

  app.get('/api/health', async (): Promise<HealthResponse> => ({ ok: true, llmMode: llm.mode, models: config.models }));

  app.get('/api/state', async (req): Promise<StateResponse> => {
    const t = store.getDefaultTenant();
    tenantOf(req);
    return {
      tenant: t,
      agents: store.listAgents(t.id),
      actions: store.listActions(t.id),
      connectors: connectors.list(),
      agentStatus: engine.agentStatuses(t.id),
    };
  });

  // ---------- Agentes ----------

  app.post('/api/agents', async (req, reply) => {
    const tenantId = tenantOf(req);
    const input = agentCreateSchema.parse(req.body);
    const agent = store.createAgent(tenantId, input);
    changed(tenantId);
    return reply.status(201).send(agent);
  });

  app.patch<{ Params: { id: string } }>('/api/agents/:id', async (req) => {
    const tenantId = tenantOf(req);
    const patch = agentPatchSchema.parse(req.body);
    const current = store.getAgent(tenantId, req.params.id);
    if (!current) throw new HttpError(404, 'Agente no encontrado');
    if (current.role === 'ceo') {
      const blocked = (['key', 'area', 'defaultModel', 'enabled'] as const).filter((k) => patch[k] !== undefined);
      if (blocked.length) throw new HttpError(403, 'Del CEO solo se pueden editar nombre, descripcion y color', blocked);
    }
    const agent = store.updateAgent(tenantId, req.params.id, patch);
    changed(tenantId);
    return agent;
  });

  app.delete<{ Params: { id: string } }>('/api/agents/:id', async (req, reply) => {
    const tenantId = tenantOf(req);
    const current = store.getAgent(tenantId, req.params.id);
    if (!current) throw new HttpError(404, 'Agente no encontrado');
    if (current.role === 'ceo') throw new HttpError(403, 'El CEO no se puede borrar');
    store.deleteAgent(tenantId, req.params.id);
    changed(tenantId);
    return reply.status(204).send();
  });

  // ---------- Acciones ----------

  /** Valida dueno y conector (existencia + configuracion) de una accion ya combinada. */
  const checkActionTargets = (tenantId: string, a: { agentId: string; connector: string; connectorConfig: Record<string, unknown> }) => {
    const owner = store.getAgent(tenantId, a.agentId);
    if (!owner) throw new HttpError(400, 'El agente indicado no existe', [{ path: 'agentId', field: fieldLabel(['agentId']), message: 'no existe' }]);
    if (owner.role === 'ceo') {
      throw new HttpError(400, 'El CEO no ejecuta acciones: asignala a un agente de area', [{ path: 'agentId', field: fieldLabel(['agentId']), message: 'es el CEO' }]);
    }
    const connector = connectors.get(a.connector);
    if (!connector) throw new HttpError(400, `Conector desconocido: ${a.connector}`, [{ path: 'connector', field: fieldLabel(['connector']), message: 'no existe' }]);
    const errors = connector.validateConfig(a.connectorConfig);
    if (errors.length) throw new HttpError(400, 'Configuración de conector inválida', errors.map((m) => ({ path: 'connectorConfig', field: fieldLabel(['connectorConfig']), message: m })));
  };

  app.post('/api/actions', async (req, reply) => {
    const tenantId = tenantOf(req);
    const input = actionCreateSchema.parse(req.body);
    checkActionTargets(tenantId, input);
    const action = store.createAction(tenantId, input);
    changed(tenantId);
    return reply.status(201).send(action);
  });

  app.patch<{ Params: { id: string } }>('/api/actions/:id', async (req) => {
    const tenantId = tenantOf(req);
    const patch = actionPatchSchema.parse(req.body);
    const current = store.getAction(tenantId, req.params.id);
    if (!current) throw new HttpError(404, 'Accion no encontrada');
    checkActionTargets(tenantId, {
      agentId: patch.agentId ?? current.agentId,
      connector: patch.connector ?? current.connector,
      connectorConfig: patch.connectorConfig ?? current.connectorConfig,
    });
    const action = store.updateAction(tenantId, req.params.id, patch);
    changed(tenantId);
    return action;
  });

  app.delete<{ Params: { id: string } }>('/api/actions/:id', async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!store.getAction(tenantId, req.params.id)) throw new HttpError(404, 'Accion no encontrada');
    store.deleteAction(tenantId, req.params.id);
    changed(tenantId);
    return reply.status(204).send();
  });

  // ---------- Solicitudes y tareas ----------

  app.post('/api/requests', async (req, reply) => {
    const tenantId = tenantOf(req);
    const { text } = requestSchema.parse(req.body);
    return reply.status(201).send(engine.submitRequest(tenantId, text));
  });

  app.get('/api/tasks', async (req) => {
    const tenantId = tenantOf(req);
    const { limit } = limitQuery.parse(req.query);
    return store
      .listRootTasks(tenantId, limit)
      .map((t) => store.getTaskTree(tenantId, t.id))
      .filter((tree) => tree !== null);
  });

  app.get<{ Params: { id: string } }>('/api/tasks/:id', async (req) => {
    const tree = store.getTaskTree(tenantOf(req), req.params.id);
    if (!tree) throw new HttpError(404, 'Tarea no encontrada');
    return tree;
  });

  // ---------- Aprobaciones ----------

  app.get('/api/approvals', async (req) => store.listActionRuns(tenantOf(req), { status: 'pending_approval' }));

  const resolver = (approved: boolean) => async (req: FastifyRequest<{ Params: { id: string } }>) => {
    const tenantId = tenantOf(req);
    const { note } = resolveSchema.parse(req.body ?? {});
    return engine.resolveApproval(tenantId, req.params.id, approved, note);
  };
  app.post<{ Params: { id: string } }>('/api/action-runs/:id/approve', resolver(true));
  app.post<{ Params: { id: string } }>('/api/action-runs/:id/reject', resolver(false));

  // ---------- SSE ----------

  /**
   * Epoca del flujo SSE: el seq del bus vive en memoria y vuelve a 1 al reiniciar, asi que el id
   * de cada evento lleva la epoca ("<epoca>.<seq>"). Un Last-Event-ID de otra epoca (proceso
   * anterior) no se usa para deduplicar: si no, se descartarian en silencio los eventos nuevos.
   */
  const epoch = randomUUID().slice(0, 8);

  /** Interpreta Last-Event-ID / ?after. Devuelve el seq a partir del cual reponer, o undefined. */
  const resumeFrom = (tenantId: string, header: string | undefined, query: string | undefined): number | undefined => {
    let seq: number | undefined;
    if (header !== undefined) {
      const m = /^([0-9a-f]+)\.(\d+)$/.exec(header.trim());
      // Sin epoca o con otra epoca: viene de otro proceso, se trata como conexion nueva.
      if (m && m[1] === epoch) seq = Number(m[2]);
    } else if (query !== undefined && /^\d+$/.test(query)) {
      seq = Number(query);
    }
    if (seq === undefined) return undefined;
    const buffered = bus.recent(tenantId);
    const latest = buffered[buffered.length - 1]?.seq ?? 0;
    // Un seq por delante del actual no puede ser de este proceso.
    return seq > latest ? undefined : seq;
  };

  app.get('/api/events', (req: FastifyRequest, reply: FastifyReply) => {
    const tenantId = tenantOf(req);
    const q = req.query as { after?: string };
    const header = req.headers['last-event-id'];
    const after = resumeFrom(tenantId, typeof header === 'string' ? header : undefined, q.after);

    // Con hijack las cabeceras de CORS ya fijadas deben copiarse a mano.
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      ...reply.getHeaders(),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    } as Record<string, string>);
    res.write('retry: 3000\n\n');

    let lastSeq = after ?? 0;
    const send = (e: { seq: number }) => {
      if (e.seq <= lastSeq) return;
      lastSeq = e.seq;
      res.write(`id: ${epoch}.${e.seq}\ndata: ${JSON.stringify(e)}\n\n`);
    };

    // Suscribirse antes de reponer evita perder eventos; send deduplica por seq.
    const unsubscribe = bus.subscribe(tenantId, send);
    if (after !== undefined) {
      const missed = bus.recent(tenantId, after);
      // Si el primer evento pendiente ya salio del buffer, se pide al cliente que recargue el estado.
      const first = missed[0];
      if (first && first.seq > after + 1) res.write('event: resync\ndata: {}\n\n');
      for (const e of missed) send(e);
    }

    const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), KEEPALIVE_MS);
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(keepAlive);
      unsubscribe();
    };
    req.raw.on('close', cleanup);
    res.on('close', cleanup);
  });

  return app;
}
