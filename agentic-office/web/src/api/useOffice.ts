import { useCallback, useEffect, useReducer, useRef } from 'react';
import type {
  ActionDef,
  ActionRun,
  Agent,
  AgentStatus,
  ConnectorInfo,
  HealthResponse,
  OfficeEvent,
  StateResponse,
  Task,
  TaskTree,
  Tenant,
} from '@agentic-office/shared';
import { EVENTS_URL, api, errorMessage } from './client';

export type Connection = 'connecting' | 'online' | 'offline';
export type StatusMap = Record<string, { status: AgentStatus; taskId: string | null; detail: string | null }>;

interface OfficeState {
  phase: 'loading' | 'ready' | 'error';
  error: string | null;
  connection: Connection;
  health: HealthResponse | null;
  data: StateResponse | null;
  tasks: TaskTree[];
  approvals: ActionRun[];
}

type Msg =
  | { type: 'loading' }
  | { type: 'loaded'; health: HealthResponse; data: StateResponse; tasks: TaskTree[]; approvals: ActionRun[] }
  | { type: 'loadFailed'; message: string }
  | { type: 'data'; data: StateResponse }
  | { type: 'connection'; connection: Connection }
  | { type: 'event'; event: OfficeEvent }
  | { type: 'tree'; tree: TaskTree }
  | { type: 'run'; run: ActionRun };

const initial: OfficeState = {
  phase: 'loading',
  error: null,
  connection: 'connecting',
  health: null,
  data: null,
  tasks: [],
  approvals: [],
};

const byCreated = (a: Task, b: Task) => a.createdAt.localeCompare(b.createdAt);

/** Inserta o reemplaza una tarea. Las raices van primero (mas recientes arriba). */
function upsertTask(trees: TaskTree[], task: Task): TaskTree[] {
  if (task.parentId === null) {
    const i = trees.findIndex((t) => t.task.id === task.id);
    if (i === -1) return [{ task, children: [], actionRuns: [] }, ...trees];
    return trees.map((t, j) => (j === i ? { ...t, task } : t));
  }
  return trees.map((t) => {
    if (t.task.id !== task.parentId) return t;
    const exists = t.children.some((c) => c.id === task.id);
    const children = exists ? t.children.map((c) => (c.id === task.id ? task : c)) : [...t.children, task];
    return { ...t, children: children.sort(byCreated) };
  });
}

function upsertRun(trees: TaskTree[], run: ActionRun): TaskTree[] {
  return trees.map((t) => {
    const owns = t.task.id === run.taskId || t.children.some((c) => c.id === run.taskId);
    if (!owns) return t;
    const exists = t.actionRuns.some((r) => r.id === run.id);
    return {
      ...t,
      actionRuns: exists ? t.actionRuns.map((r) => (r.id === run.id ? run : r)) : [...t.actionRuns, run],
    };
  });
}

function upsertApproval(list: ActionRun[], run: ActionRun): ActionRun[] {
  const rest = list.filter((r) => r.id !== run.id);
  return run.status === 'pending_approval'
    ? [...rest, run].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : rest;
}

function applyEvent(s: OfficeState, e: OfficeEvent): OfficeState {
  switch (e.type) {
    case 'task.created':
    case 'task.updated':
      return { ...s, tasks: upsertTask(s.tasks, e.task) };
    case 'delegation':
      return { ...s, tasks: upsertTask(s.tasks, e.task) };
    case 'action.updated':
      return { ...s, tasks: upsertRun(s.tasks, e.run), approvals: upsertApproval(s.approvals, e.run) };
    case 'agent.status':
      if (!s.data) return s;
      return {
        ...s,
        data: {
          ...s.data,
          agentStatus: {
            ...s.data.agentStatus,
            [e.agentId]: { status: e.status, taskId: e.taskId, detail: e.detail },
          },
        },
      };
    default:
      return s;
  }
}

function reducer(s: OfficeState, m: Msg): OfficeState {
  switch (m.type) {
    case 'loading':
      return { ...s, phase: 'loading', error: null };
    case 'loaded':
      return { ...s, phase: 'ready', error: null, health: m.health, data: m.data, tasks: m.tasks, approvals: m.approvals };
    case 'loadFailed':
      return { ...s, phase: 'error', error: m.message };
    case 'data':
      return { ...s, data: m.data };
    case 'connection':
      return { ...s, connection: m.connection };
    case 'event':
      return applyEvent(s, m.event);
    case 'tree': {
      const i = s.tasks.findIndex((t) => t.task.id === m.tree.task.id);
      // Si los eventos ya la insertaron, se conserva la version mas reciente que ellos construyeron.
      return i === -1 ? { ...s, tasks: [m.tree, ...s.tasks] } : s;
    }
    case 'run':
      return { ...s, tasks: upsertRun(s.tasks, m.run), approvals: upsertApproval(s.approvals, m.run) };
  }
}

const EVENT_TYPES = [
  'task.created',
  'task.updated',
  'agent.status',
  'delegation',
  'action.updated',
  'agent.say',
  'config.changed',
] as const;

