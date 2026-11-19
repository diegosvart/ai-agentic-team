/**
 * Proveedor real: Messages API de Claude con bucle manual (el motor necesita pausar
 * el bucle para las aprobaciones, por eso no se usa el tool runner).
 *
 * Restricciones de claude-opus-5-5 / claude-sonnet-5-5 respetadas aqui:
 * sin temperature/top_p/top_k, sin thinking con budget, sin tool_choice forzado,
 * sin prefill del asistente. La profundidad se controla con output_config.effort.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { ActionDef, ActionParam, Agent } from '@agentic-office/shared';
import type {
  AgentContext,
  AgentStep,
  Config,
  LLMProvider,
  Plan,
  PlannedSubtask,
  ToolCall,
  ToolResult,
} from '../contracts';

const MAX_TOKENS = 16000;
const MAX_PAUSE_RETRIES = 3;

type Effort = 'low' | 'medium';

// ---------- Conversion ActionDef -> herramienta (funciones puras, testeables) ----------

function paramSchema(param: ActionParam): Record<string, unknown> {
  const base = param.type;
  // Con strict todos los campos van en required: los opcionales aceptan null.
  const schema: Record<string, unknown> = {
    type: param.required ? base : [base, 'null'],
    description: param.description || param.name,
  };
  if (base === 'string' && param.enum && param.enum.length > 0) {
    schema.enum = param.required ? [...param.enum] : [...param.enum, null];
  }
  return schema;
}

/** Convierte una accion declarada por el usuario en una herramienta estricta de la API. */
export function actionToTool(action: ActionDef): Anthropic.Tool {
  const properties: Record<string, unknown> = {};
  for (const p of action.params) properties[p.name] = paramSchema(p);
  const description = action.requiresApproval
    ? `${action.description}\n(Esta accion requiere aprobacion humana antes de ejecutarse; si el usuario la rechaza recibiras un error con su nota.)`
    : action.description;
  return {
    name: action.key,
    description: description || action.name,
    strict: true,
    input_schema: {
      type: 'object',
      properties,
      required: action.params.map((p) => p.name),
      additionalProperties: false,
    },
  };
}

/** Elimina los campos null que el modelo envia para parametros opcionales omitidos. */
export function stripNullParams(input: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (v !== null && v !== undefined) out[k] = v;
    }
  }
  return out;
}

/** JSON Schema del Plan para output_config.format. */
export function planSchema(agentKeys: string[]): Record<string, unknown> {
  const agentKey: Record<string, unknown> = {
    type: 'string',
    description: 'Clave (key) del agente de area que recibe la subtarea.',
  };
  if (agentKeys.length > 0) agentKey.enum = [...agentKeys];
  return {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Razonamiento breve (1-2 frases) de como se reparte el trabajo, visible para el usuario.',
      },
      subtasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            agentKey,
            title: { type: 'string', description: 'Titulo corto de la subtarea.' },
            instructions: { type: 'string', description: 'Instrucciones autocontenidas para el agente.' },
            complexity: { type: 'string', enum: ['simple', 'complex'] },
          },
          required: ['agentKey', 'title', 'instructions', 'complexity'],
          additionalProperties: false,
        },
      },
      directAnswer: {
        type: ['string', 'null'],
        description: 'Respuesta directa al usuario cuando no hace falta delegar; null si se delega.',
      },
    },
    required: ['summary', 'subtasks', 'directAnswer'],
    additionalProperties: false,
  };
}

// ---------- Prompts ----------

function describeTeam(team: AgentContext[]): string {
  if (team.length === 0) return '(No hay agentes de area habilitados.)';
  return team
    .map(({ agent, actions }) => {
      const enabled = actions.filter((a) => a.enabled);
      const acts =
        enabled.length > 0
          ? enabled.map((a) => `    - ${a.key}: ${a.description}`).join('\n')
          : '    (sin acciones declaradas)';
      return `- key: ${agent.key}\n  area: ${agent.area}\n  nombre: ${agent.name}\n  descripcion: ${agent.description}\n  acciones:\n${acts}`;
    })
    .join('\n');
}

