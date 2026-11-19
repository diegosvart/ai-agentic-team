import { createHash } from 'node:crypto';
import type { Connector } from '../contracts';

/** Referencia estable para la misma tarea y accion (util para auditoria y tests). */
export function internalReference(taskId: string, actionKey: string): string {
  const digest = createHash('sha256').update(`${taskId}:${actionKey}`).digest('hex');
  return `INT-${digest.slice(0, 10).toUpperCase()}`;
}

/** Conector interno: registra la accion como hecha sin efecto externo. */
export function createInternalConnector(): Connector {
  return {
    info: {
      key: 'internal',
      name: 'Interno (simulado)',
      description: 'Registra la accion dentro de la plataforma sin llamar a sistemas externos. Ideal para demos y prototipos.',
      maturity: 'ready',
      configFields: [],
    },
    validateConfig() {
      return [];
    },
    async execute({ action, params, agent, task }) {
      return {
        ok: true,
        simulated: true,
        output: {
          mensaje: `${agent.name} ejecuto "${action.name}" (simulado).`,
          accion: action.key,
          parametros: params,
          referencia: internalReference(task.id, action.key),
        },
      };
    },
  };
}
