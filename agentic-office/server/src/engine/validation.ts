import type { ActionParam } from '@agentic-office/shared';

/**
 * Valida la entrada de una llamada a accion contra su definicion.
 * Devuelve mensajes en espanol (vacio = valida); el agente los recibe para corregirse.
 */
export function validateParams(params: ActionParam[], input: unknown): string[] {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return ['Los parametros deben ser un objeto JSON.'];
  }
  const values = input as Record<string, unknown>;
  const errors: string[] = [];
  const known = new Set(params.map((p) => p.name));

  for (const name of Object.keys(values)) {
    if (!known.has(name)) errors.push(`Parametro desconocido: "${name}".`);
  }

  for (const p of params) {
    const v = values[p.name];
    if (v === undefined || v === null) {
      if (p.required) errors.push(`Falta el parametro requerido "${p.name}".`);
      continue;
    }
    switch (p.type) {
      case 'string':
        if (typeof v !== 'string') {
          errors.push(`"${p.name}" debe ser texto.`);
        } else if (p.enum && p.enum.length > 0 && !p.enum.includes(v)) {
          errors.push(`"${p.name}" debe ser uno de: ${p.enum.join(', ')}.`);
        }
        break;
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`"${p.name}" debe ser un numero.`);
        break;
      case 'boolean':
        if (typeof v !== 'boolean') errors.push(`"${p.name}" debe ser verdadero o falso.`);
        break;
    }
  }
  return errors;
}
