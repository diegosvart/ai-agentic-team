import type {
  ActionDef,
  ActionInput,
  ActionRun,
  Agent,
  AgentInput,
  ApiError,
  CreateRequestInput,
  HealthResponse,
  ResolveApprovalInput,
  StateResponse,
  TaskTree,
} from '@agentic-office/shared';

export const EVENTS_URL = '/api/events';

/** Error de la API: `message` es el `error` del servidor; `details` trae la validacion detallada. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.details = details;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiRequestError('No se pudo contactar con el servidor.', 0);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiError>;
    throw new ApiRequestError(err.error ?? `Error ${res.status} del servidor`, res.status, err.details);
  }
  return data as T;
}

export const api = {
  getHealth: () => request<HealthResponse>('GET', '/health'),
  getState: () => request<StateResponse>('GET', '/state'),

  createAgent: (input: AgentInput) => request<Agent>('POST', '/agents', input),
  updateAgent: (id: string, patch: Partial<AgentInput>) =>
    request<Agent>('PATCH', `/agents/${encodeURIComponent(id)}`, patch),
  deleteAgent: (id: string) => request<void>('DELETE', `/agents/${encodeURIComponent(id)}`),

  createAction: (input: ActionInput) => request<ActionDef>('POST', '/actions', input),
  updateAction: (id: string, patch: Partial<ActionInput>) =>
    request<ActionDef>('PATCH', `/actions/${encodeURIComponent(id)}`, patch),
  deleteAction: (id: string) => request<void>('DELETE', `/actions/${encodeURIComponent(id)}`),

  createRequest: (text: string) =>
    request<TaskTree>('POST', '/requests', { text } satisfies CreateRequestInput),
  listTasks: () => request<TaskTree[]>('GET', '/tasks'),
  getTask: (id: string) => request<TaskTree>('GET', `/tasks/${encodeURIComponent(id)}`),

  listApprovals: () => request<ActionRun[]>('GET', '/approvals'),
  approveRun: (id: string, note?: string) =>
    request<ActionRun>('POST', `/action-runs/${encodeURIComponent(id)}/approve`, {
      note: note || undefined,
    } satisfies ResolveApprovalInput),
  rejectRun: (id: string, note?: string) =>
    request<ActionRun>('POST', `/action-runs/${encodeURIComponent(id)}/reject`, {
      note: note || undefined,
    } satisfies ResolveApprovalInput),
};

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
