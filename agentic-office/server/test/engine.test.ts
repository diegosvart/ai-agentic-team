import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type {
  ActionDef,
  ActionInput,
  ActionParam,
  ActionRun,
  Agent,
  AgentInput,
  OfficeEvent,
  OfficeEventPayload,
  Task,
  Tenant,
} from '@agentic-office/shared';
import type {
  AgentStep,
  Config,
  Connector,
  ConnectorRegistry,
  ConnectorResult,
  EventBus,
  LLMProvider,
  Plan,
  Store,
  ToolCall,
  ToolResult,
} from '../src/contracts';
import { createEngine, EngineError } from '../src/engine';

// ---------------------------------------------------------------------------
// Dobles de prueba (independientes de las implementaciones reales)
// ---------------------------------------------------------------------------

const T = 'tenant-1';
const clone = <V>(v: V): V => structuredClone(v);

function createMemoryStore(): Store {
  const tenant: Tenant = { id: T, name: 'Demo' };
  const agents = new Map<string, Agent>();
  const actions = new Map<string, ActionDef>();
  const tasks = new Map<string, Task>();
  const runs = new Map<string, ActionRun & { toolCallId: string }>();
  const conversations = new Map<string, string>();
  const ts = () => new Date().toISOString();
  const stripRun = (r: ActionRun & { toolCallId: string }): ActionRun => {
    const { toolCallId: _ignored, ...rest } = r;
    return clone(rest);
  };

  return {
    init() {},
    getDefaultTenant: () => tenant,
    listAgents: (tid) => [...agents.values()].filter((a) => a.tenantId === tid).map(clone),
    getAgent: (tid, id) => {
      const a = agents.get(id);
      return a && a.tenantId === tid ? clone(a) : null;
    },
    createAgent(tid, input: AgentInput) {
      // Simplificacion del doble: la clave 'ceo' crea al CEO.
      const a: Agent = { id: randomUUID(), tenantId: tid, role: input.key === 'ceo' ? 'ceo' : 'area', createdAt: ts(), ...input };
      agents.set(a.id, a);
      return clone(a);
    },
    updateAgent(tid, id, patch) {
      const a = agents.get(id);
      if (!a || a.tenantId !== tid) throw new Error('not found');
      Object.assign(a, patch);
      return clone(a);
    },
    deleteAgent(_tid, id) {
      agents.delete(id);
    },
    listActions: (tid, agentId) =>
      [...actions.values()].filter((a) => a.tenantId === tid && (!agentId || a.agentId === agentId)).map(clone),
    getAction: (tid, id) => {
      const a = actions.get(id);
      return a && a.tenantId === tid ? clone(a) : null;
    },
    createAction(tid, input: ActionInput) {
      const a: ActionDef = { id: randomUUID(), tenantId: tid, createdAt: ts(), ...input };
      actions.set(a.id, a);
      return clone(a);
    },
    updateAction(tid, id, patch) {
      const a = actions.get(id);
      if (!a || a.tenantId !== tid) throw new Error('not found');
      Object.assign(a, patch);
      return clone(a);
    },
    deleteAction(_tid, id) {
      actions.delete(id);
    },
    createTask(tid, input) {
      const t: Task = {
        id: randomUUID(),
        tenantId: tid,
        ...input,
        model: null,
        status: 'queued',
        result: null,
        error: null,
        createdAt: ts(),
        updatedAt: ts(),
      };
      tasks.set(t.id, t);
      return clone(t);
    },
    getTask: (tid, id) => {
      const t = tasks.get(id);
      return t && t.tenantId === tid ? clone(t) : null;
    },
    updateTask(tid, id, patch) {
      const t = tasks.get(id);
      if (!t || t.tenantId !== tid) throw new Error('not found');
      Object.assign(t, patch, { updatedAt: ts() });
      return clone(t);
    },
    listRootTasks: (tid) => [...tasks.values()].filter((t) => t.tenantId === tid && !t.parentId).map(clone),
    listChildTasks: (tid, parentId) =>
      [...tasks.values()].filter((t) => t.tenantId === tid && t.parentId === parentId).map(clone),
    getTaskTree(tid, rootId) {
      const task = this.getTask(tid, rootId);
      if (!task) return null;
      const children = this.listChildTasks(tid, rootId);
      const ids = new Set([rootId, ...children.map((c) => c.id)]);
      return { task, children, actionRuns: [...runs.values()].filter((r) => ids.has(r.taskId)).map(stripRun) };
    },
    listUnfinishedTasks: (tid) =>
      [...tasks.values()]
        .filter((t) => t.tenantId === tid && t.status !== 'completed' && t.status !== 'failed')
        .map(clone),
    saveConversation(tid, taskId, conversation) {
      conversations.set(`${tid}:${taskId}`, JSON.stringify(conversation));
    },
    loadConversation(tid, taskId) {
      const raw = conversations.get(`${tid}:${taskId}`);
      return raw ? (JSON.parse(raw) as unknown[]) : null;
    },
    createActionRun(tid, input) {
      const r = {
        id: randomUUID(),
        tenantId: tid,
        taskId: input.taskId,
        agentId: input.agentId,
        actionId: input.action.id,
        actionKey: input.action.key,
        actionName: input.action.name,
        params: clone(input.params),
        status: input.status,
        result: null,
        error: null,
        note: null,
        createdAt: ts(),
        resolvedAt: null,
        toolCallId: input.toolCallId,
      };
      runs.set(r.id, r);
      return stripRun(r);
    },
    getActionRun: (tid, id) => {
      const r = runs.get(id);
      return r && r.tenantId === tid ? stripRun(r) : null;
    },
    getActionRunToolCallId: (tid, id) => {
      const r = runs.get(id);
      return r && r.tenantId === tid ? r.toolCallId : null;
    },
    updateActionRun(tid, id, patch) {
      const r = runs.get(id);
      if (!r || r.tenantId !== tid) throw new Error('not found');
      Object.assign(r, clone(patch));
      return stripRun(r);
    },
    listActionRuns: (tid, filter) =>
      [...runs.values()]
        .filter(
          (r) =>
            r.tenantId === tid &&
            (!filter?.taskId || r.taskId === filter.taskId) &&
            (!filter?.status || r.status === filter.status),
        )
        .map(stripRun),
  };
}

