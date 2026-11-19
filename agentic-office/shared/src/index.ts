/**
 * Contrato compartido entre servidor y web. Es la fuente de verdad del dominio:
 * cualquier cambio aqui afecta a ambos lados.
 */

/** Nivel de modelo. El id concreto se resuelve en el servidor (MODEL_OPUS / MODEL_SONNET). */
export type ModelTier = 'opus' | 'sonnet';
export type AgentRole = 'ceo' | 'area';
export type Complexity = 'simple' | 'complex';

/** Estado visible de un agente en la oficina. */
export type AgentStatus = 'idle' | 'thinking' | 'delegating' | 'working' | 'waiting_approval';

export interface Tenant {
  id: string;
  name: string;
}

export interface Agent {
  id: string;
  tenantId: string;
  /** Slug estable y unico por tenant, p. ej. "soporte". El CEO lo usa para delegar. */
  key: string;
  name: string;
  role: AgentRole;
  /** Area de la empresa, p. ej. "Soporte". Para el CEO: "Direccion". */
  area: string;
  /** Responsabilidades del agente; se inyecta en su prompt de sistema. */
  description: string;
  /** Modelo por defecto. Las tareas marcadas "complex" escalan a opus. */
  defaultModel: ModelTier;
  /** Color hex del personaje y su escritorio en la oficina. */
  color: string;
  enabled: boolean;
  createdAt: string;
}

export type ActionParamType = 'string' | 'number' | 'boolean';

export interface ActionParam {
  name: string;
  type: ActionParamType;
  description: string;
  required: boolean;
  /** Valores permitidos (solo para type "string"). */
  enum?: string[];
}

/** Accion declarada por el usuario. Se expone al agente dueno como herramienta. */
export interface ActionDef {
  id: string;
  tenantId: string;
  agentId: string;
  /** Nombre de herramienta: ^[a-z][a-z0-9_]{1,62}$, unico por tenant. */
  key: string;
  name: string;
  /** Que hace y cuando usarla; el modelo decide con este texto. */
  description: string;
  params: ActionParam[];
  /** Clave del conector que la ejecuta (ver ConnectorInfo). */
  connector: string;
  connectorConfig: Record<string, unknown>;
  /** Si es true, la ejecucion queda en la bandeja hasta que el usuario apruebe. */
  requiresApproval: boolean;
  enabled: boolean;
  createdAt: string;
}

export interface ConnectorConfigField {
  name: string;
  label: string;
  type: 'string' | 'boolean' | 'select';
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface ConnectorInfo {
  key: string;
  name: string;
  description: string;
  /** "ready": ejecuta de verdad. "stub": interfaz definida, ejecucion simulada. */
  maturity: 'ready' | 'stub';
  configFields: ConnectorConfigField[];
}

export type TaskStatus =
  | 'queued'
  | 'planning'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed';

/**
 * Tarea. La raiz (parentId null) es la solicitud del usuario y pertenece al CEO;
 * las hijas son las subtareas delegadas a los agentes de area.
 */
export interface Task {
  id: string;
  tenantId: string;
  parentId: string | null;
  agentId: string;
  title: string;
  instructions: string;
  complexity: Complexity;
  /** Id del modelo realmente usado ("mock" en modo simulacion). */
  model: string | null;
  status: TaskStatus;
  result: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ActionRunStatus =
  | 'pending_approval'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'rejected';

/** Una invocacion de una accion por un agente. Es tambien el registro de auditoria. */
export interface ActionRun {
  id: string;
  tenantId: string;
  taskId: string;
  agentId: string;
  actionId: string;
  actionKey: string;
  actionName: string;
  params: Record<string, unknown>;
  status: ActionRunStatus;
  result: unknown;
  error: string | null;
  /** Nota que el usuario escribio al aprobar o rechazar (se le entrega al agente). */
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface TaskTree {
  task: Task;
  children: Task[];
  /** Ejecuciones de acciones de la raiz y de todas sus hijas. */
  actionRuns: ActionRun[];
}

/** Eventos en tiempo real (SSE en GET /api/events). */
export type OfficeEventPayload =
  | { type: 'task.created'; task: Task }
  | { type: 'task.updated'; task: Task }
  | { type: 'agent.status'; agentId: string; status: AgentStatus; taskId: string | null; detail: string | null }
  /** El CEO entrega una subtarea a un agente: el frontend anima el recorrido. */
  | { type: 'delegation'; fromAgentId: string; toAgentId: string; task: Task }
  | { type: 'action.updated'; run: ActionRun }
  /** Frase corta para el globo de dialogo del agente. */
  | { type: 'agent.say'; agentId: string; text: string }
  | { type: 'config.changed' };

export type OfficeEvent = OfficeEventPayload & { seq: number; ts: string };

// ---------- DTOs de la API REST (prefijo /api) ----------

export interface HealthResponse {
  ok: true;
  /** "live": llamadas reales a Claude. "mock": simulacion sin API key. */
  llmMode: 'live' | 'mock';
  models: Record<ModelTier, string>;
}

/** GET /api/state */
export interface StateResponse {
  tenant: Tenant;
  agents: Agent[];
  actions: ActionDef[];
  connectors: ConnectorInfo[];
  /** Estado actual de cada agente, para pintar la oficina al cargar. */
  agentStatus: Record<string, { status: AgentStatus; taskId: string | null; detail: string | null }>;
}

/** POST /api/agents, PATCH /api/agents/:id (parcial). El CEO no se puede crear ni borrar. */
export interface AgentInput {
  key: string;
  name: string;
  area: string;
  description: string;
  defaultModel: ModelTier;
  color: string;
  enabled: boolean;
}

/** POST /api/actions, PATCH /api/actions/:id (parcial). */
export interface ActionInput {
  agentId: string;
  key: string;
  name: string;
  description: string;
  params: ActionParam[];
  connector: string;
  connectorConfig: Record<string, unknown>;
  requiresApproval: boolean;
  enabled: boolean;
}

/** POST /api/requests -> TaskTree (201). La orquestacion corre en segundo plano. */
export interface CreateRequestInput {
  text: string;
}

/** GET /api/tasks -> TaskTree[] (raices mas recientes primero). GET /api/tasks/:id -> TaskTree. */
/** GET /api/approvals -> ActionRun[] en estado pending_approval. */
/** POST /api/action-runs/:id/approve | /reject  body: ResolveApprovalInput -> ActionRun */
export interface ResolveApprovalInput {
  note?: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

export const ACTION_KEY_PATTERN = /^[a-z][a-z0-9_]{1,62}$/;
export const AGENT_KEY_PATTERN = /^[a-z][a-z0-9_-]{1,40}$/;
