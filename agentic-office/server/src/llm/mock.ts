/**
 * Simulacion determinista del LLM, sin red. La usan la demo sin API key y los tests.
 * Misma entrada -> misma salida (no usa Math.random ni la hora).
 */
import type { ActionDef, ActionParam, Agent, Complexity } from '@agentic-office/shared';
import type { AgentContext, AgentStep, Config, LLMProvider, Plan, PlannedSubtask, ToolCall, ToolResult } from '../contracts';

// ---------- Utilidades de texto ----------

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const STOPWORDS = new Set([
  'para', 'como', 'sobre', 'desde', 'entre', 'todos', 'todas', 'cada', 'este', 'esta', 'estos', 'estas', 'favor',
  'necesito', 'quiero', 'hacer', 'puedes', 'podrias', 'nuestro', 'nuestra', 'nuestros', 'nuevo', 'nueva', 'donde',
  'cuando', 'tambien', 'porque', 'tengo', 'tiene', 'tienen', 'empresa', 'equipo', 'agente', 'area', 'areas', 'gestion',
  'gestiona', 'gestionar', 'segun', 'luego', 'despues', 'antes', 'hola', 'gracias', 'ayuda',
  'ayudame', 'necesitamos', 'queremos', 'debe', 'deben', 'puede', 'pueden', 'solo', 'mismo', 'otra', 'otro', 'otros',
  'muy', 'mas', 'menos', 'algo', 'alguna', 'alguno', 'ellos', 'ellas', 'usted', 'ustedes', 'accion', 'acciones',
  'tarea', 'tareas', 'enviar', 'envia', 'crear', 'crea', 'registrar', 'registra', 'datos', 'informacion',
]);

/** Raiz aproximada: primeros 5 caracteres (agrupa factura/facturas/facturacion). */
function stem(token: string): string {
  return token.length > 5 ? token.slice(0, 5) : token;
}

