import { useId, useState, type FormEvent } from 'react';
import { AGENT_KEY_PATTERN, type ActionDef, type Agent, type AgentInput, type ModelTier } from '@agentic-office/shared';
import { api } from '../api/client';
import { modelLabel, slugify } from './format';
import { AgentDot, Badge, EmptyState, FormError } from './ui';

interface Props {
  agents: Agent[];
  actions: ActionDef[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string | null) => void;
  onChanged: () => Promise<void>;
}

type Mode = { kind: 'list' } | { kind: 'form'; agent: Agent | null };

export function TeamPanel({ agents, actions, selectedAgentId, onSelectAgent, onChanged }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (mode.kind === 'form') {
    return (
      <AgentForm
        agent={mode.agent}
        onCancel={() => setMode({ kind: 'list' })}
        onSaved={async () => {
          await onChanged();
          setMode({ kind: 'list' });
        }}
      />
    );
  }

  async function remove(agent: Agent) {
    setBusyId(agent.id);
    setError(null);
    try {
      await api.deleteAgent(agent.id);
      if (selectedAgentId === agent.id) onSelectAgent(null);
      setConfirmId(null);
      await onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="row between panel-head">
        <h2 className="h-title">Equipo</h2>
        <button type="button" className="btn btn-primary" onClick={() => setMode({ kind: 'form', agent: null })}>
          Nuevo agente
        </button>
      </div>
      <FormError error={error} />
      {agents.length === 0 ? (
        <EmptyState title="No hay agentes">Crea el primer agente de área.</EmptyState>
      ) : (
        <ul className="list">
          {agents.map((a) => {
            const count = actions.filter((x) => x.agentId === a.id).length;
            const confirming = confirmId === a.id;
            return (
              <li key={a.id} className={`card pad${selectedAgentId === a.id ? ' card-selected' : ''}`}>
                <div className="row wrap">
                  <AgentDot color={a.color} />
                  <strong>{a.name}</strong>
                  {a.role === 'ceo' ? <Badge tone="info">CEO</Badge> : null}
                  {!a.enabled ? <Badge>Deshabilitado</Badge> : null}
                </div>
                <p className="muted small">
                  {a.area} · {modelLabel(a.defaultModel)} · {count} {count === 1 ? 'acción' : 'acciones'}
                </p>
                {a.description ? <p className="small clamp">{a.description}</p> : null}
                {confirming ? (
                  <div className="confirm" role="alertdialog" aria-label={`Borrar ${a.name}`}>
                    <p className="small">
                      ¿Borrar a <strong>{a.name}</strong>? También se borrarán sus {count} {count === 1 ? 'acción' : 'acciones'}.
                    </p>
                    <div className="row">
                      <button type="button" className="btn btn-danger" disabled={busyId === a.id} onClick={() => void remove(a)}>
                        {busyId === a.id ? 'Borrando…' : 'Sí, borrar'}
                      </button>
                      <button type="button" className="btn" onClick={() => setConfirmId(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="row wrap">
                    <button type="button" className="btn" onClick={() => onSelectAgent(a.id)}>
                      Ver ficha
                    </button>
                    <button type="button" className="btn" onClick={() => setMode({ kind: 'form', agent: a })}>
                      Editar
                    </button>
                    {a.role !== 'ceo' ? (
                      <button type="button" className="btn btn-danger-ghost" onClick={() => setConfirmId(a.id)}>
                        Borrar
                      </button>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function validHex(c: string): string {
  return /^#[0-9a-f]{6}$/i.test(c) ? c : '#888888';
}

function AgentForm({
  agent,
  onCancel,
  onSaved,
}: {
  agent: Agent | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const uid = useId();
  const isCeo = agent?.role === 'ceo';
  const [name, setName] = useState(agent?.name ?? '');
  const [key, setKey] = useState(agent?.key ?? '');
  const [keyTouched, setKeyTouched] = useState(false);
  const [area, setArea] = useState(agent?.area ?? '');
  const [description, setDescription] = useState(agent?.description ?? '');
  const [model, setModel] = useState<ModelTier>(agent?.defaultModel ?? 'sonnet');
  const [color, setColor] = useState(validHex(agent?.color ?? '#4aa3ff'));
  const [enabled, setEnabled] = useState(agent?.enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLocalError(null);
    if (!agent && !AGENT_KEY_PATTERN.test(key)) {
      setLocalError('La clave debe empezar con una letra minúscula y usar solo minúsculas, números, «_» o «-» (2 a 41 caracteres).');
      return;
    }
    setBusy(true);
    try {
      if (agent) {
        const patch: Partial<AgentInput> = { name: name.trim(), area: area.trim(), description, defaultModel: model, color };
        if (!isCeo) patch.enabled = enabled;
        await api.updateAgent(agent.id, patch);
      } else {
        await api.createAgent({ key, name: name.trim(), area: area.trim(), description, defaultModel: model, color, enabled });
      }
      await onSaved();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={(e) => void submit(e)}>
      <h2 className="h-title">{agent ? `Editar ${agent.name}` : 'Nuevo agente de área'}</h2>

      <div className="field">
        <label htmlFor={`${uid}-name`}>Nombre</label>
        <input
          id={`${uid}-name`}
          value={name}
          required
          onChange={(e) => {
            setName(e.target.value);
            if (!agent && !keyTouched) setKey(slugify(e.target.value, '-', 41));
          }}
        />
      </div>
      {!agent ? (
        <div className="field">
          <label htmlFor={`${uid}-key`}>Clave</label>
          <input
            id={`${uid}-key`}
            className="mono"
            value={key}
            required
            onChange={(e) => {
              setKey(e.target.value);
              setKeyTouched(true);
            }}
            aria-describedby={`${uid}-key-h`}
          />
          <span id={`${uid}-key-h`} className="hint">
            Identificador único con el que el CEO delega. No se puede cambiar después.
          </span>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor={`${uid}-area`}>Área</label>
        <input id={`${uid}-area`} value={area} required onChange={(e) => setArea(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-desc`}>Descripción</label>
        <textarea
          id={`${uid}-desc`}
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-describedby={`${uid}-desc-h`}
        />
        <span id={`${uid}-desc-h`} className="hint">
          Responsabilidades del agente; se incluyen en sus instrucciones.
        </span>
      </div>
      <div className="field-row field-row-fit-last">
        <div className="field">
          <label htmlFor={`${uid}-model`}>Modelo por defecto</label>
          <select id={`${uid}-model`} value={model} onChange={(e) => setModel(e.target.value as ModelTier)}>
            <option value="sonnet">Sonnet (rápido y económico)</option>
            <option value="opus">Opus (tareas complejas)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${uid}-color`}>Color</label>
          <input id={`${uid}-color`} type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
      </div>
      {!isCeo ? (
        <label className="check">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Habilitado
        </label>
      ) : null}

      {localError ? (
        <div className="form-error" role="alert">
          {localError}
        </div>
      ) : null}
      <FormError error={error} />
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
