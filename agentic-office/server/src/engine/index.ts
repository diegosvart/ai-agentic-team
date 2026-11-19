import type {
  ActionDef,
  ActionRun,
  ActionRunStatus,
  Agent,
  AgentStatus,
  ModelTier,
  OfficeEventPayload,
  Task,
  TaskStatus,
  TaskTree,
} from '@agentic-office/shared';
import type {
  AgentContext,
  AgentStatusSnapshot,
  Config,
  ConnectorRegistry,
  Engine,
  EventBus,
  LLMProvider,
  Store,
  ToolCall,
  ToolResult,
} from '../contracts';
import { validateParams } from './validation';
import { createKeyedQueue } from './queue';
import { loadCheckpoint, saveCheckpoint, type CheckpointCall } from './checkpoint';

export { validateParams } from './validation';

export type EngineErrorCode = 'not_found' | 'conflict' | 'invalid';

export class EngineError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export const MAX_TURNS = 8;
const TERMINAL: readonly TaskStatus[] = ['completed', 'failed'];
const ACTIVE: readonly TaskStatus[] = ['queued', 'planning', 'running'];
const RESTART_ERROR = 'Interrumpida por un reinicio del servidor.';
const MAX_TOOL_RESULT_CHARS = 10_000;

type RunMode = { kind: 'start' } | { kind: 'resume'; conversation: unknown[]; turns: number };

export interface EngineDeps {
  store: Store;
  bus: EventBus;
  llm: LLMProvider;
  connectors: ConnectorRegistry;
  config: Config;
}

const now = () => new Date().toISOString();
const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));
const short = (text: string, max = 60) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);
const isTerminal = (s: TaskStatus) => TERMINAL.includes(s);

function titleOf(text: string): string {
  const firstLine = text.split('\n')[0]?.trim() ?? '';
  return short(firstLine || text.trim(), 80);
}

function stringifyResult(value: unknown): string {
  let s: string;
  if (typeof value === 'string') s = value;
  else {
    try {
      s = JSON.stringify(value ?? null) ?? 'null';
    } catch {
      s = String(value);
    }
  }
  return s.length > MAX_TOOL_RESULT_CHARS ? `${s.slice(0, MAX_TOOL_RESULT_CHARS)}…[truncado]` : s;
}

/** Resultado para el modelo a partir de un ActionRun resuelto; null si sigue pendiente. */
function toolResultFromRun(run: ActionRun, toolCallId: string): ToolResult | null {
  switch (run.status) {
    case 'succeeded': {
      const result = stringifyResult(run.result);
      // La nota escrita al aprobar llega al agente junto con el resultado.
      return { toolCallId, content: run.note ? `Nota del usuario al aprobar: ${run.note}\nResultado: ${result}` : result, isError: false };
    }
    case 'failed':
      return {
        toolCallId,
        content: `Error al ejecutar "${run.actionName}": ${run.error ?? 'error desconocido'}`,
        isError: true,
      };
    case 'rejected':
      return { toolCallId, content: run.error ?? `El usuario rechazo la accion "${run.actionName}".`, isError: true };
    default:
      return null;
  }
}