export interface UseOffice {
  phase: OfficeState['phase'];
  error: string | null;
  connection: Connection;
  health: HealthResponse | null;
  tenant: Tenant | null;
  agents: Agent[];
  actions: ActionDef[];
  connectors: ConnectorInfo[];
  statuses: StatusMap;
  tasks: TaskTree[];
  approvals: ActionRun[];
  /** Estable: la oficina lo usa para recibir eventos sin re-suscribirse. */
  subscribe: (listener: (event: OfficeEvent) => void) => () => void;
  /** Recarga todo (boton "Reintentar"). */
  reload: () => void;
  /** Recarga agentes y acciones tras editarlos. */
  reloadState: () => Promise<void>;
  applyRun: (run: ActionRun) => void;
  applyTree: (tree: TaskTree) => void;
}

const NO_AGENTS: Agent[] = [];
const NO_ACTIONS: ActionDef[] = [];
const NO_CONNECTORS: ConnectorInfo[] = [];
const NO_STATUS: StatusMap = {};

export function useOffice(): UseOffice {
  const [s, dispatch] = useReducer(reducer, initial);
  const stateRef = useRef(s);
  stateRef.current = s;
  const listeners = useRef(new Set<(event: OfficeEvent) => void>());

  const subscribe = useCallback((listener: (event: OfficeEvent) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const load = useCallback(async (visible: boolean) => {
    if (visible) dispatch({ type: 'loading' });
    try {
      const [health, data, tasks, approvals] = await Promise.all([
        api.getHealth(),
        api.getState(),
        api.listTasks(),
        api.listApprovals(),
      ]);
      dispatch({ type: 'loaded', health, data, tasks, approvals });
    } catch (e) {
      if (visible) dispatch({ type: 'loadFailed', message: errorMessage(e) });
    }
  }, []);

  const reloadState = useCallback(async () => {
    try {
      dispatch({ type: 'data', data: await api.getState() });
    } catch {
      // El siguiente evento config.changed o una reconexion lo corrige.
    }
  }, []);

  const reloadTasks = useCallback(async () => {
    try {
      const [tasks, approvals] = await Promise.all([api.listTasks(), api.listApprovals()]);
      const current = stateRef.current;
      if (current.data && current.health) {
        dispatch({ type: 'loaded', health: current.health, data: current.data, tasks, approvals });
      }
    } catch {
      // Se reintenta con el proximo evento huerfano o al reconectar.
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let attempt = 0;
    let wasDown = false;

    const handle = (raw: string) => {
      let event: OfficeEvent;
      try {
        event = JSON.parse(raw) as OfficeEvent;
      } catch {
        return;
      }
      if (!event || typeof event.type !== 'string') return;
      dispatch({ type: 'event', event });
      for (const l of listeners.current) l(event);

      if (event.type === 'config.changed') {
        void reloadState();
      } else if (event.type === 'task.created' || event.type === 'task.updated' || event.type === 'delegation') {
        const known = stateRef.current.tasks;
        const parent = event.task.parentId;
        if (parent !== null && !known.some((t) => t.task.id === parent)) void reloadTasks();
      } else if (event.type === 'action.updated') {
        const taskId = event.run.taskId;
        const owned = stateRef.current.tasks.some(
          (t) => t.task.id === taskId || t.children.some((c) => c.id === taskId),
        );
        if (!owned) void reloadTasks();
      }
    };

    const connect = () => {
      if (disposed) return;
      dispatch({ type: 'connection', connection: 'connecting' });
      const source = new EventSource(EVENTS_URL);
      es = source;
      source.onopen = () => {
        attempt = 0;
        dispatch({ type: 'connection', connection: 'online' });
        if (wasDown) {
          wasDown = false;
          // Pudimos perder eventos mientras estuvimos desconectados.
          void load(false);
        }
      };
      source.onmessage = (m: MessageEvent<string>) => handle(m.data);
      for (const t of EVENT_TYPES) {
        source.addEventListener(t, (m) => handle((m as MessageEvent<string>).data));
      }
      // El servidor ya no tiene los eventos pedidos (buffer superado): se recarga el estado.
      source.addEventListener('resync', () => void load(false));
      source.onerror = () => {
        wasDown = true;
        dispatch({ type: 'connection', connection: 'offline' });
        // Si el navegador desistio (p. ej. 5xx), reconectamos nosotros con espera creciente.
        if (source.readyState === EventSource.CLOSED) {
          source.close();
          if (es === source) es = null;
          timer = setTimeout(connect, Math.min(1000 * 2 ** attempt, 15000));
          attempt += 1;
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [load, reloadState, reloadTasks]);

  const reload = useCallback(() => void load(true), [load]);
  const applyRun = useCallback((run: ActionRun) => dispatch({ type: 'run', run }), []);
  const applyTree = useCallback((tree: TaskTree) => dispatch({ type: 'tree', tree }), []);

  return {
    phase: s.phase,
    error: s.error,
    connection: s.connection,
    health: s.health,
    tenant: s.data?.tenant ?? null,
    agents: s.data?.agents ?? NO_AGENTS,
    actions: s.data?.actions ?? NO_ACTIONS,
    connectors: s.data?.connectors ?? NO_CONNECTORS,
    statuses: s.data?.agentStatus ?? NO_STATUS,
    tasks: s.tasks,
    approvals: s.approvals,
    subscribe,
    reload,
    reloadState,
    applyRun,
    applyTree,
  };
}