function createTestBus(): EventBus & { events: OfficeEvent[] } {
  const events: OfficeEvent[] = [];
  let seq = 0;
  return {
    events,
    publish(_tid: string, payload: OfficeEventPayload) {
      const e = { ...payload, seq: ++seq, ts: new Date().toISOString() } as OfficeEvent;
      events.push(e);
      return e;
    },
    subscribe: () => () => {},
    recent: () => events,
  };
}

type Msg =
  | { role: 'user'; agent: string; task: string }
  | { role: 'assistant'; calls: ToolCall[]; text: string | null }
  | { role: 'tool'; results: ToolResult[] };

type StepHandler = (agentKey: string, turn: number, conversation: Msg[]) => { calls?: ToolCall[]; text?: string };

interface ScriptedLLM extends LLMProvider {
  stepModels: Array<{ agent: string; model: string }>;
  synthCalls: number;
  planModels: string[];
}

function createScriptedLLM(opts: {
  plan: (request: string) => Plan | Promise<Plan>;
  step?: StepHandler;
  mode?: 'live' | 'mock';
}): ScriptedLLM {
  const llm: ScriptedLLM = {
    mode: opts.mode ?? 'mock',
    stepModels: [],
    synthCalls: 0,
    planModels: [],
    async plan({ model, request }) {
      llm.planModels.push(model);
      return opts.plan(request);
    },
    startConversation({ ctx, task }) {
      return [{ role: 'user', agent: ctx.agent.key, task: task.title } satisfies Msg];
    },
    async step({ model, ctx, conversation }): Promise<AgentStep> {
      llm.stepModels.push({ agent: ctx.agent.key, model });
      const conv = conversation as Msg[];
      const turn = conv.filter((m) => m.role === 'assistant').length;
      const handler: StepHandler = opts.step ?? (() => ({ text: 'hecho' }));
      const out = handler(ctx.agent.key, turn, conv);
      const calls = out.calls ?? [];
      const msg: Msg = { role: 'assistant', calls, text: out.text ?? null };
      return { conversation: [...conv, msg], toolCalls: calls, finalText: calls.length ? null : (out.text ?? null) };
    },
    addToolResults(conversation, results) {
      return [...conversation, { role: 'tool', results } satisfies Msg];
    },
    async synthesize({ results }) {
      llm.synthCalls++;
      return `FINAL: ${results.map((r) => `${r.agent.key}=${r.task.status}:${r.task.result ?? r.task.error}`).join(' | ')}`;
    },
  };
  return llm;
}