export function buildPlanSystem(ceo: Agent, team: AgentContext[]): string {
  return [
    `Eres ${ceo.name}, el CEO (area ${ceo.area}) de un equipo de agentes de IA de una empresa.`,
    ceo.description ? `Tus responsabilidades: ${ceo.description}` : '',
    '',
    'Tu trabajo es recibir la solicitud del usuario y decidir como repartirla entre tu equipo.',
    'Reglas:',
    '- Delega solo a agentes que tengan acciones o competencia para la parte que les asignas. Usa exactamente su key.',
    '- Una subtarea por agente, salvo que sea realmente necesario dividir su trabajo.',
    '- Las instrucciones de cada subtarea deben ser autocontenidas: el agente no ve las demas subtareas; incluye los datos concretos de la solicitud que necesita.',
    "- Marca complexity 'complex' solo si la subtarea exige razonamiento de varios pasos o juicio delicado; en otro caso 'simple'.",
    '- Si la solicitud no requiere delegar (saludo, pregunta general, algo que ningun agente puede hacer), deja subtasks vacio y responde en directAnswer.',
    '- Si delegas, directAnswer debe ser null.',
    '- Escribe todo en espanol.',
    '',
    'Equipo disponible:',
    describeTeam(team),
  ]
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n');
}

export function buildAgentSystem(ctx: AgentContext): string {
  const { agent } = ctx;
  return [
    `Eres ${agent.name}, el agente de IA del area ${agent.area} de la empresa.`,
    `Tus responsabilidades: ${agent.description}`,
    '',
    'Recibes subtareas delegadas por el CEO. Para cumplirlas:',
    '- Usa tus herramientas (acciones declaradas por la empresa) cuando la subtarea lo requiera. No inventes resultados de acciones que no ejecutaste.',
    '- Completa los parametros con datos de las instrucciones; si falta un dato no critico, usa un valor razonable y dilo en tu resumen.',
    '- Si una accion falla o es rechazada por el usuario, no la repitas igual: adapta el plan o informa.',
    '- Si no tienes acciones para algo, explica que quedo pendiente y que se necesitaria.',
    '- Al terminar, responde con un resumen breve en espanol: que hiciste, con que resultado y que quedo pendiente.',
  ].join('\n');
}

function buildSynthSystem(ceo: Agent): string {
  return [
    `Eres ${ceo.name}, el CEO de un equipo de agentes de IA. Tu equipo ya trabajo en la solicitud del usuario.`,
    'Redacta la respuesta final para el usuario, en espanol, clara y breve:',
    '- Indica que hizo cada area, con los resultados concretos.',
    '- Senala explicitamente lo que quedo pendiente, fue rechazado o fallo, y que haria falta para resolverlo.',
    '- No inventes resultados que no aparezcan en los informes.',
  ].join('\n');
}

// ---------- Errores ----------

function wrapError(err: unknown, what: string): Error {
  if (err instanceof Anthropic.AuthenticationError) {
    return new Error(`${what}: la API key de Anthropic no es valida o falta (401).`);
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new Error(`${what}: la API key no tiene permiso para este recurso o modelo (403).`);
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new Error(`${what}: modelo o recurso no encontrado (404). Revisa MODEL_OPUS / MODEL_SONNET.`);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new Error(`${what}: limite de uso de la API alcanzado (429). Intenta de nuevo en unos minutos.`);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new Error(`${what}: la API rechazo la solicitud (400): ${err.message}`);
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new Error(`${what}: la API de Anthropic no esta disponible (${err.status}). Intenta de nuevo.`);
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new Error(`${what}: la llamada a la API supero el tiempo de espera.`);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new Error(`${what}: no se pudo conectar con la API de Anthropic.`);
  }
  if (err instanceof Anthropic.APIError) {
    return new Error(`${what}: error de la API (${err.status ?? 'sin estado'}): ${err.message}`);
  }
  if (err instanceof Error) return err;
  return new Error(`${what}: ${String(err)}`);
}

function assertUsableStop(response: Anthropic.Message, what: string): void {
  switch (response.stop_reason) {
    case 'refusal': {
      const detail = response.stop_details?.explanation;
      throw new Error(`${what}: el modelo se nego a responder por politicas de seguridad${detail ? ` (${detail})` : ''}.`);
    }
    case 'max_tokens':
      throw new Error(`${what}: la respuesta del modelo se corto por exceder el limite de ${MAX_TOKENS} tokens.`);
    case 'model_context_window_exceeded':
      throw new Error(`${what}: la conversacion excede la ventana de contexto del modelo.`);
    default:
      return;
  }
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

function parsePlan(raw: string): Plan {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Planificacion: el modelo no devolvio un JSON valido.');
  }
  const obj = (data ?? {}) as Record<string, unknown>;
  const subtasks: PlannedSubtask[] = Array.isArray(obj.subtasks)
    ? obj.subtasks
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .map((s) => ({
          agentKey: String(s.agentKey ?? ''),
          title: String(s.title ?? ''),
          instructions: String(s.instructions ?? ''),
          complexity: s.complexity === 'complex' ? 'complex' : 'simple',
        }))
    : [];
  const direct = typeof obj.directAnswer === 'string' && obj.directAnswer.trim() ? obj.directAnswer : null;
  return {
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    subtasks,
    directAnswer: subtasks.length > 0 ? null : direct,
  };
}

