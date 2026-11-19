import { useId, useState } from 'react';
import type { ActionRun, Agent } from '@agentic-office/shared';
import { api } from '../api/client';
import { formatTime } from './format';
import { AgentDot, EmptyState, FormError, ParamsList } from './ui';

interface Props {
  approvals: ActionRun[];
  agents: Agent[];
  onResolved: (run: ActionRun) => void;
}

export function ApprovalsPanel({ approvals, agents, onResolved }: Props) {
  if (approvals.length === 0) {
    return (
      <EmptyState title="Nada pendiente">
        Las acciones marcadas como «Requiere aprobación» aparecerán aquí antes de ejecutarse.
      </EmptyState>
    );
  }
  const byId = new Map(agents.map((a) => [a.id, a]));
  return (
    <ul className="list">
      {approvals.map((run) => (
        <li key={run.id}>
          <ApprovalCard run={run} agent={byId.get(run.agentId)} onResolved={onResolved} />
        </li>
      ))}
    </ul>
  );
}

function ApprovalCard({
  run,
  agent,
  onResolved,
}: {
  run: ActionRun;
  agent: Agent | undefined;
  onResolved: (run: ActionRun) => void;
}) {
  const noteId = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function resolve(kind: 'approve' | 'reject') {
    setBusy(kind);
    setError(null);
    try {
      const updated = await (kind === 'approve' ? api.approveRun(run.id, note.trim()) : api.rejectRun(run.id, note.trim()));
      onResolved(updated);
    } catch (e) {
      setError(e);
      setBusy(null);
    }
  }

  return (
    <div className="card pad">
      <div className="row wrap">
        {agent ? <AgentDot color={agent.color} /> : null}
        <strong>{agent?.name ?? 'Agente'}</strong>
        <span className="muted small">{formatTime(run.createdAt)}</span>
      </div>
      <p className="approval-action">
        Quiere ejecutar <strong>{run.actionName}</strong>
      </p>
      <ParamsList params={run.params} />
      <div className="field">
        <label htmlFor={noteId}>Nota (opcional)</label>
        <textarea
          id={noteId}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Se le enviará al agente junto con tu decisión"
          disabled={busy !== null}
        />
      </div>
      <FormError error={error} />
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void resolve('approve')}>
          {busy === 'approve' ? 'Aprobando…' : 'Aprobar'}
        </button>
        <button type="button" className="btn btn-danger" disabled={busy !== null} onClick={() => void resolve('reject')}>
          {busy === 'reject' ? 'Rechazando…' : 'Rechazar'}
        </button>
      </div>
    </div>
  );
}