export function tokens(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

function stems(text: string): Set<string> {
  return new Set(tokens(text).map(stem));
}

function compact(text: string): string {
  return normalize(text).replace(/[^a-z0-9]/g, '');
}

/**
 * Sinonimos: palabras de la solicitud -> fragmentos que identifican el area
 * (se buscan dentro de la key y el area del agente, sin espacios ni puntos).
 * Las palabras se reducen a su raiz al cargar el modulo.
 */
const SYNONYM_GROUPS: Array<[targets: string[], words: string[]]> = [
  [['contab', 'finanz'], ['factura', 'pago', 'pagos', 'cobro', 'cobranza', 'gasto', 'impuesto', 'balance', 'presupuesto', 'boleta', 'contable', 'tesoreria']],
  [['contab', 'rrhh', 'recursos'], ['nomina', 'sueldo', 'sueldos', 'remuneracion']],
  [['soporte'], ['cliente', 'reclamo', 'ticket', 'incidencia', 'queja', 'devolucion', 'garantia', 'falla', 'problema', 'usuario']],
  [['marketing'], ['campana', 'redes', 'publicidad', 'anuncio', 'instagram', 'newsletter', 'marca', 'contenido', 'promocion', 'post']],
  [['comunic'], ['comunicado', 'prensa', 'noticia', 'medios', 'vocero', 'boletin', 'circular']],
  [['ventas', 'comercial'], ['lead', 'leads', 'cotizacion', 'cotizar', 'venta', 'prospecto', 'propuesta', 'oferta', 'descuento', 'oportunidad']],
  [['rrhh', 'recursos', 'personas'], ['contratar', 'contratacion', 'vacaciones', 'empleado', 'candidato', 'seleccion', 'onboarding', 'personal', 'licencia', 'entrevista', 'postulante']],
];

const SYNONYMS: Record<string, string[]> = {};
for (const [targets, words] of SYNONYM_GROUPS) {
  for (const w of words) {
    const key = stem(normalize(w));
    SYNONYMS[key] = [...new Set([...(SYNONYMS[key] ?? []), ...targets])];
  }
}

// ---------- Planificacion ----------

const COMPLEX_HINTS = /\b(analiza\w*|analisis|estrategi\w*|plan|planes|planifica\w*|evalua\w*|compara\w*|diagnostic\w*)\b/;

export function detectComplexity(request: string): Complexity {
  const n = normalize(request);
  return COMPLEX_HINTS.test(n) || n.length > 280 ? 'complex' : 'simple';
}

/** Puntaje de afinidad de un agente con un texto. Coincidencias fuertes valen 3, debiles 1. */
function scoreAgent(ctx: AgentContext, text: string): number {
  const { agent, actions } = ctx;
  const reqStems = stems(text);
  const identity = compact(`${agent.key} ${agent.area}`);
  const strong = stems(`${agent.key} ${agent.area} ${agent.name} ${actions.map((a) => `${a.key} ${a.name}`).join(' ')}`);
  const weak = stems(`${agent.description} ${actions.map((a) => a.description).join(' ')}`);

  let score = 0;
  for (const s of reqStems) {
    const targets = SYNONYMS[s];
    if (targets && targets.some((t) => identity.includes(t))) score += 3;
    else if (strong.has(s)) score += 3;
    else if (weak.has(s)) score += 1;
  }
  return score;
}

function shorten(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function mockPlan(team: AgentContext[], request: string): Plan {
  const complexity = detectComplexity(request);
  const ranked = team
    .map((ctx, index) => ({ ctx, index, score: scoreAgent(ctx, request) }))
    .filter((r) => r.score >= 3)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 4);

  if (ranked.length === 0) {
    return {
      summary: 'La solicitud no corresponde a ninguna area del equipo; respondo directamente.',
      subtasks: [],
      directAnswer:
        'Hola, soy el CEO (modo simulacion). No identifique un area del equipo que deba encargarse de esto. ' +
        'Prueba mencionando el tema concreto: facturas, clientes, campanas, comunicados, cotizaciones o personal.',
    };
  }

  const subtasks: PlannedSubtask[] = ranked.map(({ ctx }) => ({
    agentKey: ctx.agent.key,
    title: `${ctx.agent.area}: ${shorten(request, 60)}`,
    instructions:
      `Atiende la parte de esta solicitud que corresponde al area de ${ctx.agent.area}: "${shorten(request, 400)}". ` +
      'Usa tus acciones si corresponde e informa el resultado.',
    complexity,
  }));
  return {
    summary: `Delego en ${ranked.map((r) => r.ctx.agent.area).join(', ')} segun los temas de la solicitud.`,
    subtasks,
    directAnswer: null,
  };
}

// ---------- Conversacion de un agente ----------

type MockEntry =
  | { kind: 'start'; taskId: string; title: string; instructions: string; rootRequest: string }
  | { kind: 'assistant'; toolCalls: ToolCall[]; text: string | null }
  | { kind: 'results'; results: ToolResult[] };

function sampleValue(param: ActionParam, instructions: string): unknown {
  switch (param.type) {
    case 'number':
      return 1;
    case 'boolean':
      return true;
    case 'string':
    default: {
      const first = param.enum?.[0];
      if (first !== undefined) return first;
      return shorten(`${param.description || param.name}: ${instructions}`, 160);
    }
  }
}

export function sampleParams(action: ActionDef, instructions: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of action.params) out[p.name] = sampleValue(p, instructions);
  return out;
}

/** Las 1-2 acciones habilitadas mas afines a las instrucciones (al menos una si existen). */
export function pickActions(actions: ActionDef[], instructions: string): ActionDef[] {
  const enabled = actions.filter((a) => a.enabled);
  if (enabled.length === 0) return [];
  const req = stems(instructions);
  const ranked = enabled
    .map((a, index) => {
      const s = stems(`${a.key.replace(/_/g, ' ')} ${a.name} ${a.description}`);
      let score = 0;
      for (const t of req) if (s.has(t)) score++;
      return { a, index, score };
    })
    .sort((x, y) => y.score - x.score || x.index - y.index);
  const [first, second] = ranked;
  const picked: ActionDef[] = [];
  if (first) picked.push(first.a);
  if (second && second.score > 0) picked.push(second.a);
  return picked;
}

