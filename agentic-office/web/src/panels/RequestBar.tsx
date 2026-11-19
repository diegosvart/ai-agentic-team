import { useId, useRef, useState, type FormEvent } from 'react';
import type { TaskTree } from '@agentic-office/shared';
import { api } from '../api/client';
import { FormError } from './ui';

const EXAMPLES = [
  'Un cliente recibió su pedido dañado: respóndele, registra el caso y pide a Contabilidad el reembolso.',
  'Lanza la campaña de primavera: redacta el texto para redes, prepara un comunicado de prensa y contacta a los leads interesados.',
  'Prepara el cierre del mes: resume las facturas pendientes, avisa al equipo y abre la vacante de analista.',
];

export function RequestBar({ onCreated }: { onCreated: (tree: TaskTree) => void }) {
  const inputId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.createRequest(value));
      setText('');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="request-bar" onSubmit={(e) => void submit(e)}>
      <label htmlFor={inputId} className="sr-only">
        Solicitud para el CEO
      </label>
      <div className="request-row">
        <textarea
          id={inputId}
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Pídele algo al CEO…"
          disabled={busy}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || text.trim() === ''}>
          {busy ? 'Enviando…' : 'Enviar al CEO'}
        </button>
      </div>
      <div className="examples">
        <span className="muted small">Ejemplos:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            className="chip"
            title={ex}
            onClick={() => {
              setText(ex);
              inputRef.current?.focus();
            }}
          >
            {ex}
          </button>
        ))}
      </div>
      <FormError error={error} />
    </form>
  );
}