export function createEngine(deps: EngineDeps): Engine {
  const { store, bus, llm, connectors, config } = deps;

  const statuses = new Map<string, Map<string, AgentStatusSnapshot>>();
  const queue = createKeyedQueue();
  /** Raices cuya sintesis ya se lanzo en este proceso (garantiza una sola sintesis). */
  const synthesizing = new Set<string>();

  let active = 0;
  let idleWaiters: Array<() => void> = [];

  /** Ejecuta una orquestacion en segundo plano: nunca deja un rechazo sin capturar. */
  function track(fn: () => Promise<void>): void {
    active++;
    let p: Promise<void>;
    try {
      p = fn();
    } catch (err) {
      p = Promise.reject(err);
    }
    void p
      .catch((err) => console.error('[engine] error no controlado:', err))
      .finally(() => {
        active--;
        if (active === 0) {
          const waiters = idleWaiters;
          idleWaiters = [];
          for (const w of waiters) w();
        }
      });
  }

  const qkey = (tenantId: string, agentId: string) => `${tenantId}:${agentId}`;
  const modelLabel = (tier: ModelTier) => (llm.mode === 'mock' ? 'mock' : config.models[tier]);

  // ---------- publicacion de cambios ----------

  const publish = (tenantId: string, payload: OfficeEventPayload) => bus.publish(tenantId, payload);

  function setTask(tenantId: string, id: string, patch: Parameters<Store['updateTask']>[2]): Task {
    const task = store.updateTask(tenantId, id, patch);
    publish(tenantId, { type: 'task.updated', task });
    return task;
  }

  function failTask(tenantId: string, id: string, error: string): void {
    try {
      setTask(tenantId, id, { status: 'failed', error });
    } catch (err) {
      console.error('[engine] no se pudo marcar la tarea como fallida:', err);
    }
  }

  function setRun(tenantId: string, id: string, patch: Parameters<Store['updateActionRun']>[2]): ActionRun {
    const run = store.updateActionRun(tenantId, id, patch);
    publish(tenantId, { type: 'action.updated', run });
    return run;
  }

  function setStatus(
    tenantId: string,
    agentId: string,
    status: AgentStatus,
    taskId: string | null = null,
    detail: string | null = null,
  ): void {
    let map = statuses.get(tenantId);
    if (!map) statuses.set(tenantId, (map = new Map()));
    map.set(agentId, { status, taskId, detail });
    publish(tenantId, { type: 'agent.status', agentId, status, taskId, detail });
  }

  function say(tenantId: string, agentId: string, text: string): void {
    publish(tenantId, { type: 'agent.say', agentId, text: short(text) });
  }

  /** Estado de reposo: waiting_approval si el agente tiene aprobaciones pendientes, si no idle. */
  function settleAgent(tenantId: string, agentId: string): void {
    if (queue.isBusy(qkey(tenantId, agentId))) return;
    try {
      const pending = store
        .listActionRuns(tenantId, { status: 'pending_approval' })
        .find((r) => r.agentId === agentId);
      if (pending) {
        setStatus(tenantId, agentId, 'waiting_approval', pending.taskId, `Esperando aprobacion: ${pending.actionName}`);
      } else {
        setStatus(tenantId, agentId, 'idle');
      }
    } catch (err) {
      console.error('[engine] no se pudo actualizar el estado del agente:', err);
    }
  }

  // ---------- ejecucion de acciones ----------

  async function executeRun(
    tenantId: string,
    run: ActionRun,
    action: ActionDef | null,
    agent: Agent | null,
    task: Task | null,
  ): Promise<ActionRun> {
    try {
      if (!action) throw new Error('La accion ya no existe.');
      if (!agent || !task) throw new Error('La tarea o el agente ya no existen.');
      const connector = connectors.get(action.connector);
      if (!connector) throw new Error(`El conector "${action.connector}" no esta disponible.`);
      const res = await connector.execute({ action, params: run.params, agent, task });
      if (res.ok) {
        return setRun(tenantId, run.id, { status: 'succeeded', result: res.output ?? null, error: null, resolvedAt: now() });
      }
      return setRun(tenantId, run.id, {
        status: 'failed',
        result: res.output ?? null,
        error: res.error ?? 'El conector devolvio un error.',
        resolvedAt: now(),
      });
    } catch (err) {
      return setRun(tenantId, run.id, { status: 'failed', error: errMsg(err), resolvedAt: now() });
    }
  }

  // ---------- bucle del agente de area ----------

  /** Encola la subtarea en la cola de su agente. Nunca rechaza. */
  function runChild(tenantId: string, taskId: string, mode: RunMode): Promise<void> {
    const initial = store.getTask(tenantId, taskId);
    if (!initial) return Promise.resolve();
    const key = qkey(tenantId, initial.agentId);
    return queue
      .run(key, async () => {
        try {
          await agentLoop(tenantId, taskId, mode);
        } catch (err) {
          failTask(tenantId, taskId, errMsg(err));
          say(tenantId, initial.agentId, 'No pude terminar la tarea.');
        }
      })
      .catch((err) => console.error('[engine] error en la cola del agente:', err))
      .finally(() => {
        settleAgent(tenantId, initial.agentId);
        try {
          refreshRoot(tenantId, initial.parentId);
        } catch (err) {
          console.error('[engine] error al actualizar la raiz:', err);
        }
      });
  }

  async function agentLoop(tenantId: string, taskId: string, mode: RunMode): Promise<void> {
    const task = store.getTask(tenantId, taskId);
    if (!task || isTerminal(task.status)) return;
    const agent = store.getAgent(tenantId, task.agentId);
    if (!agent) throw new Error('El agente asignado ya no existe.');
    const ctx: AgentContext = {
      agent,
      actions: store.listActions(tenantId, agent.id).filter((a) => a.enabled),
    };
    const tier: ModelTier = task.complexity === 'complex' ? 'opus' : agent.defaultModel;
    const model = config.models[tier];

    let conversation: unknown[];
    let turns: number;
    let current: Task;
    if (mode.kind === 'start') {
      current = setTask(tenantId, taskId, { status: 'running', model: modelLabel(tier), error: null });
      say(tenantId, agent.id, 'Me pongo con ello.');
      const root = task.parentId ? store.getTask(tenantId, task.parentId) : null;
      conversation = llm.startConversation({ ctx, task: current, rootRequest: root?.instructions ?? task.instructions });
      turns = 0;
    } else {
      current = setTask(tenantId, taskId, { status: 'running' });
      say(tenantId, agent.id, 'Retomo la tarea.');
      conversation = mode.conversation;
      turns = mode.turns;
    }

    while (turns < MAX_TURNS) {
      setStatus(tenantId, agent.id, 'thinking', taskId, current.title);
      const step = await llm.step({ model, ctx, conversation });
      turns++;
      conversation = step.conversation;

      if (step.toolCalls.length === 0) {
        const text = step.finalText?.trim() || 'Tarea finalizada sin comentarios.';
        setTask(tenantId, taskId, { status: 'completed', result: text, error: null });
        say(tenantId, agent.id, 'Tarea terminada.');
        return;
      }

      const calls: CheckpointCall[] = [];
      const deferred: Array<{ entry: CheckpointCall; action: ActionDef }> = [];
      for (const call of step.toolCalls) {
        const entry: CheckpointCall = { call, runId: null, local: null };
        calls.push(entry);
        const action = ctx.actions.find((a) => a.key === call.name);
        if (!action) {
          entry.local = {
            toolCallId: call.id,
            content: `La accion "${call.name}" no existe o esta deshabilitada para este agente.`,
            isError: true,
          };
          continue;
        }
        const errors = validateParams(action.params, call.input);
        if (errors.length > 0) {
          entry.local = {
            toolCallId: call.id,
            content: `Parametros invalidos para "${action.key}": ${errors.join(' ')} Corrige la llamada.`,
            isError: true,
          };
          continue;
        }
        if (action.requiresApproval) {
          deferred.push({ entry, action });
          continue;
        }
        // Sin aprobacion: se ejecuta ya.
        setStatus(tenantId, agent.id, 'working', taskId, action.name);
        say(tenantId, agent.id, `Ejecuto: ${action.name}`);
        const run = createRun(tenantId, taskId, agent.id, action, call, 'running');
        entry.runId = run.id;
        const done = await executeRun(tenantId, run, action, agent, store.getTask(tenantId, taskId));
        if (done.status === 'failed') say(tenantId, agent.id, `Fallo: ${action.name}`);
      }

      if (deferred.length > 0) {
        // Pausa. Todo esto es sincrono: nadie puede resolver una aprobacion antes de que exista el checkpoint.
        for (const d of deferred) {
          d.entry.runId = createRun(tenantId, taskId, agent.id, d.action, d.entry.call, 'pending_approval').id;
        }
        saveCheckpoint(store, tenantId, taskId, { turns, conversation, calls });
        setTask(tenantId, taskId, { status: 'waiting_approval' });
        const names = deferred.map((d) => d.action.name).join(', ');
        setStatus(tenantId, agent.id, 'waiting_approval', taskId, `Esperando aprobacion: ${names}`);
        say(tenantId, agent.id, 'Necesito tu aprobacion para seguir.');
        return;
      }

      const results = calls.map((entry) => resultOf(tenantId, entry) as ToolResult);
      conversation = llm.addToolResults(conversation, results);
    }

    throw new Error(`Se alcanzo el limite de ${MAX_TURNS} turnos sin una respuesta final.`);
  }

  function createRun(
    tenantId: string,
    taskId: string,
    agentId: string,
    action: ActionDef,
    call: ToolCall,
    status: ActionRunStatus,
  ): ActionRun {
    const run = store.createActionRun(tenantId, {
      taskId,
      agentId,
      action,
      params: call.input,
      status,
      toolCallId: call.id,
    });
    publish(tenantId, { type: 'action.updated', run });
    return run;
  }

  /** Resultado de una llamada del turno, leyendo del Store lo ejecutado. null = aun pendiente. */
  function resultOf(tenantId: string, entry: CheckpointCall): ToolResult | null {
    if (entry.local) return entry.local;
    const run = entry.runId ? store.getActionRun(tenantId, entry.runId) : null;
    if (!run) {
      return { toolCallId: entry.call.id, content: 'No se encontro el registro de la ejecucion.', isError: true };
    }
    const toolCallId = store.getActionRunToolCallId(tenantId, run.id) ?? entry.call.id;
    return toolResultFromRun(run, toolCallId);
  }

  /**
   * Si todas las llamadas del turno pausado estan resueltas, consume el checkpoint
   * (de forma sincrona, para que solo un llamador reanude) y relanza la subtarea.
   */
  function tryResume(tenantId: string, taskId: string): boolean {
    const task = store.getTask(tenantId, taskId);
    if (!task || task.status !== 'waiting_approval') return false;
    const cp = loadCheckpoint(store, tenantId, taskId);
    if (!cp || cp.calls.length === 0) return false;

    const results: ToolResult[] = [];
    for (const entry of cp.calls) {
      const r = resultOf(tenantId, entry);
      if (!r) return false;
      results.push(r);
    }

    try {
      const conversation = llm.addToolResults(cp.conversation, results);
      saveCheckpoint(store, tenantId, taskId, { turns: cp.turns, conversation, calls: [] });
      setTask(tenantId, taskId, { status: 'queued' });
      refreshRoot(tenantId, task.parentId);
      track(() => runChild(tenantId, taskId, { kind: 'resume', conversation, turns: cp.turns }));
      return true;
    } catch (err) {
      failTask(tenantId, taskId, `No se pudo reanudar la tarea: ${errMsg(err)}`);
      settleAgent(tenantId, task.agentId);
      refreshRoot(tenantId, task.parentId);
      return false;
    }
  }

  // ---------- CEO: plan, estado de la raiz y sintesis ----------

  async function orchestrate(tenantId: string, rootId: string): Promise<void> {
    const root = store.getTask(tenantId, rootId);
    if (!root) return;
    const ceo = store.getAgent(tenantId, root.agentId);
    try {
      if (!ceo) throw new Error('El agente CEO ya no existe.');
      const team: AgentContext[] = store
        .listAgents(tenantId)
        .filter((a) => a.role === 'area' && a.enabled)
        .map((agent) => ({ agent, actions: store.listActions(tenantId, agent.id).filter((x) => x.enabled) }));

      const ceoKey = qkey(tenantId, ceo.id);
      const plan = await queue.run(ceoKey, async () => {
        setTask(tenantId, rootId, { status: 'planning', model: modelLabel('opus') });
        setStatus(tenantId, ceo.id, 'thinking', rootId, 'Planificando la solicitud');
        say(tenantId, ceo.id, 'Analizo la solicitud...');
        return llm.plan({ model: config.models.opus, ceo, team, request: root.instructions });
      });

      const byKey = new Map(team.map((c) => [c.agent.key, c.agent]));
      const valid = plan.subtasks.filter((s) => byKey.has(s.agentKey));
      const discarded = plan.subtasks.length - valid.length;

      if (valid.length === 0) {
        const answer = plan.directAnswer?.trim() || (discarded === 0 ? plan.summary.trim() : '');
        if (!answer) {
          throw new Error(
            discarded > 0
              ? 'El plan asigno las subtareas a agentes inexistentes o deshabilitados.'
              : 'El CEO no devolvio subtareas ni una respuesta.',
          );
        }
        setTask(tenantId, rootId, { status: 'completed', result: answer, error: null });
        say(tenantId, ceo.id, 'Listo, respondi directamente.');
        settleAgent(tenantId, ceo.id);
        return;
      }

      setTask(tenantId, rootId, { status: 'running' });
      setStatus(tenantId, ceo.id, 'delegating', rootId, `Delegando ${valid.length} subtarea(s)`);
      say(tenantId, ceo.id, valid.length === 1 ? 'Delego esto a mi equipo.' : `Reparto ${valid.length} tareas al equipo.`);

      const children = valid.map((s) => {
        const agent = byKey.get(s.agentKey) as Agent;
        const child = store.createTask(tenantId, {
          parentId: rootId,
          agentId: agent.id,
          title: s.title,
          instructions: s.instructions,
          complexity: s.complexity === 'complex' ? 'complex' : 'simple',
        });
        publish(tenantId, { type: 'task.created', task: child });
        publish(tenantId, { type: 'delegation', fromAgentId: ceo.id, toAgentId: agent.id, task: child });
        return child;
      });
      settleAgent(tenantId, ceo.id);

      // Agentes distintos en paralelo; el mismo agente en serie (lo garantiza su cola).
      await Promise.all(children.map((c) => runChild(tenantId, c.id, { kind: 'start' })));
    } catch (err) {
      failTask(tenantId, rootId, `No se pudo completar la solicitud: ${errMsg(err)}`);
      if (ceo) {
        say(tenantId, ceo.id, 'No pude procesar la solicitud.');
        settleAgent(tenantId, ceo.id);
      }
    }
  }

  /** Recalcula el estado de la raiz a partir de sus hijas y lanza la sintesis una sola vez. */
  function refreshRoot(tenantId: string, rootId: string | null): void {
    if (!rootId) return;
    const root = store.getTask(tenantId, rootId);
    if (!root || isTerminal(root.status) || synthesizing.has(rootId)) return;
    const children = store.listChildTasks(tenantId, rootId);
    if (children.length === 0) return;

    if (children.some((c) => ACTIVE.includes(c.status))) {
      if (root.status !== 'running') setTask(tenantId, rootId, { status: 'running' });
      return;
    }
    if (children.some((c) => c.status === 'waiting_approval')) {
      if (root.status !== 'waiting_approval') setTask(tenantId, rootId, { status: 'waiting_approval' });
      return;
    }
    synthesizing.add(rootId);
    if (root.status !== 'running') setTask(tenantId, rootId, { status: 'running' });
    track(() => synthesize(tenantId, rootId));
  }

  async function synthesize(tenantId: string, rootId: string): Promise<void> {
    const root = store.getTask(tenantId, rootId);
    if (!root) return;
    const ceo = store.getAgent(tenantId, root.agentId);
    try {
      const children = store.listChildTasks(tenantId, rootId);
      const failed = children.filter((c) => c.status === 'failed');
      if (failed.length === children.length) {
        const detail = failed.map((c) => `${c.title}: ${c.error ?? 'error desconocido'}`).join('; ');
        failTask(tenantId, rootId, `Todas las subtareas fallaron. ${detail}`);
        if (ceo) say(tenantId, ceo.id, 'No pudimos completar la solicitud.');
        return;
      }
      if (!ceo) throw new Error('El agente CEO ya no existe.');
      const results = children.flatMap((task) => {
        const agent = store.getAgent(tenantId, task.agentId);
        return agent ? [{ agent, task }] : [];
      });
      const text = await queue.run(qkey(tenantId, ceo.id), async () => {
        setStatus(tenantId, ceo.id, 'thinking', rootId, 'Redactando la respuesta final');
        say(tenantId, ceo.id, 'Reviso los resultados del equipo.');
        return llm.synthesize({ model: config.models.opus, ceo, request: root.instructions, results });
      });
      setTask(tenantId, rootId, { status: 'completed', result: text, error: null });
      say(tenantId, ceo.id, 'Respuesta final lista.');
    } catch (err) {
      failTask(tenantId, rootId, `Error al redactar la respuesta final: ${errMsg(err)}`);
    } finally {
      synthesizing.delete(rootId);
      if (ceo) settleAgent(tenantId, ceo.id);
    }
  }

  // ---------- API publica ----------

  return {
    submitRequest(tenantId: string, text: string): TaskTree {
      const request = text.trim();
      if (!request) throw new EngineError('invalid', 'La solicitud esta vacia.');
      const ceo = store.listAgents(tenantId).find((a) => a.role === 'ceo');
      if (!ceo) throw new EngineError('not_found', 'No hay un agente CEO configurado.');
      const root = store.createTask(tenantId, {
        parentId: null,
        agentId: ceo.id,
        title: titleOf(request),
        instructions: request,
        complexity: 'complex',
      });
      publish(tenantId, { type: 'task.created', task: root });
      track(() => orchestrate(tenantId, root.id));
      return store.getTaskTree(tenantId, root.id) ?? { task: root, children: [], actionRuns: [] };
    },

    async resolveApproval(tenantId: string, actionRunId: string, approved: boolean, note?: string): Promise<ActionRun> {
      const run = store.getActionRun(tenantId, actionRunId);
      if (!run) throw new EngineError('not_found', 'La ejecucion no existe.');
      if (run.status !== 'pending_approval') {
        throw new EngineError('conflict', `La ejecucion no esta pendiente de aprobacion (estado: ${run.status}).`);
      }
      const cleanNote = note?.trim() || null;
      let resolved: ActionRun;
      if (approved) {
        // Se reclama el run de forma sincrona: una segunda resolucion vera 'running' y dara conflicto.
        const claimed = setRun(tenantId, run.id, { status: 'running', note: cleanNote });
        say(tenantId, run.agentId, `Aprobado: ${run.actionName}`);
        resolved = await executeRun(
          tenantId,
          claimed,
          store.getAction(tenantId, run.actionId),
          store.getAgent(tenantId, run.agentId),
          store.getTask(tenantId, run.taskId),
        );
      } else {
        const error =
          `El usuario rechazo la accion "${run.actionName}".` + (cleanNote ? ` Nota del usuario: ${cleanNote}` : '');
        resolved = setRun(tenantId, run.id, { status: 'rejected', error, note: cleanNote, resolvedAt: now() });
        say(tenantId, run.agentId, 'Entendido, accion rechazada.');
      }
      if (!tryResume(tenantId, run.taskId)) settleAgent(tenantId, run.agentId);
      return resolved;
    },

    agentStatuses(tenantId: string): Record<string, AgentStatusSnapshot> {
      const map = statuses.get(tenantId);
      const out: Record<string, AgentStatusSnapshot> = {};
      for (const agent of store.listAgents(tenantId)) {
        out[agent.id] = map?.get(agent.id) ?? { status: 'idle', taskId: null, detail: null };
      }
      return out;
    },

    recover(tenantId: string): void {
      for (const run of store.listActionRuns(tenantId, { status: 'running' })) {
        setRun(tenantId, run.id, { status: 'failed', error: RESTART_ERROR, resolvedAt: now() });
      }

      const unfinished = store.listUnfinishedTasks(tenantId);
      const resumable: string[] = [];
      for (const child of unfinished.filter((t) => t.parentId !== null)) {
        const cp = child.status === 'waiting_approval' ? loadCheckpoint(store, tenantId, child.id) : null;
        if (cp && cp.calls.length > 0) {
          resumable.push(child.id);
          continue;
        }
        failTask(tenantId, child.id, RESTART_ERROR);
        // Sus aprobaciones pendientes ya no tienen a quien reanudar.
        for (const run of store.listActionRuns(tenantId, { taskId: child.id, status: 'pending_approval' })) {
          setRun(tenantId, run.id, { status: 'failed', error: RESTART_ERROR, resolvedAt: now() });
        }
      }

      for (const root of unfinished.filter((t) => t.parentId === null)) {
        const kids = store.listChildTasks(tenantId, root.id);
        if (kids.some((k) => k.status === 'waiting_approval')) {
          if (root.status !== 'waiting_approval') setTask(tenantId, root.id, { status: 'waiting_approval' });
          continue;
        }
        failTask(tenantId, root.id, RESTART_ERROR);
      }

      // Turnos cuyas aprobaciones ya quedaron resueltas (p. ej. una ejecucion interrumpida).
      for (const id of resumable) tryResume(tenantId, id);

      for (const agent of store.listAgents(tenantId)) settleAgent(tenantId, agent.id);
    },

    idle(): Promise<void> {
      if (active === 0) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
  };
}
