import { z } from 'zod';
import { ACTION_KEY_PATTERN, AGENT_KEY_PATTERN } from '@agentic-office/shared';

// Mensajes de validacion en espanol (SPEC §7: interfaz en espanol). Los mensajes propios de cada
// regla tienen prioridad; un texto vacio o solo con espacios se reporta como "obligatorio".
z.config(z.locales.es());
z.config({
  customError: (iss) => (iss.code === 'too_small' && iss.origin === 'string' && iss.minimum === 1 ? 'es obligatorio' : undefined),
});

/** Nombre visible de cada campo, para que los errores no muestren nombres internos. */
const FIELD_LABELS: Record<string, string> = {
  key: 'Clave',
  name: 'Nombre',
  area: 'Área',
  description: 'Descripción',
  defaultModel: 'Modelo por defecto',
  color: 'Color',
  enabled: 'Activo',
  agentId: 'Agente',
  params: 'Parámetros',
  type: 'Tipo',
  required: 'Obligatorio',
  enum: 'Opciones',
  connector: 'Conector',
  connectorConfig: 'Configuración del conector',
  requiresApproval: 'Requiere aprobación',
  text: 'Solicitud',
  note: 'Nota',
  limit: 'Límite',
};

/** "params.0.name" -> "Parámetros › 1 › Nombre". */
export function fieldLabel(path: ReadonlyArray<PropertyKey>): string {
  return path
    .map((p) => (typeof p === 'number' ? String(p + 1) : (FIELD_LABELS[String(p)] ?? String(p))))
    .join(' › ');
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const PARAM_NAME = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

const text = (max: number) => z.string().trim().min(1).max(max);

export const actionParamSchema = z
  .object({
    name: z.string().regex(PARAM_NAME, 'nombre de parametro invalido'),
    type: z.enum(['string', 'number', 'boolean']),
    description: z.string().trim().max(500),
    required: z.boolean(),
    enum: z.array(z.string().min(1).max(100)).min(1).max(50).optional(),
  })
  .refine((p) => p.enum === undefined || p.type === 'string', {
    message: 'enum solo es valido con type "string"',
    path: ['enum'],
  });

export const agentBase = z.object({
  key: z.string().regex(AGENT_KEY_PATTERN, 'clave de agente invalida'),
  name: text(80),
  area: text(80),
  description: z.string().trim().max(4000),
  defaultModel: z.enum(['opus', 'sonnet']),
  color: z.string().regex(HEX_COLOR, 'color hex invalido (#rrggbb)'),
  enabled: z.boolean().default(true),
});
export const agentCreateSchema = agentBase;
export const agentPatchSchema = agentBase
  .partial()
  .extend({ enabled: z.boolean().optional() })
  .strict();

const uniqueParams = (params: Array<{ name: string }> | undefined) =>
  !params || new Set(params.map((p) => p.name)).size === params.length;

export const actionBase = z.object({
  agentId: z.string().min(1).max(100),
  key: z.string().regex(ACTION_KEY_PATTERN, 'clave de accion invalida'),
  name: text(100),
  description: text(2000),
  params: z.array(actionParamSchema).max(20).refine(uniqueParams, 'los parámetros deben tener nombres únicos'),
  connector: text(50),
  connectorConfig: z.record(z.string(), z.unknown()).default({}),
  requiresApproval: z.boolean().default(false),
  enabled: z.boolean().default(true),
});
export const actionCreateSchema = actionBase;
export const actionPatchSchema = z
  .object({
    agentId: actionBase.shape.agentId.optional(),
    key: actionBase.shape.key.optional(),
    name: actionBase.shape.name.optional(),
    description: actionBase.shape.description.optional(),
    params: actionBase.shape.params.optional(),
    connector: actionBase.shape.connector.optional(),
    connectorConfig: z.record(z.string(), z.unknown()).optional(),
    requiresApproval: z.boolean().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const requestSchema = z.object({ text: text(4000) });
export const resolveSchema = z.object({ note: z.string().trim().max(1000).optional() });
export const limitQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) });
