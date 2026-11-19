/**
 * Interfaces internas del servidor. Cada modulo se implementa contra estas
 * interfaces y se ensambla en src/index.ts (composition root).
 *
 *   store/       -> Store            (SQLite via node:sqlite)
 *   events/      -> EventBus         (en memoria + SSE)
 *   llm/         -> LLMProvider      (anthropic.ts real, mock.ts simulado)
 *   connectors/  -> ConnectorRegistry
 *   engine/      -> Engine           (orquestador: CEO planifica, delega, sintetiza)
 *   api/         -> rutas Fastify
 */
import type {
  ActionDef,
  ActionInput,
  ActionRun,
  ActionRunStatus,
  Agent,
  AgentInput,
  AgentStatus,
  Complexity,
  ConnectorInfo,
  ModelTier,
  OfficeEvent,
  OfficeEventPayload,
  Task,
  TaskStatus,
  TaskTree,
  Tenant,
} from '@agentic-office/shared';

export interface Config {
  port: number;
  dbPath: string;
  llmMode: 'live' | 'mock';
  models: Record<ModelTier, string>;
  mockStepDelayMs: number;
  /**
   * Origenes externos autorizados a llamar a la API (CORS). El mismo origen siempre se admite.
   * Sin login, cualquier otro origen queda bloqueado. Por defecto, el servidor de Vite.
   */
  corsOrigins?: string[];
}

// ---------- Persistencia ----------

/** Todas las operaciones estan acotadas por tenantId: es la frontera de aislamiento. */
export interface Store {
  /** Crea tablas y, si la base esta vacia, carga el tenant demo con su plantilla. */
  init(): void;
  getDefaultTenant(): Tenant;

  listAgents(tenantId: string): Agent[];
  getAgent(tenantId: string, id: string): Agent | null;
  createAgent(tenantId: string, input: AgentInput): Agent;
  updateAgent(tenantId: string, id: string, patch: Partial<AgentInput>): Agent;
  /** Borra el agente y sus acciones. Lanza si es el CEO. */
  deleteAgent(tenantId: string, id: string): void;

  listActions(tenantId: string, agentId?: string): ActionDef[];
  getAction(tenantId: string, id: string): ActionDef | null;
  createAction(tenantId: string, input: ActionInput): ActionDef;
  updateAction(tenantId: string, id: string, patch: Partial<ActionInput>): ActionDef;
  deleteAction(tenantId: string, id: string): void;

  createTask(
    tenantId: string,
    input: { parentId: string | null; agentId: string; title: string; instructions: string; complexity: Complexity },
  ): Task;
  getTask(tenantId: string, id: string): Task | null;
  updateTask(
    tenantId: string,
    id: string,
    patch: Partial<Pick<Task, 'status' | 'result' | 'error' | 'model'>>,
  ): Task;
  listRootTasks(tenantId: string, limit?: number): Task[];
  listChildTasks(tenantId: string, parentId: string): Task[];
  getTaskTree(tenantId: string, rootId: string): TaskTree | null;
  /** Tareas no terminales (para marcar como fallidas al reiniciar el servidor). */
  listUnfinishedTasks(tenantId: string): Task[];

  /** Conversacion opaca del LLM para una tarea; permite pausar y reanudar tras una aprobacion. */
  saveConversation(tenantId: string, taskId: string, conversation: unknown[]): void;
  loadConversation(tenantId: string, taskId: string): unknown[] | null;

  createActionRun(
    tenantId: string,
    input: {
      taskId: string;
      agentId: string;
      action: ActionDef;
      params: Record<string, unknown>;
      status: ActionRunStatus;
      /** Id del tool_use del modelo, necesario para devolver el tool_result al reanudar. */
      toolCallId: string;
    },
  ): ActionRun;
  getActionRun(tenantId: string, id: string): ActionRun | null;
  getActionRunToolCallId(tenantId: string, id: string): string | null;
  updateActionRun(
    tenantId: string,
    id: string,
    patch: Partial<Pick<ActionRun, 'status' | 'result' | 'error' | 'note' | 'resolvedAt'>>,
  ): ActionRun;
  listActionRuns(tenantId: string, filter?: { taskId?: string; status?: ActionRunStatus }): ActionRun[];
}