// ---------- Proveedor ----------

export function createAnthropicProvider(config: Config, client: Anthropic = new Anthropic()): LLMProvider {
  const systemBlock = (text: string): Anthropic.TextBlockParam[] => [
    // Las herramientas se renderizan antes que el system: este breakpoint cachea ambos.
    { type: 'text', text, cache_control: { type: 'ephemeral' } },
  ];

  async function call(params: Anthropic.MessageCreateParamsNonStreaming, what: string): Promise<Anthropic.Message> {
    try {
      return await client.messages.create(params);
    } catch (err) {
      throw wrapError(err, what);
    }
  }

  return {
    mode: 'live',

    async plan({ model, ceo, team, request }) {
      const what = 'Planificacion del CEO';
      const response = await call(
        {
          model,
          max_tokens: MAX_TOKENS,
          system: systemBlock(buildPlanSystem(ceo, team)),
          output_config: {
            effort: 'medium',
            format: { type: 'json_schema', schema: planSchema(team.map((t) => t.agent.key)) },
          },
          messages: [{ role: 'user', content: request }],
        },
        what,
      );
      assertUsableStop(response, what);
      return parsePlan(textOf(response.content));
    },

    startConversation({ task, rootRequest }) {
      const content = [
        `Solicitud original del usuario al CEO (contexto): ${rootRequest}`,
        '',
        `Tu subtarea: ${task.title}`,
        `Instrucciones: ${task.instructions}`,
      ].join('\n');
      const messages: Anthropic.MessageParam[] = [{ role: 'user', content }];
      return messages;
    },

    async step({ model, ctx, conversation }): Promise<AgentStep> {
      const what = `Agente ${ctx.agent.name}`;
      const tools = ctx.actions.filter((a) => a.enabled).map(actionToTool);
      const effort: Effort = model === config.models.sonnet ? 'low' : 'medium';
      const system = systemBlock(buildAgentSystem(ctx));
      let messages = conversation as Anthropic.MessageParam[];

      for (let attempt = 0; ; attempt++) {
        const response = await call(
          {
            model,
            max_tokens: MAX_TOKENS,
            system,
            ...(tools.length > 0 ? { tools } : {}),
            output_config: { effort },
            messages,
          },
          what,
        );
        // Siempre se agrega el content completo (incluye bloques de thinking y tool_use).
        messages = [...messages, { role: 'assistant', content: response.content }];

        if (response.stop_reason === 'pause_turn') {
          if (attempt < MAX_PAUSE_RETRIES) continue;
          throw new Error(`${what}: el modelo pauso el turno demasiadas veces.`);
        }
        assertUsableStop(response, what);

        const toolCalls: ToolCall[] = response.content
          .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
          .map((b) => ({ id: b.id, name: b.name, input: stripNullParams(b.input) }));
        const text = textOf(response.content);
        return {
          conversation: messages,
          toolCalls,
          finalText: toolCalls.length > 0 ? null : text || 'Subtarea terminada sin comentarios adicionales.',
        };
      }
    },

    addToolResults(conversation, results: ToolResult[]) {
      const blocks: Anthropic.ToolResultBlockParam[] = results.map((r) => ({
        type: 'tool_result',
        tool_use_id: r.toolCallId,
        content: r.content,
        ...(r.isError ? { is_error: true } : {}),
      }));
      return [...(conversation as Anthropic.MessageParam[]), { role: 'user', content: blocks }];
    },

    async synthesize({ model, ceo, request, results }) {
      const what = 'Sintesis del CEO';
      const reports = results
        .map(({ agent, task }) => {
          const status =
            task.status === 'completed' ? 'completada' : task.status === 'failed' ? 'fallida' : `estado ${task.status}`;
          const body = task.status === 'failed' ? `Error: ${task.error ?? 'sin detalle'}` : (task.result ?? '(sin resultado)');
          return `### ${agent.area} (${agent.name}) - subtarea "${task.title}" ${status}\n${body}`;
        })
        .join('\n\n');
      const response = await call(
        {
          model,
          max_tokens: MAX_TOKENS,
          system: systemBlock(buildSynthSystem(ceo)),
          output_config: { effort: 'medium' },
          messages: [
            {
              role: 'user',
              content: `Solicitud del usuario:\n${request}\n\nInformes de las areas:\n\n${reports || '(ninguno)'}`,
            },
          ],
        },
        what,
      );
      assertUsableStop(response, what);
      return textOf(response.content) || 'El equipo termino, pero no se pudo redactar un resumen.';
    },
  };
}
