import type { Store, ToolCall, ToolResult } from '../contracts';

/**
 * Estado persistido de una subtarea pausada. Se guarda via Store.saveConversation envuelto en un
 * unico elemento, para que la reanudacion no dependa de memoria (sobrevive a reinicios).
 */
export interface CheckpointCall {
  call: ToolCall;
  /** ActionRun que respalda la llamada (ejecutada o pendiente de aprobacion). */
  runId: string | null;
  /** Resultado ya decidido sin ActionRun (accion desconocida o parametros invalidos). */
  local: ToolResult | null;
}

export interface Checkpoint {
  turns: number;
  /** Conversacion del LLM (opaca). */
  conversation: unknown[];
  /** Llamadas del turno pausado, en orden. Vacio = no hay turno pendiente de reanudar. */
  calls: CheckpointCall[];
}

const KIND = 'agentic-office.engine-checkpoint';

export function saveCheckpoint(store: Store, tenantId: string, taskId: string, cp: Checkpoint): void {
  store.saveConversation(tenantId, taskId, [{ kind: KIND, v: 1, ...cp }]);
}

export function loadCheckpoint(store: Store, tenantId: string, taskId: string): Checkpoint | null {
  const data = store.loadConversation(tenantId, taskId);
  const first = data?.[0] as Partial<Checkpoint> & { kind?: unknown } | undefined;
  if (!first || first.kind !== KIND || !Array.isArray(first.conversation) || !Array.isArray(first.calls)) {
    return null;
  }
  return { turns: Number(first.turns) || 0, conversation: first.conversation, calls: first.calls };
}
