import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActionDef, ActionRun, Agent, OfficeEventPayload } from '@agentic-office/shared';
import { buildApp } from '../src/api/index';
import type { Connector, Store, Engine, EventBus } from '../src/contracts';
import { createEventBus } from '../src/events/index';

class CodedError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const T = 'tenant-1';

function makeStore() {
  const agents = new Map<string, Agent>();
  const actions = new Map<string, ActionDef>();
  let n = 0;
  const now = () => new Date().toISOString();
  agents.set('ceo', {
    id: 'ceo', tenantId: T, key: 'ceo', name: 'CEO', role: 'ceo', area: 'Direccion', description: '',
    defaultModel: 'opus', color: '#112233', enabled: true, createdAt: now(),
  });
  const store = {
    init() {},
    getDefaultTenant: () => ({ id: T, name: 'Demo' }),
    listAgents: () => [...agents.values()],
    getAgent: (_t: string, id: string) => agents.get(id) ?? null,
    createAgent(_t: string, input: any) {
      if ([...agents.values()].some((a) => a.key === input.key)) throw new CodedError('conflict', 'clave duplicada');
      const a: Agent = { ...input, id: `a${++n}`, tenantId: T, role: 'area', createdAt: now() };
      agents.set(a.id, a);
      return a;
    },
    updateAgent(_t: string, id: string, patch: any) {
      const a = agents.get(id);
      if (!a) throw new CodedError('not_found', 'no existe');
      const u = { ...a, ...patch };
      agents.set(id, u);
      return u;
    },
    deleteAgent: (_t: string, id: string) => void agents.delete(id),
    listActions: () => [...actions.values()],
    getAction: (_t: string, id: string) => actions.get(id) ?? null,
    createAction(_t: string, input: any) {
      const a: ActionDef = { ...input, id: `x${++n}`, tenantId: T, createdAt: now() };
      actions.set(a.id, a);
      return a;
    },
    updateAction(_t: string, id: string, patch: any) {
      const u = { ...actions.get(id)!, ...patch };
      actions.set(id, u);
      return u;
    },
    deleteAction: (_t: string, id: string) => void actions.delete(id),
    listRootTasks: () => [],
    getTaskTree: () => null,
    listActionRuns: () => [] as ActionRun[],
  };
  return store as unknown as Store;
}

function makeApp(realBus?: EventBus) {
  const events: OfficeEventPayload[] = [];
  const bus = realBus ?? ({
    publish: (_t: string, p: OfficeEventPayload) => (events.push(p), { ...p, seq: events.length, ts: '' }),
    subscribe: () => () => {},
    recent: () => [],
  } as unknown as EventBus);
  const engine = {
    submitRequest: (_t: string, text: string) => ({ task: { id: 'r1', title: text }, children: [], actionRuns: [] }),
    resolveApproval: async (_t: string, id: string, approved: boolean) => {
      if (id === 'missing') throw new CodedError('not_found', 'no existe');
      if (id === 'done') throw new CodedError('conflict', 'ya resuelta');
      return { id, status: approved ? 'succeeded' : 'rejected' };
    },
    agentStatuses: () => ({}),
  } as unknown as Engine;
  const webhook: Connector = {
    info: { key: 'webhook', name: 'Webhook', description: '', maturity: 'ready', configFields: [] },
    validateConfig: (c) => (typeof c.url === 'string' ? [] : ['url requerida']),
    execute: async () => ({ ok: true, output: null, simulated: false }),
  };
  const connectors = { list: () => [webhook.info], get: (k: string) => (k === 'webhook' ? webhook : null) };
  const app = buildApp({
    store: makeStore(), bus, engine, connectors,
    llm: { mode: 'mock' } as never,
    config: { port: 0, dbPath: ':memory:', llmMode: 'mock', models: { opus: 'o', sonnet: 's' }, mockStepDelayMs: 0 },
  });
  return { app, events };
}

const agentBody = { key: 'legal', name: 'Legal', area: 'Legal', description: 'x', defaultModel: 'sonnet', color: '#aabbcc' };
const actionBody = (agentId: string) => ({
  agentId, key: 'send_notice', name: 'Enviar', description: 'envia', params: [], connector: 'webhook',
  connectorConfig: { url: 'http://x' }, requiresApproval: false, enabled: true,
});

