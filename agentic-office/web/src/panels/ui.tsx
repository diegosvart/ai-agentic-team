import type { ReactNode } from 'react';
import { errorLines, formatValue, type Tone } from './format';

export function Badge({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function AgentDot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} aria-hidden="true" />;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state-empty">
      <p className="state-title">{title}</p>
      {children ? <p className="state-text">{children}</p> : null}
    </div>
  );
}

export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" />
      <p className="state-text">{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">Algo salió mal</p>
      <p className="state-text">{message}</p>
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

/** Error de un formulario: mensaje del servidor mas el detalle de validacion. */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  const { message, details } = errorLines(error);
  return (
    <div className="form-error" role="alert">
      <strong>{message}</strong>
      {details.length > 0 ? (
        <ul>
          {details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Parametros de una accion en formato legible (clave: valor). */
export function ParamsList({ params }: { params: Record<string, unknown> }) {
  const entries = Object.entries(params);
  if (entries.length === 0) return <p className="muted small">Sin parámetros.</p>;
  return (
    <dl className="kv">
      {entries.map(([k, v]) => (
        <div key={k} className="kv-row">
          <dt>{k}</dt>
          <dd>{formatValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
