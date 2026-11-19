import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  ActionDef,
  ActionInput,
  ActionRun,
  ActionRunStatus,
  Agent,
  AgentInput,
  AgentRole,
  Complexity,
  Task,
  TaskStatus,
  TaskTree,
  Tenant,
} from '@agentic-office/shared';
import type { Store } from '../contracts';
import { seedIfEmpty } from './seed';

export type StoreErrorCode = 'conflict' | 'not_found' | 'forbidden';

export class StoreError extends Error {
  constructor(
    public readonly code: StoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  area TEXT NOT NULL,
  description TEXT NOT NULL,
  default_model TEXT NOT NULL,
  color TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, key)
);
CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  params TEXT NOT NULL,
  connector TEXT NOT NULL,
  connector_config TEXT NOT NULL,
  requires_approval INTEGER NOT NULL,
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, key)
);
CREATE INDEX IF NOT EXISTS idx_actions_agent ON actions (tenant_id, agent_id);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  parent_id TEXT,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  complexity TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL,
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks (tenant_id, parent_id);
CREATE TABLE IF NOT EXISTS conversations (
  tenant_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (tenant_id, task_id)
);
CREATE TABLE IF NOT EXISTS action_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  action_key TEXT NOT NULL,
  action_name TEXT NOT NULL,
  params TEXT NOT NULL,
  status TEXT NOT NULL,
  result TEXT,
  error TEXT,
  tool_call_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_task ON action_runs (tenant_id, task_id);
