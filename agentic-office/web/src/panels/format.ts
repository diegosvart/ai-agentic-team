import type { AgentStatus, ActionRunStatus, TaskStatus } from '@agentic-office/shared';
import { ApiRequestError } from '../api/client';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'Libre',
  thinking: 'Pensando',
  delegating: 'Delegando',
  working: 'Trabajando',
  waiting_approval: 'Esperando aprobación',
};

export const AGENT_STATUS_TONE: Record<AgentStatus, Tone> = {
  idle: 'muted',
  thinking: 'info',
  delegating: 'info',
  working: 'ok',
  waiting_approval: 'warn',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  queued: 'En cola',
  planning: 'Planificando',
  running: 'En curso',
  waiting_approval: 'Esperando aprobación',
  completed: 'Completada',
  failed: 'Fallida',
};

export const TASK_STATUS_TONE: Record<TaskStatus, Tone> = {
  queued: 'muted',
  planning: 'info',
  running: 'info',
  waiting_approval: 'warn',
  completed: 'ok',
  failed: 'bad',
};

export const RUN_STATUS_LABEL: Record<ActionRunStatus, string> = {
  pending_approval: 'Pendiente de aprobación',
  running: 'Ejecutando',
  succeeded: 'Correcta',
  failed: 'Fallida',
  rejected: 'Rechazada',
};

export const RUN_STATUS_TONE: Record<ActionRunStatus, Tone> = {
  pending_approval: 'warn',
  running: 'info',
  succeeded: 'ok',
  failed: 'bad',
  rejected: 'bad',
};

export function modelLabel(model: string | null): string {
  if (!model) return 'Sin modelo';
  if (model === 'mock') return 'Simulado';
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'Opus';
  if (m.includes('sonnet')) return 'Sonnet';
  return model;
}

export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v === '' ? '(vacío)' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** "Envío de correo" -> "envio_de_correo". Siempre empieza por letra. */
export function slugify(text: string, sep: '_' | '-', max: number): string {
  let s = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, sep)
    .replace(new RegExp(`^${sep}+|${sep}+$`, 'g'), '');
  if (s && !/^[a-z]/.test(s)) s = `a${sep}${s}`;
  return s.slice(0, max).replace(new RegExp(`${sep}+$`), '');
}

/** Mensaje principal y lineas de detalle de un error de la API (validacion incluida). */
export function errorLines(e: unknown): { message: string; details: string[] } {
  if (!(e instanceof Error)) return { message: String(e), details: [] };
  const details: string[] = [];
  if (e instanceof ApiRequestError) collectDetails(e.details, '', details);
  return { message: e.message, details };
}

function collectDetails(v: unknown, path: string, out: string[]): void {
  if (v === null || v === undefined) return;
  if (typeof v === 'string') {
    out.push(path ? `${path}: ${v}` : v);
  } else if (Array.isArray(v)) {
    for (const item of v) collectDetails(item, path, out);
  } else if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.message === 'string') {
      // `field` es el nombre visible del campo; `path` el interno (respaldo).
      const where = typeof o.field === 'string' ? o.field : typeof o.path === 'string' ? o.path : path;
      out.push(where ? `${where}: ${o.message}` : o.message);
      return;
    }
    for (const [k, val] of Object.entries(o)) collectDetails(val, path ? `${path}.${k}` : k, out);
  } else {
    out.push(String(v));
  }
}