describe('API', () => {
  let ctx: ReturnType<typeof makeApp>;
  beforeEach(() => {
    ctx = makeApp();
  });
  const call = (method: any, url: string, payload?: unknown) => ctx.app.inject({ method, url, payload: payload as any });

  it('health y state', async () => {
    expect((await call('GET', '/api/health')).json()).toMatchObject({ ok: true, llmMode: 'mock' });
    const s = (await call('GET', '/api/state')).json();
    expect(s.tenant.id).toBe(T);
    expect(s.agents).toHaveLength(1);
  });

  it('crea agente, publica config.changed y rechaza clave duplicada con 409', async () => {
    const r = await call('POST', '/api/agents', agentBody);
    expect(r.statusCode).toBe(201);
    expect(ctx.events).toContainEqual({ type: 'config.changed' });
    expect((await call('POST', '/api/agents', agentBody)).statusCode).toBe(409);
  });

  it('valida agentes: clave, color y JSON roto dan 400', async () => {
    expect((await call('POST', '/api/agents', { ...agentBody, key: 'Mal Clave' })).statusCode).toBe(400);
    const bad = await call('POST', '/api/agents', { ...agentBody, color: 'rojo' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBeTruthy();
    const broken = await ctx.app.inject({ method: 'POST', url: '/api/agents', payload: '{x', headers: { 'content-type': 'application/json' } });
    expect(broken.statusCode).toBe(400);
  });

  it('el CEO se edita (nombre/color) pero no se borra ni cambia de clave', async () => {
    expect((await call('PATCH', '/api/agents/ceo', { name: 'Jefa', color: '#ffffff' })).json().name).toBe('Jefa');
    expect((await call('PATCH', '/api/agents/ceo', { key: 'otro' })).statusCode).toBe(403);
    expect((await call('DELETE', '/api/agents/ceo')).statusCode).toBe(403);
    expect((await call('PATCH', '/api/agents/nope', { name: 'x' })).statusCode).toBe(404);
  });

  it('borra agentes de area', async () => {
    const a = (await call('POST', '/api/agents', agentBody)).json();
    expect((await call('DELETE', `/api/agents/${a.id}`)).statusCode).toBe(204);
  });

  it('CRUD de acciones con validaciones', async () => {
    const a = (await call('POST', '/api/agents', agentBody)).json();
    const created = await call('POST', '/api/actions', actionBody(a.id));
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect((await call('PATCH', `/api/actions/${id}`, { requiresApproval: true })).json().requiresApproval).toBe(true);
    expect((await call('DELETE', `/api/actions/${id}`)).statusCode).toBe(204);
    expect((await call('DELETE', `/api/actions/${id}`)).statusCode).toBe(404);
  });

  it('rechaza acciones invalidas', async () => {
    const a = (await call('POST', '/api/agents', agentBody)).json();
    const p = (params: unknown) => call('POST', '/api/actions', { ...actionBody(a.id), params });
    const dup = [
      { name: 'q', type: 'string', description: '', required: true },
      { name: 'q', type: 'number', description: '', required: false },
    ];
    expect((await p(dup)).statusCode).toBe(400);
    expect((await p([{ name: 'q', type: 'number', description: '', required: true, enum: ['a'] }])).statusCode).toBe(400);
    expect((await call('POST', '/api/actions', { ...actionBody(a.id), key: 'Bad-Key' })).statusCode).toBe(400);
    expect((await call('POST', '/api/actions', { ...actionBody(a.id), connector: 'nada' })).statusCode).toBe(400);
    expect((await call('POST', '/api/actions', { ...actionBody(a.id), connectorConfig: {} })).statusCode).toBe(400);
    expect((await call('POST', '/api/actions', actionBody('inexistente'))).statusCode).toBe(400);
    expect((await call('POST', '/api/actions', actionBody('ceo'))).statusCode).toBe(400);
  });

  it('solicitudes: valida texto y devuelve 201', async () => {
    expect((await call('POST', '/api/requests', { text: '   ' })).statusCode).toBe(400);
    const r = await call('POST', '/api/requests', { text: 'hola' });
    expect(r.statusCode).toBe(201);
    expect(r.json().task.id).toBe('r1');
  });

  it('tareas: 404 si no existe', async () => {
    expect((await call('GET', '/api/tasks/zzz')).statusCode).toBe(404);
    expect((await call('GET', '/api/tasks')).json()).toEqual([]);
  });

  it('aprobaciones: mapea errores del motor', async () => {
    expect((await call('POST', '/api/action-runs/r1/approve')).json().status).toBe('succeeded');
    expect((await call('POST', '/api/action-runs/r1/reject', { note: 'no' })).json().status).toBe('rejected');
    expect((await call('POST', '/api/action-runs/missing/approve')).statusCode).toBe(404);
    expect((await call('POST', '/api/action-runs/done/approve')).statusCode).toBe(409);
  });

  it('ruta /api desconocida da 404 JSON', async () => {
    const r = await call('GET', '/api/nada');
    expect(r.statusCode).toBe(404);
    expect(r.json().error).toBeTruthy();
  });
});

describe('CORS sin autenticacion', () => {
  const { app } = makeApp();
  const inject = (method: any, url: string, origin?: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as any, headers: origin ? { origin } : {} });

  it('no refleja origenes ajenos en el preflight', async () => {
    const evil = await app.inject({
      method: 'OPTIONS', url: '/api/agents',
      headers: { origin: 'https://malicioso.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    });
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    const dev = await app.inject({
      method: 'OPTIONS', url: '/api/agents',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' },
    });
    expect(dev.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('rechaza con 403 las peticiones que modifican datos desde otro origen (incluido un POST simple)', async () => {
    expect((await inject('POST', '/api/action-runs/r1/approve', 'https://malicioso.example')).statusCode).toBe(403);
    expect((await inject('DELETE', '/api/agents/a1', 'https://malicioso.example')).statusCode).toBe(403);
    expect((await inject('POST', '/api/action-runs/r1/approve', 'http://localhost:5173')).statusCode).toBe(200);
    // Mismo origen (web servida por el propio servidor) y clientes sin Origin (curl, tests).
    const same = await app.inject({ method: 'POST', url: '/api/action-runs/r1/approve', headers: { origin: 'http://api.local:8787', host: 'api.local:8787' } });
    expect(same.statusCode).toBe(200);
    expect((await inject('POST', '/api/action-runs/r1/approve')).statusCode).toBe(200);
    expect((await inject('GET', '/api/health', 'https://malicioso.example')).headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('SSE /api/events', () => {
  let close: (() => Promise<void>) | null = null;
  afterEach(async () => {
    await close?.();
    close = null;
  });

  async function listen(bus: EventBus) {
    const { app } = makeApp(bus);
    await app.listen({ port: 0, host: '127.0.0.1' });
    close = () => app.close();
    return (app.server.address() as AddressInfo).port;
  }

  /** Abre el flujo, publica eventos y devuelve el texto SSE recibido. */
  function read(port: number, headers: Record<string, string>, publish: () => void, path = '/api/events') {
    return new Promise<string>((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path, headers }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        setTimeout(publish, 30);
        setTimeout(() => {
          req.destroy();
          resolve(data);
        }, 120);
      });
      req.on('error', reject);
      req.end();
    });
  }
  const ids = (raw: string) => [...raw.matchAll(/^id: (.+)$/gm)].map((m) => m[1] as string);

  it('tras un reinicio, un Last-Event-ID antiguo no descarta los eventos nuevos', async () => {
    const bus = createEventBus(); // proceso nuevo: seq vuelve a empezar
    const port = await listen(bus);
    const raw = await read(port, { 'last-event-id': '50' }, () => {
      for (let i = 0; i < 5; i++) bus.publish(T, { type: 'config.changed' });
    });
    expect(ids(raw)).toHaveLength(5);
    // Tambien con un id de otra epoca en el formato actual, aunque su seq sea menor que el actual.
    const raw2 = await read(port, { 'last-event-id': 'deadbeef.2' }, () => bus.publish(T, { type: 'config.changed' }));
    expect(ids(raw2)).toHaveLength(1);
  });

  it('repone solo lo pendiente con un Last-Event-ID de la epoca actual', async () => {
    const bus = createEventBus();
    const port = await listen(bus);
    const first = await read(port, {}, () => {
      bus.publish(T, { type: 'config.changed' });
      bus.publish(T, { type: 'config.changed' });
    });
    const [firstId] = ids(first);
    expect(firstId).toMatch(/^[0-9a-f]+\.1$/);
    const raw = await read(port, { 'last-event-id': firstId! }, () => bus.publish(T, { type: 'config.changed' }));
    expect(ids(raw).map((id) => id.split('.')[1])).toEqual(['2', '3']);
    expect(raw).not.toContain('resync');
  });

  it('avisa con resync cuando lo pedido ya salio del buffer', async () => {
    const bus = createEventBus();
    for (let i = 0; i < 600; i++) bus.publish(T, { type: 'config.changed' });
    const port = await listen(bus);
    const raw = await read(port, {}, () => {}, '/api/events?after=10');
    expect(raw).toContain('event: resync');
    expect(ids(raw)).toHaveLength(500);
  });
});

describe('errores de validacion en espanol', () => {
  it('usa el nombre visible del campo y mensajes en espanol', async () => {
    const { app } = makeApp();
    const r = await app.inject({ method: 'POST', url: '/api/agents', payload: { ...agentBody, name: '   ', area: '  ' } });
    expect(r.statusCode).toBe(400);
    const body = r.json();
    expect(body.error).toBe('Datos inválidos');
    expect(body.details).toEqual(
      expect.arrayContaining([
        { path: 'name', field: 'Nombre', message: 'es obligatorio' },
        { path: 'area', field: 'Área', message: 'es obligatorio' },
      ]),
    );
    const a = (await app.inject({ method: 'POST', url: '/api/agents', payload: agentBody })).json();
    const dup = await app.inject({
      method: 'POST', url: '/api/actions',
      payload: { ...actionBody(a.id), params: [1, 2].map(() => ({ name: 'x', type: 'string', description: '', required: true })) },
    });
    expect(dup.json().details[0]).toMatchObject({ field: 'Parámetros', message: 'los parámetros deben tener nombres únicos' });
    const big = await app.inject({ method: 'POST', url: '/api/requests', payload: { text: 'x'.repeat(5000) } });
    expect(big.json().details[0].message).toMatch(/[Dd]emasiado grande/);
  });
});