function summarizeResults(calls: ToolCall[], results: ToolResult[], actions: ActionDef[]): string {
  const nameOf = (key: string) => actions.find((a) => a.key === key)?.name ?? key;
  const ok: string[] = [];
  const rejected: string[] = [];
  const failed: string[] = [];
  for (const call of calls) {
    const r = results.find((x) => x.toolCallId === call.id);
    const name = nameOf(call.name);
    if (!r) failed.push(`${name} (sin resultado)`);
    else if (!r.isError) ok.push(name);
    else if (/rechaz/i.test(r.content)) rejected.push(`${name} (${shorten(r.content, 120)})`);
    else failed.push(`${name} (${shorten(r.content, 120)})`);
  }
  const parts: string[] = [];
  if (ok.length) parts.push(`Ejecute: ${ok.join(', ')}.`);
  if (rejected.length) parts.push(`Rechazadas por el usuario: ${rejected.join('; ')}.`);
  if (failed.length) parts.push(`Fallaron: ${failed.join('; ')}.`);
  if (parts.length === 0) parts.push('No se ejecutaron acciones.');
  return parts.join(' ');
}

// ---------- Proveedor ----------

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function areaLine(agent: Agent, status: string, body: string | null): string {
  return `- ${agent.area}: ${status}${body ? ` ${shorten(body, 240)}` : ''}`;
}

export function createMockProvider(config: Config): LLMProvider {
  const delay = () => sleep(config.mockStepDelayMs);

  return {
    mode: 'mock',

    async plan({ team, request }) {
      await delay();
      return mockPlan(team, request);
    },

    startConversation({ task, rootRequest }) {
      const start: MockEntry = {
        kind: 'start',
        taskId: task.id,
        title: task.title,
        instructions: task.instructions,
        rootRequest,
      };
      return [start];
    },

    async step({ ctx, conversation }): Promise<AgentStep> {
      await delay();
      const entries = conversation as MockEntry[];
      const start = entries.find((e): e is Extract<MockEntry, { kind: 'start' }> => e.kind === 'start');
      const last = entries[entries.length - 1];
      const instructions = start ? `${start.title} ${start.instructions}` : '';

      let reply: Extract<MockEntry, { kind: 'assistant' }>;
      if (last?.kind === 'results') {
        // Segundo turno: resumir lo ocurrido con las llamadas del turno anterior.
        const prev = [...entries].reverse().find((e): e is Extract<MockEntry, { kind: 'assistant' }> => e.kind === 'assistant');
        const text = `(${ctx.agent.area}) ${summarizeResults(prev?.toolCalls ?? [], last.results, ctx.actions)}`;
        reply = { kind: 'assistant', toolCalls: [], text };
      } else {
        const picked = pickActions(ctx.actions, instructions);
        if (picked.length === 0) {
          reply = {
            kind: 'assistant',
            toolCalls: [],
            text: `(${ctx.agent.area}) Revise la solicitud, pero no tengo acciones declaradas para ejecutarla. Queda pendiente: declarar una accion para esta area.`,
          };
        } else {
          const turn = entries.filter((e) => e.kind === 'assistant').length;
          const base = start?.taskId ?? ctx.agent.id;
          reply = {
            kind: 'assistant',
            text: null,
            toolCalls: picked.map((a, i) => ({
              id: `mock_${base}_${turn}_${i}`,
              name: a.key,
              input: sampleParams(a, start?.instructions ?? ''),
            })),
          };
        }
      }
      return {
        conversation: [...entries, reply],
        toolCalls: reply.toolCalls,
        finalText: reply.toolCalls.length > 0 ? null : reply.text,
      };
    },

    addToolResults(conversation, results) {
      const entry: MockEntry = { kind: 'results', results: [...results] };
      return [...conversation, entry];
    },

    async synthesize({ request, results }) {
      await delay();
      const lines = results.map(({ agent, task }) => {
        if (task.status === 'completed') return areaLine(agent, 'completado.', task.result);
        if (task.status === 'failed') return areaLine(agent, 'fallo.', task.error);
        return areaLine(agent, `quedo en estado ${task.status}.`, task.result);
      });
      return [
        `Resumen del CEO (modo simulacion) para: "${shorten(request, 120)}"`,
        ...(lines.length ? lines : ['- Ninguna area trabajo en esta solicitud.']),
      ].join('\n');
    },
  };
}
