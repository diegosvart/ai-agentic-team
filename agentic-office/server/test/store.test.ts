import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ActionInput, AgentInput } from '@agentic-office/shared';
import { DatabaseSync } from 'node:sqlite';
import { createStore, StoreError } from '../src/store';
import { createEventBus } from '../src/events';
import { loadConfig } from '../src/config';

const agentInput = (key: string): AgentInput => ({
  key,
  name: 'Test',
  area: 'Area',
  description: 'desc',
  defaultModel: 'sonnet',
  color: '#123456',
  enabled: true,
});

const actionInput = (agentId: string, key: string): ActionInput => ({
  agentId,
  key,
  name: 'Accion',
  description: 'desc',
  params: [{ name: 'x', type: 'string', description: 'd', required: true }],
  connector: 'internal',
  connectorConfig: {},
  requiresApproval: false,
  enabled: true,
});

function fresh() {
  const store = createStore(':memory:');
  return { store, tenant: store.getDefaultTenant() };
}

describe('seed', () => {
  it('crea Empresa Demo con CEO y seis areas', () => {
    const { store, tenant } = fresh();
    expect(tenant.name).toBe('Empresa Demo');
    const agents = store.listAgents(tenant.id);
    expect(agents).toHaveLength(7);
    expect(agents[0]).toMatchObject({ key: 'ceo', role: 'ceo', defaultModel: 'opus' });
    const keys = agents.slice(1).map((a) => a.key).sort();
    expect(keys).toEqual(['comunicaciones', 'contabilidad', 'marketing', 'rrhh', 'soporte', 'ventas']);
    expect(new Set(agents.map((a) => a.color)).size).toBe(7);
    for (const a of agents.filter((x) => x.role === 'area')) {
      const actions = store.listActions(tenant.id, a.id);
      expect(actions.length).toBeGreaterThanOrEqual(2);
      expect(actions.some((x) => x.requiresApproval)).toBe(true);
    }
    const webhook = store.listActions(tenant.id).filter((a) => a.connector === 'webhook');
    expect(webhook[0]?.connectorConfig).toEqual({ url: '', method: 'POST' });
  });

  it('es idempotente', () => {
    const { store, tenant } = fresh();
    const before = store.listActions(tenant.id).length;
    store.init();
    store.init();
    expect(store.listAgents(tenant.id)).toHaveLength(7);
    expect(store.listActions(tenant.id)).toHaveLength(before);
    expect(store.getDefaultTenant().id).toBe(tenant.id);
  });
});

describe('agentes y acciones', () => {
  it('CRUD de agentes', () => {
    const { store, tenant } = fresh();
    const a = store.createAgent(tenant.id, agentInput('legal'));
    expect(a.role).toBe('area');
    expect(store.updateAgent(tenant.id, a.id, { name: 'Nuevo', enabled: false })).toMatchObject({ name: 'Nuevo', enabled: false });
    store.deleteAgent(tenant.id, a.id);
    expect(store.getAgent(tenant.id, a.id)).toBeNull();
  });

  it('no permite borrar el CEO y borrar un agente borra sus acciones', () => {
    const { store, tenant } = fresh();
    const ceo = store.listAgents(tenant.id)[0]!;
    expect(() => store.deleteAgent(tenant.id, ceo.id)).toThrow(StoreError);
    const a = store.createAgent(tenant.id, agentInput('legal'));
    const act = store.createAction(tenant.id, actionInput(a.id, 'revisar_contrato'));
    store.deleteAgent(tenant.id, a.id);
    expect(store.getAction(tenant.id, act.id)).toBeNull();
  });

  it('CRUD de acciones con JSON tipado', () => {
    const { store, tenant } = fresh();
    const a = store.createAgent(tenant.id, agentInput('legal'));
    const act = store.createAction(tenant.id, actionInput(a.id, 'revisar_contrato'));
    expect(act.params[0]?.name).toBe('x');
    const upd = store.updateAction(tenant.id, act.id, {
      requiresApproval: true,
      connector: 'webhook',
      connectorConfig: { url: 'http://x', method: 'POST' },
    });
    expect(upd).toMatchObject({ requiresApproval: true, connector: 'webhook', connectorConfig: { url: 'http://x', method: 'POST' } });
    store.deleteAction(tenant.id, act.id);
    expect(store.listActions(tenant.id, a.id)).toHaveLength(0);
  });

  it('claves duplicadas lanzan StoreError conflict', () => {
    const { store, tenant } = fresh();
    expect(() => store.createAgent(tenant.id, agentInput('soporte'))).toThrowError(
      expect.objectContaining({ code: 'conflict' }),
    );
    const a = store.createAgent(tenant.id, agentInput('legal'));
    store.createAction(tenant.id, actionInput(a.id, 'mi_accion'));
    expect(() => store.createAction(tenant.id, actionInput(a.id, 'mi_accion'))).toThrowError(
      expect.objectContaining({ code: 'conflict' }),
    );
    const b = store.createAgent(tenant.id, agentInput('otro'));
    expect(() => store.updateAgent(tenant.id, b.id, { key: 'legal' })).toThrowError(
      expect.objectContaining({ code: 'conflict' }),
    );
  });
});