function createFakeConnector(
  impl?: (params: Record<string, unknown>) => Promise<ConnectorResult>,
): Connector & { calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    info: { key: 'fake', name: 'Falso', description: '', maturity: 'stub', configFields: [] },
    validateConfig: () => [],
    async execute({ params }) {
      calls.push(params);
      if (impl) return impl(params);
      return { ok: true, output: { echo: params }, simulated: true };
    },
  };
}

const config: Config = {
  port: 0,
  dbPath: ':memory:',
  llmMode: 'mock',
  models: { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5' },
  mockStepDelayMs: 0,
};

function seed(store: Store) {
  const base = { area: 'X', description: 'd', defaultModel: 'sonnet' as const, color: '#000000', enabled: true };
  const ceo = store.createAgent(T, { ...base, key: 'ceo', name: 'CEO', area: 'Direccion', defaultModel: 'opus' });
  const soporte = store.createAgent(T, { ...base, key: 'soporte', name: 'Soporte' });
  const marketing = store.createAgent(T, { ...base, key: 'marketing', name: 'Marketing' });
  const params: ActionParam[] = [
    { name: 'cliente', type: 'string', description: 'id', required: true },
    { name: 'monto', type: 'number', description: 'monto', required: false },
    { name: 'canal', type: 'string', description: 'canal', required: false, enum: ['email', 'sms'] },
  ];
  const mk = (agentId: string, key: string, requiresApproval: boolean, enabled = true) =>
    store.createAction(T, {
      agentId,
      key,
      name: key,
      description: 'd',
      params,
      connector: 'fake',
      connectorConfig: {},
      requiresApproval,
      enabled,
    });
  const consultar = mk(soporte.id, 'consultar', false);
  const reembolsar = mk(soporte.id, 'reembolsar', true);
  const apagada = mk(soporte.id, 'apagada', false, false);
  const publicar = mk(marketing.id, 'publicar', false);
  return { ceo, soporte, marketing, consultar, reembolsar, apagada, publicar };
}

function setupStore() {
  const store = createMemoryStore();
  return { store, ...seed(store) };
}

function setup(opts: Parameters<typeof createScriptedLLM>[0], connector = createFakeConnector()) {
  const seeded = setupStore();
  const bus = createTestBus();
  const llm = createScriptedLLM(opts);
  const connectors: ConnectorRegistry = {
    list: () => [connector.info],
    get: (k) => (k === 'fake' ? connector : null),
  };
  const engine = createEngine({ store: seeded.store, bus, llm, connectors, config });
  return { ...seeded, bus, llm, connector, connectors, engine };
}

const sub = (agentKey: string, title = `tarea ${agentKey}`, complexity: 'simple' | 'complex' = 'simple') => ({
  agentKey,
  title,
  instructions: `haz ${title}`,
  complexity,
});
const plan = (subtasks: Plan['subtasks'], directAnswer: string | null = null): Plan => ({
  summary: 'plan',
  subtasks,
  directAnswer,
});
const call = (name: string, input: Record<string, unknown>, id = `call-${name}`): ToolCall => ({ id, name, input });

function toolResults(store: Store, taskId: string): ToolResult[] {
  const data = store.loadConversation(T, taskId);
  const cp = data?.[0] as { conversation: Msg[] } | undefined;
  return (cp?.conversation ?? []).flatMap((m) => (m.role === 'tool' ? m.results : []));
}

// ---------------------------------------------------------------------------

describe('engine', () => {
  it('planifica con dos agentes, ejecuta en paralelo y sintetiza una vez', async () => {
    const ctx = setup({
      mode: 'live',
      plan: () => plan([sub('soporte', 'revisar ticket', 'complex'), sub('marketing', 'post')]),
      step: (agent, turn) =>
        turn === 0
          ? { calls: [call(agent === 'soporte' ? 'consultar' : 'publicar', { cliente: 'c1' })] }
          : { text: `listo ${agent}` },
    });
    const tree = ctx.engine.submitRequest(T, 'Atiende al cliente y publica');
    expect(tree.task.status).toBe('queued');
    expect(tree.task.agentId).toBe(ctx.ceo.id);
    await ctx.engine.idle();

    const root = ctx.store.getTask(T, tree.task.id)!;
    expect(root.status).toBe('completed');
    expect(root.model).toBe('claude-opus-5-5');
    expect(root.result).toContain('soporte=completed:listo soporte');
    expect(root.result).toContain('marketing=completed:listo marketing');
    expect(ctx.llm.synthCalls).toBe(1);
    expect(ctx.llm.planModels).toEqual(['claude-opus-5-5']);

    const children = ctx.store.listChildTasks(T, root.id);
    expect(children).toHaveLength(2);
    const bySupport = children.find((c) => c.agentId === ctx.soporte.id)!;
    const byMkt = children.find((c) => c.agentId === ctx.marketing.id)!;
    expect(bySupport.model).toBe('claude-opus-5-5');
    expect(byMkt.model).toBe('claude-sonnet-5-5');
    expect(ctx.connector.calls).toHaveLength(2);

    const types = ctx.bus.events.map((e) => e.type);
    expect(types.filter((t) => t === 'delegation')).toHaveLength(2);
    expect(types).toContain('agent.say');
    expect(types).toContain('action.updated');
    const ceoStatuses = ctx.bus.events
      .filter((e): e is Extract<OfficeEvent, { type: 'agent.status' }> => e.type === 'agent.status')
      .filter((e) => e.agentId === ctx.ceo.id)
      .map((e) => e.status);
    expect(ceoStatuses).toContain('thinking');
    expect(ceoStatuses).toContain('delegating');
    expect(ceoStatuses.at(-1)).toBe('idle');
    for (const e of ctx.bus.events) if (e.type === 'agent.say') expect(e.text.length).toBeLessThanOrEqual(60);
    const statuses = ctx.engine.agentStatuses(T);
    expect(Object.values(statuses).every((s) => s.status === 'idle')).toBe(true);
  });

  it('en modo mock guarda model = "mock"', async () => {
    const ctx = setup({ plan: () => plan([sub('soporte')]) });
    const tree = ctx.engine.submitRequest(T, 'hola');
    await ctx.engine.idle();
    expect(ctx.store.getTask(T, tree.task.id)!.model).toBe('mock');
    expect(ctx.store.listChildTasks(T, tree.task.id)[0]!.model).toBe('mock');
    expect(ctx.llm.stepModels[0]!.model).toBe('claude-sonnet-5-5');
  });

  it('responde directamente sin delegar', async () => {
    const ctx = setup({ plan: () => plan([], 'Somos 6 areas.') });
    const tree = ctx.engine.submitRequest(T, 'Cuantas areas hay?');
    await ctx.engine.idle();
    const root = ctx.store.getTask(T, tree.task.id)!;
    expect(root.status).toBe('completed');
    expect(root.result).toBe('Somos 6 areas.');
    expect(ctx.store.listChildTasks(T, root.id)).toHaveLength(0);
    expect(ctx.llm.synthCalls).toBe(0);
  });

  it('descarta subtareas con agentKey desconocido', async () => {
    const ctx = setup({ plan: () => plan([sub('soporte'), sub('fantasma')]) });
    const tree = ctx.engine.submitRequest(T, 'algo');
    await ctx.engine.idle();
    const children = ctx.store.listChildTasks(T, tree.task.id);
    expect(children).toHaveLength(1);
    expect(children[0]!.agentId).toBe(ctx.soporte.id);
    expect(ctx.store.getTask(T, tree.task.id)!.status).toBe('completed');
  });

  it('falla la raiz si todas las subtareas apuntan a agentes inexistentes', async () => {
    const ctx = setup({ plan: () => plan([sub('fantasma')]) });
    const tree = ctx.engine.submitRequest(T, 'algo');
    await ctx.engine.idle();
    const root = ctx.store.getTask(T, tree.task.id)!;
    expect(root.status).toBe('failed');
    expect(root.error).toMatch(/inexistentes/);
  });

  it('serializa las subtareas del mismo agente', async () => {
    let running = 0;
    let maxRunning = 0;
    const connector = createFakeConnector(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 10));
      running--;
      return { ok: true, output: 'ok', simulated: true };
    });
    const ctx = setup(
      {
        plan: () => plan([sub('soporte', 'a'), sub('soporte', 'b')]),
        step: (_a, turn) => (turn === 0 ? { calls: [call('consultar', { cliente: 'x' })] } : { text: 'ok' }),
      },
      connector,
    );
    ctx.engine.submitRequest(T, 'dos cosas');
    ctx.engine.submitRequest(T, 'otra solicitud');
    await ctx.engine.idle();
    // Cada solicitud reparte dos subtareas al mismo agente: 4 ejecuciones, nunca simultaneas.
    expect(connector.calls).toHaveLength(4);
    expect(maxRunning).toBe(1);
  });

  it('aprobacion aprobada: pausa, ejecuta el conector y completa', async () => {
    const ctx = setup({
      plan: () => plan([sub('soporte')]),
      step: (_a, turn, conv) => {
        if (turn === 0) return { calls: [call('reembolsar', { cliente: 'c1', monto: 10 })] };
        const last = conv.at(-1);
        return { text: last?.role === 'tool' && !last.results[0]!.isError ? 'reembolso hecho' : 'no pude' };
      },
    });
    const tree = ctx.engine.submitRequest(T, 'reembolsa');
    await ctx.engine.idle();

    const child = ctx.store.listChildTasks(T, tree.task.id)[0]!;
    expect(child.status).toBe('waiting_approval');
    expect(ctx.store.getTask(T, tree.task.id)!.status).toBe('waiting_approval');
    expect(ctx.connector.calls).toHaveLength(0);
    expect(ctx.engine.agentStatuses(T)[ctx.soporte.id]!.status).toBe('waiting_approval');
    const [pending] = ctx.store.listActionRuns(T, { status: 'pending_approval' });
    expect(pending).toBeDefined();

    const resolved = await ctx.engine.resolveApproval(T, pending!.id, true);
    expect(resolved.status).toBe('succeeded');
    await ctx.engine.idle();

    expect(ctx.connector.calls).toEqual([{ cliente: 'c1', monto: 10 }]);
    expect(ctx.store.getTask(T, child.id)!.result).toBe('reembolso hecho');
    const root = ctx.store.getTask(T, tree.task.id)!;
    expect(root.status).toBe('completed');
    expect(ctx.llm.synthCalls).toBe(1);
    expect(ctx.engine.agentStatuses(T)[ctx.soporte.id]!.status).toBe('idle');

    await expect(ctx.engine.resolveApproval(T, pending!.id, true)).rejects.toMatchObject({ code: 'conflict' });
    await expect(ctx.engine.resolveApproval(T, 'nope', true)).rejects.toBeInstanceOf(EngineError);
    await expect(ctx.engine.resolveApproval(T, 'nope', true)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('aprobacion aprobada con nota: se guarda en el run y llega al agente', async () => {
    let seen: ToolResult | undefined;
    const ctx = setup({
      plan: () => plan([sub('soporte')]),
      step: (_a, turn, conv) => {
        if (turn === 0) return { calls: [call('reembolsar', { cliente: 'c1', monto: 10 })] };
        const last = conv.at(-1);
        if (last?.role === 'tool') seen = last.results[0];
        return { text: 'hecho' };
      },
    });
    ctx.engine.submitRequest(T, 'reembolsa');
    await ctx.engine.idle();
    const [pending] = ctx.store.listActionRuns(T, { status: 'pending_approval' });
    const resolved = await ctx.engine.resolveApproval(T, pending!.id, true, '  Adelante, buen trabajo  ');
    expect(resolved).toMatchObject({ status: 'succeeded', note: 'Adelante, buen trabajo' });
    await ctx.engine.idle();
    expect(ctx.store.getActionRun(T, pending!.id)!.note).toBe('Adelante, buen trabajo');
    expect(seen?.isError).toBe(false);
    expect(seen?.content).toContain('Adelante, buen trabajo');
  });

  it('aprobacion rechazada: el agente recibe la nota y continua', async () => {
    let seen: ToolResult | undefined;
    const ctx = setup({
      plan: () => plan([sub('soporte')]),
      step: (_a, turn, conv) => {
        if (turn === 0) return { calls: [call('reembolsar', { cliente: 'c1' })] };
        const last = conv.at(-1);
        if (last?.role === 'tool') seen = last.results[0];
        return { text: 'informo que fue rechazado' };
      },
    });
    const tree = ctx.engine.submitRequest(T, 'reembolsa');
    await ctx.engine.idle();
    const [pending] = ctx.store.listActionRuns(T, { status: 'pending_approval' });
    const resolved = await ctx.engine.resolveApproval(T, pending!.id, false, 'Monto excesivo');
    expect(resolved.status).toBe('rejected');
    expect(resolved.note).toBe('Monto excesivo');
    await ctx.engine.idle();
    expect(ctx.connector.calls).toHaveLength(0);
    expect(seen?.isError).toBe(true);
    expect(seen?.content).toContain('Monto excesivo');
    expect(seen?.toolCallId).toBe('call-reembolsar');
    expect(ctx.store.getTask(T, tree.task.id)!.status).toBe('completed');
  });

  it('turno con una accion libre y otra con aprobacion', async () => {
    let seen: ToolResult[] = [];
    const ctx = setup({
      plan: () => plan([sub('soporte')]),
      step: (_a, turn, conv) => {
        if (turn === 0) {
          return { calls: [call('reembolsar', { cliente: 'c1' }, 'a'), call('consultar', { cliente: 'c1' }, 'b')] };
        }
        const last = conv.at(-1);
        if (last?.role === 'tool') seen = last.results;
        return { text: 'fin' };
      },
    });
    ctx.engine.submitRequest(T, 'ambas');
    await ctx.engine.idle();
    // La libre ya se ejecuto; la otra espera.
    expect(ctx.connector.calls).toHaveLength(1);
    const runs = ctx.store.listActionRuns(T);
    expect(runs.map((r) => r.status).sort()).toEqual(['pending_approval', 'succeeded']);
    const pending = runs.find((r) => r.status === 'pending_approval')!;
    await ctx.engine.resolveApproval(T, pending.id, true);
    await ctx.engine.idle();
    expect(ctx.connector.calls).toHaveLength(2);
    expect(seen.map((r) => r.toolCallId)).toEqual(['a', 'b']);
    expect(seen.every((r) => !r.isError)).toBe(true);
  });

  it('dos aprobaciones en el mismo turno: reanuda solo cuando ambas se resuelven', async () => {
    let steps = 0;
    const ctx = setup({
      plan: () => plan([sub('soporte')]),
      step: (_a, turn) => {
        steps++;
        return turn === 0
          ? { calls: [call('reembolsar', { cliente: 'a' }, 'x'), call('reembolsar', { cliente: 'b' }, 'y')] }
          : { text: 'fin' };
      },
    });
    const tree = ctx.engine.submitRequest(T, 'dos reembolsos');
    await ctx.engine.idle();
    const pend = ctx.store.listActionRuns(T, { status: 'pending_approval' });
    expect(pend).toHaveLength(2);
    await ctx.engine.resolveApproval(T, pend[0]!.id, true);
    await ctx.engine.idle();
    expect(steps).toBe(1);
    expect(ctx.store.listChildTasks(T, tree.task.id)[0]!.status).toBe('waiting_approval');
    await ctx.engine.resolveApproval(T, pend[1]!.id, false);
    await ctx.engine.idle();
    expect(steps).toBe(2);
    expect(ctx.store.getTask(T, tree.task.id)!.status).toBe('completed');
  });

  it('conector que falla devuelve error al agente', async () => {
    let seen: ToolResult[] = [];
    const connector = createFakeConnector(async (p) => {
      if (p.cliente === 'boom') throw new Error('timeout');
      return { ok: false, output: null, error: 'HTTP 500', simulated: false };
    });
    const ctx = setup(
      {
        plan: () => plan([sub('soporte')]),
        step: (_a, turn, conv) => {
          if (turn === 0) return { calls: [call('consultar', { cliente: 'x' }, '1'), call('consultar', { cliente: 'boom' }, '2')] };
          const last = conv.at(-1);
          if (last?.role === 'tool') seen = last.results;
          return { text: 'reporto el fallo' };
        },
      },
      connector,
    );
    const tree = ctx.engine.submitRequest(T, 'consulta');
    await ctx.engine.idle();
    const runs = ctx.store.listActionRuns(T);
    expect(runs.map((r) => r.status)).toEqual(['failed', 'failed']);
    expect(runs.map((r) => r.error)).toEqual(['HTTP 500', 'timeout']);
    expect(seen.every((r) => r.isError)).toBe(true);
    expect(seen[0]!.content).toContain('HTTP 500');
    expect(ctx.store.getTask(T, tree.task.id)!.status).toBe('completed');
  });

  it('parametros invalidos y acciones desconocidas no se ejecutan', async () => {
    let seen: ToolResult[] = [];
    const ctx = setup({
      plan: () => plan([sub('soporte')]),
      step: (_a, turn, conv) => {
        if (turn === 0) {
          return {
            calls: [
              call('consultar', { monto: 'diez', extra: 1, canal: 'fax' }, 'p1'),
              call('no_existe', {}, 'p2'),
              call('apagada', { cliente: 'x' }, 'p3'),
            ],
          };
        }
        if (turn === 1) {
          const last = conv.at(-1);
          if (last?.role === 'tool') seen = last.results;
          return { calls: [call('consultar', { cliente: 'c1', monto: 5, canal: 'sms' }, 'p4')] };
        }
        return { text: 'corregido' };
      },
    });
    const tree = ctx.engine.submitRequest(T, 'x');
    await ctx.engine.idle();
    expect(seen).toHaveLength(3);
    expect(seen.every((r) => r.isError)).toBe(true);
    expect(seen[0]!.content).toMatch(/cliente/);
    expect(seen[0]!.content).toMatch(/extra/);
    expect(seen[0]!.content).toMatch(/monto/);
    expect(seen[0]!.content).toMatch(/email, sms/);
    expect(seen[1]!.content).toMatch(/no existe/);
    expect(seen[2]!.content).toMatch(/deshabilitada/);
    expect(ctx.connector.calls).toEqual([{ cliente: 'c1', monto: 5, canal: 'sms' }]);
    expect(ctx.store.listActionRuns(T)).toHaveLength(1);
    expect(ctx.store.getTask(T, tree.task.id)!.status).toBe('completed');
  });

  it('limite de 8 turnos', async () => {
    const ctx = setup({
      plan: () => plan([sub('soporte')]),
      step: (_a, turn) => ({ calls: [call('consultar', { cliente: String(turn) }, `t${turn}`)] }),
    });
    const tree = ctx.engine.submitRequest(T, 'bucle');
    await ctx.engine.idle();
    const child = ctx.store.listChildTasks(T, tree.task.id)[0]!;
    expect(child.status).toBe('failed');
    expect(child.error).toMatch(/limite de 8 turnos/);
    expect(ctx.llm.stepModels).toHaveLength(8);
    const root = ctx.store.getTask(T, tree.task.id)!;
    expect(root.status).toBe('failed');
    expect(root.error).toMatch(/Todas las subtareas fallaron/);
    expect(ctx.engine.agentStatuses(T)[ctx.soporte.id]!.status).toBe('idle');
  });

  it('una hija fallida no impide completar la raiz', async () => {
    const ctx = setup({
      plan: () => plan([sub('soporte'), sub('marketing')]),
      step: (agent) => {
        if (agent === 'marketing') throw new Error('refusal');
        return { text: 'ok' };
      },
    });
    const tree = ctx.engine.submitRequest(T, 'x');
    await ctx.engine.idle();
    const root = ctx.store.getTask(T, tree.task.id)!;
    expect(root.status).toBe('completed');
    expect(root.result).toContain('marketing=failed:refusal');
  });

  it('fallo del LLM al planificar deja la raiz fallida y al CEO idle', async () => {
    const ctx = setup({
      plan: () => {
        throw new Error('API caida');
      },
    });
    const tree = ctx.engine.submitRequest(T, 'x');
    await ctx.engine.idle();
    const root = ctx.store.getTask(T, tree.task.id)!;
    expect(root.status).toBe('failed');
    expect(root.error).toContain('API caida');
    expect(ctx.engine.agentStatuses(T)[ctx.ceo.id]!.status).toBe('idle');
  });

  it('reanuda tras reiniciar con un Engine nuevo sobre el mismo Store', async () => {
    const ctx = setup({
      plan: () => plan([sub('soporte'), sub('marketing')]),
      step: (agent, turn) => {
        if (agent === 'soporte' && turn === 0) {
          return { calls: [call('consultar', { cliente: 'c' }, 'f'), call('reembolsar', { cliente: 'c' }, 'r')] };
        }
        return { text: `ok ${agent}` };
      },
    });
    const tree = ctx.engine.submitRequest(T, 'x');
    await ctx.engine.idle();
    // Tarea huerfana "a medias" que el reinicio debe marcar como fallida.
    const orphan = ctx.store.createTask(T, {
      parentId: null,
      agentId: ctx.ceo.id,
      title: 'huerfana',
      instructions: 'x',
      complexity: 'simple',
    });
    ctx.store.updateTask(T, orphan.id, { status: 'running' });

    // "Reinicio": nuevo bus, nuevo LLM con el mismo guion, nuevo engine.
    const llm2 = createScriptedLLM({
      plan: () => plan([]),
      step: (_a, _turn, conv) => {
        const last = conv.at(-1);
        return { text: last?.role === 'tool' ? `resultados ${last.results.map((r) => r.toolCallId).join(',')}` : '?' };
      },
    });
    const engine2 = createEngine({
      store: ctx.store,
      bus: createTestBus(),
      llm: llm2,
      connectors: ctx.connectors,
      config,
    });
    engine2.recover(T);
    expect(ctx.store.getTask(T, orphan.id)!.status).toBe('failed');
    expect(ctx.store.getTask(T, tree.task.id)!.status).toBe('waiting_approval');
    expect(engine2.agentStatuses(T)[ctx.soporte.id]!.status).toBe('waiting_approval');

    const [pending] = ctx.store.listActionRuns(T, { status: 'pending_approval' });
    await engine2.resolveApproval(T, pending!.id, true);
    await engine2.idle();

    const child = ctx.store.listChildTasks(T, tree.task.id).find((c) => c.agentId === ctx.soporte.id)!;
    expect(child.status).toBe('completed');
    expect(child.result).toBe('resultados f,r');
    expect(toolResults(ctx.store, child.id).map((r) => r.isError)).toEqual([false, false]);
    const root = ctx.store.getTask(T, tree.task.id)!;
    expect(root.status).toBe('completed');
    expect(llm2.synthCalls).toBe(1);
    expect(ctx.connector.calls).toHaveLength(2);
  });

  it('dos aprobaciones concurrentes del mismo run ejecutan el conector una vez', async () => {
    const connector = createFakeConnector(async () => {
      await new Promise((r) => setTimeout(r, 15));
      return { ok: true, output: 'ok', simulated: true };
    });
    let steps = 0;
    const ctx = setup(
      {
        plan: () => plan([sub('soporte')]),
        step: (_a, turn) => {
          steps++;
          return turn === 0 ? { calls: [call('reembolsar', { cliente: 'c' })] } : { text: 'fin' };
        },
      },
      connector,
    );
    const tree = ctx.engine.submitRequest(T, 'x');
    await ctx.engine.idle();
    const [pending] = ctx.store.listActionRuns(T, { status: 'pending_approval' });
    const results = await Promise.allSettled([
      ctx.engine.resolveApproval(T, pending!.id, true),
      ctx.engine.resolveApproval(T, pending!.id, true),
      ctx.engine.resolveApproval(T, pending!.id, false),
    ]);
    await ctx.engine.idle();
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(2);
    for (const r of rejected) expect(r.reason).toMatchObject({ code: 'conflict' });
    expect(connector.calls).toHaveLength(1);
    expect(steps).toBe(2);
    expect(ctx.llm.synthCalls).toBe(1);
    expect(ctx.store.getTask(T, tree.task.id)!.status).toBe('completed');
  });
});