// ---------- Eventos ----------

export interface EventBus {
  publish(tenantId: string, payload: OfficeEventPayload): OfficeEvent;
  /** Devuelve la funcion para cancelar la suscripcion. */
  subscribe(tenantId: string, listener: (event: OfficeEvent) => void): () => void;
  /** Ultimos eventos, para reponer a un cliente que reconecta. */
  recent(tenantId: string, afterSeq?: number): OfficeEvent[];
}

// ---------- LLM ----------

export interface AgentContext {
  agent: Agent;
  actions: ActionDef[];
}

export interface PlannedSubtask {
  /** Agent.key del agente de area destinatario. */
  agentKey: string;
  title: string;
  instructions: string;
  complexity: Complexity;
}

export interface Plan {
  /** Razonamiento breve del CEO, visible para el usuario. */
  summary: string;
  subtasks: PlannedSubtask[];
  /** Respuesta directa cuando la solicitud no requiere delegar (subtasks vacio). */
  directAnswer: string | null;
}

export interface ToolCall {
  id: string;
  /** ActionDef.key */
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError: boolean;
}

export interface AgentStep {
  /** Conversacion actualizada (incluye el turno del asistente). Opaca para el motor. */
  conversation: unknown[];
  toolCalls: ToolCall[];
  /** Texto final cuando el agente termina (toolCalls vacio). */
  finalText: string | null;
}

export interface LLMProvider {
  readonly mode: 'live' | 'mock';

  /** El CEO descompone la solicitud en subtareas para los agentes de area habilitados. */
  plan(input: { model: string; ceo: Agent; team: AgentContext[]; request: string }): Promise<Plan>;

  /** Conversacion inicial de un agente de area para una subtarea. */
  startConversation(input: { ctx: AgentContext; task: Task; rootRequest: string }): unknown[];

  /** Un turno del agente: devuelve llamadas a acciones o el texto final. */
  step(input: { model: string; ctx: AgentContext; conversation: unknown[] }): Promise<AgentStep>;

  /** Agrega los resultados de las acciones a la conversacion (todos en un solo mensaje). */
  addToolResults(conversation: unknown[], results: ToolResult[]): unknown[];

  /** El CEO redacta la respuesta final a partir de los resultados de las subtareas. */
  synthesize(input: {
    model: string;
    ceo: Agent;
    request: string;
    results: Array<{ agent: Agent; task: Task }>;
  }): Promise<string>;
}

// ---------- Conectores ----------

export interface ConnectorResult {
  ok: boolean;
  /** Dato devuelto al agente como resultado de la herramienta. */
  output: unknown;
  error?: string;
  /** true si no hubo efecto real (stub o dry-run). */
  simulated: boolean;
}

export interface Connector {
  readonly info: ConnectorInfo;
  /** Valida connectorConfig al guardar una accion. Devuelve mensajes de error (vacio = valido). */
  validateConfig(config: Record<string, unknown>): string[];
  execute(input: {
    action: ActionDef;
    params: Record<string, unknown>;
    agent: Agent;
    task: Task;
  }): Promise<ConnectorResult>;
}

export interface ConnectorRegistry {
  list(): ConnectorInfo[];
  get(key: string): Connector | null;
}

// ---------- Motor ----------

export interface AgentStatusSnapshot {
  status: AgentStatus;
  taskId: string | null;
  detail: string | null;
}

export interface Engine {
  /** Crea la tarea raiz y lanza la orquestacion en segundo plano. Devuelve de inmediato. */
  submitRequest(tenantId: string, text: string): TaskTree;
  /** Resuelve una accion pendiente y reanuda la subtarea pausada. */
  resolveApproval(tenantId: string, actionRunId: string, approved: boolean, note?: string): Promise<ActionRun>;
  agentStatuses(tenantId: string): Record<string, AgentStatusSnapshot>;
  /** Al arrancar: marca como fallidas las tareas que quedaron a medias (salvo las que esperan aprobacion). */
  recover(tenantId: string): void;
  /** Espera a que no queden orquestaciones activas (para tests). */
  idle(): Promise<void>;
}

export type { TaskStatus };