describe('aislamiento por tenant', () => {
  it('un tenant no ve ni modifica datos de otro', () => {
    const { store, tenant } = fresh();
    const agent = store.listAgents(tenant.id)[1]!;
    const action = store.listActions(tenant.id, agent.id)[0]!;
    const task = store.createTask(tenant.id, { parentId: null, agentId: agent.id, title: 't', instructions: 'i', complexity: 'simple' });
    store.saveConversation(tenant.id, task.id, [{ a: 1 }]);
    const other = 'otro-tenant';
    expect(store.listAgents(other)).toEqual([]);
    expect(store.getAgent(other, agent.id)).toBeNull();
    expect(store.getAction(other, action.id)).toBeNull();
    expect(store.getTask(other, task.id)).toBeNull();
    expect(store.getTaskTree(other, task.id)).toBeNull();
    expect(store.listRootTasks(other)).toEqual([]);
    expect(store.loadConversation(other, task.id)).toBeNull();
    expect(() => store.updateAgent(other, agent.id, { name: 'x' })).toThrow(StoreError);
    expect(() => store.deleteAction(other, action.id)).toThrow(StoreError);
    expect(() => store.createTask(other, { parentId: null, agentId: agent.id, title: 't', instructions: 'i', complexity: 'simple' })).toThrow(StoreError);
    expect(store.getAgent(tenant.id, agent.id)).not.toBeNull();
  });
});

describe('tareas, conversaciones y ejecuciones', () => {
  it('arbol de tareas con ejecuciones de acciones', () => {
    const { store, tenant } = fresh();
    const [ceo, soporte] = store.listAgents(tenant.id) as [ReturnType<typeof store.getAgent> & {}, ReturnType<typeof store.getAgent> & {}];
    const root = store.createTask(tenant.id, { parentId: null, agentId: ceo.id, title: 'Solicitud', instructions: 'haz algo', complexity: 'complex' });
    expect(root.status).toBe('queued');
    const child = store.createTask(tenant.id, { parentId: root.id, agentId: soporte.id, title: 'Sub', instructions: 'i', complexity: 'simple' });
    const updated = store.updateTask(tenant.id, child.id, { status: 'running', model: 'mock' });
    expect(updated).toMatchObject({ status: 'running', model: 'mock', result: null });
    const action = store.listActions(tenant.id, soporte.id)[0]!;
    const r = store.createActionRun(tenant.id, {
      taskId: child.id, agentId: soporte.id, action, params: { ticket_id: 'T-1' }, status: 'pending_approval', toolCallId: 'tc_1',
    });
    expect(r).toMatchObject({ status: 'pending_approval', resolvedAt: null, actionKey: action.key });
    expect(store.getActionRunToolCallId(tenant.id, r.id)).toBe('tc_1');
    expect(store.listActionRuns(tenant.id, { status: 'pending_approval' })).toHaveLength(1);
    expect(r.note).toBeNull();
    const done = store.updateActionRun(tenant.id, r.id, { status: 'succeeded', result: { ok: true }, note: 'Adelante', resolvedAt: new Date().toISOString() });
    expect(done.result).toEqual({ ok: true });
    expect(done.note).toBe('Adelante');
    const tree = store.getTaskTree(tenant.id, root.id)!;
    expect(tree.children.map((c) => c.id)).toEqual([child.id]);
    expect(tree.actionRuns).toHaveLength(1);
    expect(store.listRootTasks(tenant.id).map((t) => t.id)).toEqual([root.id]);
    expect(store.listUnfinishedTasks(tenant.id)).toHaveLength(2);
    store.updateTask(tenant.id, root.id, { status: 'completed', result: 'ok' });
    expect(store.listUnfinishedTasks(tenant.id).map((t) => t.id)).toEqual([child.id]);
  });

  it('guarda, sobreescribe y carga la conversacion', () => {
    const { store, tenant } = fresh();
    const agent = store.listAgents(tenant.id)[1]!;
    const task = store.createTask(tenant.id, { parentId: null, agentId: agent.id, title: 't', instructions: 'i', complexity: 'simple' });
    expect(store.loadConversation(tenant.id, task.id)).toBeNull();
    const conv = [{ role: 'user', content: 'hola' }, { role: 'assistant', content: [{ type: 'tool_use', id: 'x', input: { a: 1 } }] }];
    store.saveConversation(tenant.id, task.id, conv);
    expect(store.loadConversation(tenant.id, task.id)).toEqual(conv);
    store.saveConversation(tenant.id, task.id, [conv[0]]);
    expect(store.loadConversation(tenant.id, task.id)).toEqual([conv[0]]);
  });
});