`;

type Row = Record<string, unknown>;

const UNFINISHED: TaskStatus[] = ['queued', 'planning', 'running', 'waiting_approval'];
const now = () => new Date().toISOString();
const asStr = (v: unknown) => v as string;
const asBool = (v: unknown) => Number(v) === 1;
const toJson = (v: unknown) => JSON.stringify(v ?? null);
const fromJson = <T>(v: unknown): T => JSON.parse(asStr(v)) as T;

const toTenant = (r: Row): Tenant => ({ id: asStr(r.id), name: asStr(r.name) });

const toAgent = (r: Row): Agent => ({
  id: asStr(r.id),
  tenantId: asStr(r.tenant_id),
  key: asStr(r.key),
  name: asStr(r.name),
  role: asStr(r.role) as AgentRole,
  area: asStr(r.area),
  description: asStr(r.description),
  defaultModel: asStr(r.default_model) as Agent['defaultModel'],
  color: asStr(r.color),
  enabled: asBool(r.enabled),
  createdAt: asStr(r.created_at),
});

const toAction = (r: Row): ActionDef => ({
  id: asStr(r.id),
  tenantId: asStr(r.tenant_id),
  agentId: asStr(r.agent_id),
  key: asStr(r.key),
  name: asStr(r.name),
  description: asStr(r.description),
  params: fromJson(r.params),
  connector: asStr(r.connector),
  connectorConfig: fromJson(r.connector_config),
  requiresApproval: asBool(r.requires_approval),
  enabled: asBool(r.enabled),
  createdAt: asStr(r.created_at),
});

const toTask = (r: Row): Task => ({
  id: asStr(r.id),
  tenantId: asStr(r.tenant_id),
  parentId: (r.parent_id as string | null) ?? null,
  agentId: asStr(r.agent_id),
  title: asStr(r.title),
  instructions: asStr(r.instructions),
  complexity: asStr(r.complexity) as Complexity,
  model: (r.model as string | null) ?? null,
  status: asStr(r.status) as TaskStatus,
  result: (r.result as string | null) ?? null,
  error: (r.error as string | null) ?? null,
  createdAt: asStr(r.created_at),
  updatedAt: asStr(r.updated_at),
});

const toRun = (r: Row): ActionRun => ({
  id: asStr(r.id),
  tenantId: asStr(r.tenant_id),
  taskId: asStr(r.task_id),
  agentId: asStr(r.agent_id),
  actionId: asStr(r.action_id),
  actionKey: asStr(r.action_key),
  actionName: asStr(r.action_name),
  params: fromJson(r.params),
  status: asStr(r.status) as ActionRunStatus,
  result: r.result == null ? null : fromJson(r.result),
  error: (r.error as string | null) ?? null,
  note: (r.note as string | null) ?? null,
  createdAt: asStr(r.created_at),
  resolvedAt: (r.resolved_at as string | null) ?? null,
});

/** Convierte un parche parcial en "col = ?" ignorando las claves undefined. */
function buildSet(
  patch: Record<string, unknown>,
  columns: Record<string, { col: string; enc?: (v: any) => unknown }>,
): { sql: string; values: unknown[] } {
  const parts: string[] = [];
  const values: unknown[] = [];
  for (const [k, spec] of Object.entries(columns)) {
    if (patch[k] === undefined) continue;
    parts.push(`${spec.col} = ?`);
    values.push(spec.enc ? spec.enc(patch[k]) : patch[k]);
  }
  return { sql: parts.join(', '), values };
}

const bit = (v: boolean) => (v ? 1 : 0);

export function createStore(dbPath: string): Store {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  if (dbPath !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  const all = (sql: string, ...args: any[]): Row[] => db.prepare(sql).all(...args) as Row[];
  const one = (sql: string, ...args: any[]): Row | null => (db.prepare(sql).get(...args) as Row | undefined) ?? null;
  const run = (sql: string, ...args: any[]) => db.prepare(sql).run(...args);

  // ---- internos usados tambien por el seed ----

  function createTenant(name: string): Tenant {
    const id = randomUUID();
    run('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)', id, name, now());
    return { id, name };
  }

  function insertAgent(tenantId: string, input: AgentInput, role: AgentRole): Agent {
    if (one('SELECT 1 AS x FROM agents WHERE tenant_id = ? AND key = ?', tenantId, input.key)) {
      throw new StoreError('conflict', `Ya existe un agente con la clave "${input.key}".`);
    }
    const id = randomUUID();
    run(
      `INSERT INTO agents (id, tenant_id, key, name, role, area, description, default_model, color, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, tenantId, input.key, input.name, role, input.area, input.description,
      input.defaultModel, input.color, bit(input.enabled), now(),
    );
    return getAgent(tenantId, id)!;
  }

  function insertAction(tenantId: string, input: ActionInput): ActionDef {
    if (!getAgent(tenantId, input.agentId)) throw new StoreError('not_found', 'El agente de la accion no existe.');
    if (one('SELECT 1 AS x FROM actions WHERE tenant_id = ? AND key = ?', tenantId, input.key)) {
      throw new StoreError('conflict', `Ya existe una accion con la clave "${input.key}".`);
    }
    const id = randomUUID();
    run(
      `INSERT INTO actions (id, tenant_id, agent_id, key, name, description, params, connector, connector_config,
                            requires_approval, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, tenantId, input.agentId, input.key, input.name, input.description, toJson(input.params),
      input.connector, toJson(input.connectorConfig), bit(input.requiresApproval), bit(input.enabled), now(),
    );
    return getAction(tenantId, id)!;
  }

  // ---- agentes ----

  function getAgent(tenantId: string, id: string): Agent | null {
    const r = one('SELECT * FROM agents WHERE tenant_id = ? AND id = ?', tenantId, id);
    return r ? toAgent(r) : null;
  }

  function getAction(tenantId: string, id: string): ActionDef | null {
    const r = one('SELECT * FROM actions WHERE tenant_id = ? AND id = ?', tenantId, id);
    return r ? toAction(r) : null;
  }

  function getTask(tenantId: string, id: string): Task | null {
    const r = one('SELECT * FROM tasks WHERE tenant_id = ? AND id = ?', tenantId, id);
    return r ? toTask(r) : null;
  }

  function getActionRun(tenantId: string, id: string): ActionRun | null {
    const r = one('SELECT * FROM action_runs WHERE tenant_id = ? AND id = ?', tenantId, id);
    return r ? toRun(r) : null;
  }

  /** Ejecuta fn dentro de una transaccion; revierte si lanza. */
  function tx<T>(fn: () => T): T {
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  const store: Store = {
    init() {
      db.exec(SCHEMA);
      // Migracion: bases creadas antes de guardar la nota de aprobacion.
      const runCols = all('PRAGMA table_info(action_runs)').map((c) => asStr(c.name));
      if (!runCols.includes('note')) db.exec('ALTER TABLE action_runs ADD COLUMN note TEXT');
      seedIfEmpty({
        tenantCount: () => Number(one('SELECT COUNT(*) AS n FROM tenants')!.n),
        createTenant,
        insertAgent,
        insertAction,
      });
    },

    getDefaultTenant() {
      const r = one('SELECT * FROM tenants ORDER BY created_at ASC, rowid ASC LIMIT 1');
      if (!r) throw new StoreError('not_found', 'No hay tenants: llama a init() primero.');
      return toTenant(r);
    },

    listAgents: (tenantId) =>
      all('SELECT * FROM agents WHERE tenant_id = ? ORDER BY (role = \'ceo\') DESC, created_at ASC, rowid ASC', tenantId).map(toAgent),
    getAgent,
    createAgent: (tenantId, input) => insertAgent(tenantId, input, 'area'),

    updateAgent(tenantId, id, patch) {
      const current = getAgent(tenantId, id);
      if (!current) throw new StoreError('not_found', 'Agente no encontrado.');
      if (patch.key !== undefined && patch.key !== current.key) {
        if (current.role === 'ceo') throw new StoreError('forbidden', 'No se puede cambiar la clave del CEO.');
        if (one('SELECT 1 AS x FROM agents WHERE tenant_id = ? AND key = ? AND id <> ?', tenantId, patch.key, id)) {
          throw new StoreError('conflict', `Ya existe un agente con la clave "${patch.key}".`);
        }
      }
      if (current.role === 'ceo' && patch.enabled === false) {
        throw new StoreError('forbidden', 'El CEO no se puede deshabilitar.');
      }
      const { sql, values } = buildSet(patch, {
        key: { col: 'key' },
        name: { col: 'name' },
        area: { col: 'area' },
        description: { col: 'description' },
        defaultModel: { col: 'default_model' },
        color: { col: 'color' },
        enabled: { col: 'enabled', enc: bit },
      });
      if (sql) run(`UPDATE agents SET ${sql} WHERE tenant_id = ? AND id = ?`, ...values, tenantId, id);
      return getAgent(tenantId, id)!;
    },

    deleteAgent(tenantId, id) {
      const current = getAgent(tenantId, id);
      if (!current) throw new StoreError('not_found', 'Agente no encontrado.');
      if (current.role === 'ceo') throw new StoreError('forbidden', 'El CEO no se puede borrar.');
      tx(() => {
        run('DELETE FROM actions WHERE tenant_id = ? AND agent_id = ?', tenantId, id);
        run('DELETE FROM agents WHERE tenant_id = ? AND id = ?', tenantId, id);
      });
    },

    // ---- acciones ----

    listActions(tenantId, agentId) {
      const rows = agentId
        ? all('SELECT * FROM actions WHERE tenant_id = ? AND agent_id = ? ORDER BY created_at ASC, rowid ASC', tenantId, agentId)
        : all('SELECT * FROM actions WHERE tenant_id = ? ORDER BY created_at ASC, rowid ASC', tenantId);
      return rows.map(toAction);
    },
    getAction,
    createAction: insertAction,

    updateAction(tenantId, id, patch) {
      const current = getAction(tenantId, id);
      if (!current) throw new StoreError('not_found', 'Accion no encontrada.');
      if (patch.agentId !== undefined && !getAgent(tenantId, patch.agentId)) {
        throw new StoreError('not_found', 'El agente de la accion no existe.');
      }
      if (patch.key !== undefined && patch.key !== current.key) {
        if (one('SELECT 1 AS x FROM actions WHERE tenant_id = ? AND key = ? AND id <> ?', tenantId, patch.key, id)) {
          throw new StoreError('conflict', `Ya existe una accion con la clave "${patch.key}".`);
        }
      }
      const { sql, values } = buildSet(patch, {
        agentId: { col: 'agent_id' },
        key: { col: 'key' },
        name: { col: 'name' },
        description: { col: 'description' },
        params: { col: 'params', enc: toJson },
        connector: { col: 'connector' },
        connectorConfig: { col: 'connector_config', enc: toJson },
        requiresApproval: { col: 'requires_approval', enc: bit },
        enabled: { col: 'enabled', enc: bit },
      });
      if (sql) run(`UPDATE actions SET ${sql} WHERE tenant_id = ? AND id = ?`, ...values, tenantId, id);
      return getAction(tenantId, id)!;
    },

    deleteAction(tenantId, id) {
      if (!getAction(tenantId, id)) throw new StoreError('not_found', 'Accion no encontrada.');
      run('DELETE FROM actions WHERE tenant_id = ? AND id = ?', tenantId, id);
    },

    // ---- tareas ----

    createTask(tenantId, input) {
      if (!getAgent(tenantId, input.agentId)) throw new StoreError('not_found', 'El agente de la tarea no existe.');
      if (input.parentId && !getTask(tenantId, input.parentId)) {
        throw new StoreError('not_found', 'La tarea padre no existe.');
      }
      const id = randomUUID();
      const ts = now();
      run(
        `INSERT INTO tasks (id, tenant_id, parent_id, agent_id, title, instructions, complexity, model, status, result, error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'queued', NULL, NULL, ?, ?)`,
        id, tenantId, input.parentId, input.agentId, input.title, input.instructions, input.complexity, ts, ts,
      );
      return getTask(tenantId, id)!;
    },
    getTask,

    updateTask(tenantId, id, patch) {
      if (!getTask(tenantId, id)) throw new StoreError('not_found', 'Tarea no encontrada.');
      const { sql, values } = buildSet(patch, {
        status: { col: 'status' },
        result: { col: 'result' },
        error: { col: 'error' },
        model: { col: 'model' },
      });
      run(`UPDATE tasks SET ${sql ? sql + ', ' : ''}updated_at = ? WHERE tenant_id = ? AND id = ?`, ...values, now(), tenantId, id);
      return getTask(tenantId, id)!;
    },

    listRootTasks: (tenantId, limit = 50) =>
      all(
        'SELECT * FROM tasks WHERE tenant_id = ? AND parent_id IS NULL ORDER BY created_at DESC, rowid DESC LIMIT ?',
        tenantId, limit,
      ).map(toTask),

    listChildTasks: (tenantId, parentId) =>
      all('SELECT * FROM tasks WHERE tenant_id = ? AND parent_id = ? ORDER BY created_at ASC, rowid ASC', tenantId, parentId).map(toTask),

    getTaskTree(tenantId, rootId): TaskTree | null {
      const task = getTask(tenantId, rootId);
      if (!task) return null;
      const children = store.listChildTasks(tenantId, rootId);
      const ids = [task.id, ...children.map((c) => c.id)];
      const actionRuns = all(
        `SELECT * FROM action_runs WHERE tenant_id = ? AND task_id IN (${ids.map(() => '?').join(',')})
         ORDER BY created_at ASC, rowid ASC`,
        tenantId, ...ids,
      ).map(toRun);
      return { task, children, actionRuns };
    },

    listUnfinishedTasks: (tenantId) =>
      all(
        `SELECT * FROM tasks WHERE tenant_id = ? AND status IN (${UNFINISHED.map(() => '?').join(',')})
         ORDER BY created_at ASC, rowid ASC`,
        tenantId, ...UNFINISHED,
      ).map(toTask),

    // ---- conversaciones ----

    saveConversation(tenantId, taskId, conversation) {
      run(
        `INSERT INTO conversations (tenant_id, task_id, data) VALUES (?, ?, ?)
         ON CONFLICT (tenant_id, task_id) DO UPDATE SET data = excluded.data`,
        tenantId, taskId, JSON.stringify(conversation),
      );
    },
    loadConversation(tenantId, taskId) {
      const r = one('SELECT data FROM conversations WHERE tenant_id = ? AND task_id = ?', tenantId, taskId);
      return r ? fromJson<unknown[]>(r.data) : null;
    },

    // ---- ejecuciones de acciones ----

    createActionRun(tenantId, input) {
      const id = randomUUID();
      const resolved = input.status === 'pending_approval' || input.status === 'running' ? null : now();
      run(
        `INSERT INTO action_runs (id, tenant_id, task_id, agent_id, action_id, action_key, action_name, params, status,
                                  result, error, tool_call_id, created_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
        id, tenantId, input.taskId, input.agentId, input.action.id, input.action.key, input.action.name,
        toJson(input.params), input.status, input.toolCallId, now(), resolved,
      );
      return getActionRun(tenantId, id)!;
    },
    getActionRun,
    getActionRunToolCallId(tenantId, id) {
      const r = one('SELECT tool_call_id FROM action_runs WHERE tenant_id = ? AND id = ?', tenantId, id);
      return r ? asStr(r.tool_call_id) : null;
    },
    updateActionRun(tenantId, id, patch) {
      if (!getActionRun(tenantId, id)) throw new StoreError('not_found', 'Ejecucion no encontrada.');
      const { sql, values } = buildSet(patch, {
        status: { col: 'status' },
        result: { col: 'result', enc: (v) => (v === null ? null : toJson(v)) },
        error: { col: 'error' },
        note: { col: 'note' },
        resolvedAt: { col: 'resolved_at' },
      });
      if (sql) run(`UPDATE action_runs SET ${sql} WHERE tenant_id = ? AND id = ?`, ...values, tenantId, id);
      return getActionRun(tenantId, id)!;
    },
    listActionRuns(tenantId, filter) {
      const where = ['tenant_id = ?'];
      const args: unknown[] = [tenantId];
      if (filter?.taskId) {
        where.push('task_id = ?');
        args.push(filter.taskId);
      }
      if (filter?.status) {
        where.push('status = ?');
        args.push(filter.status);
      }
      return all(`SELECT * FROM action_runs WHERE ${where.join(' AND ')} ORDER BY created_at ASC, rowid ASC`, ...args).map(toRun);
    },
  };

  // init() es idempotente; se llama aqui para que el store sea usable de inmediato.
  store.init();
  return store;
}