describe('persistencia en archivo', () => {
  it('crea el directorio y conserva datos al reabrir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ao-store-'));
    const path = join(dir, 'nested', 'db.sqlite');
    const s1 = createStore(path);
    const t = s1.getDefaultTenant();
    s1.createAgent(t.id, agentInput('legal'));
    const s2 = createStore(path);
    expect(s2.getDefaultTenant().id).toBe(t.id);
    expect(s2.listAgents(t.id)).toHaveLength(8);
  });
});

describe('event bus', () => {
  it('seq incremental por tenant, suscripcion y buffer circular', () => {
    const bus = createEventBus();
    const seen: number[] = [];
    const off = bus.subscribe('a', (e) => seen.push(e.seq));
    bus.publish('a', { type: 'config.changed' });
    bus.publish('b', { type: 'config.changed' });
    bus.publish('a', { type: 'config.changed' });
    off();
    bus.publish('a', { type: 'config.changed' });
    expect(seen).toEqual([1, 2]);
    expect(bus.recent('a').map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(bus.recent('a', 2).map((e) => e.seq)).toEqual([3]);
    expect(bus.recent('b')).toHaveLength(1);
    for (let i = 0; i < 600; i++) bus.publish('a', { type: 'config.changed' });
    const recent = bus.recent('a');
    expect(recent).toHaveLength(500);
    expect(recent.at(-1)?.seq).toBe(603);
  });
});

describe('config', () => {
  it('modo live solo con API key y sin LLM_MODE=mock', () => {
    expect(loadConfig({}).llmMode).toBe('mock');
    expect(loadConfig({ ANTHROPIC_API_KEY: 'k' }).llmMode).toBe('live');
    expect(loadConfig({ ANTHROPIC_API_KEY: 'k', LLM_MODE: 'mock' }).llmMode).toBe('mock');
    const c = loadConfig({ PORT: '9000', MODEL_OPUS: 'o', MOCK_STEP_DELAY_MS: '0' });
    expect(c).toMatchObject({ port: 9000, mockStepDelayMs: 0, models: { opus: 'o', sonnet: 'claude-sonnet-5-5' } });
  });
});

describe('migraciones', () => {
  it('agrega la columna note a action_runs en bases antiguas', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ao-mig-'));
    const path = join(dir, 'old.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE action_runs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL, action_id TEXT NOT NULL, action_key TEXT NOT NULL, action_name TEXT NOT NULL,
      params TEXT NOT NULL, status TEXT NOT NULL, result TEXT, error TEXT, tool_call_id TEXT NOT NULL,
      created_at TEXT NOT NULL, resolved_at TEXT)`);
    old.close();
    const store = createStore(path);
    const tenant = store.getDefaultTenant();
    const agent = store.listAgents(tenant.id).find((a) => a.role === 'area')!;
    const task = store.createTask(tenant.id, { parentId: null, agentId: agent.id, title: 't', instructions: 'i', complexity: 'simple' });
    const action = store.listActions(tenant.id, agent.id)[0]!;
    const r = store.createActionRun(tenant.id, { taskId: task.id, agentId: agent.id, action, params: {}, status: 'pending_approval', toolCallId: 'x' });
    expect(store.updateActionRun(tenant.id, r.id, { note: 'ok' }).note).toBe('ok');
    rmSync(dir, { recursive: true, force: true });
  });
});
