import { useId, useRef, useState, type FormEvent } from 'react';
import {
  ACTION_KEY_PATTERN,
  type ActionDef,
  type ActionInput,
  type ActionParam,
  type ActionParamType,
  type Agent,
  type ConnectorInfo,
} from '@agentic-office/shared';
import { api } from '../api/client';
import { slugify } from './format';
import { AgentDot, Badge, EmptyState, FormError } from './ui';

interface Props {
  agents: Agent[];
  actions: ActionDef[];
  connectors: ConnectorInfo[];
  /** Agente preseleccionado al crear una accion nueva. */
  defaultAgentId: string | null;
  onChanged: () => Promise<void>;
}

type Mode = { kind: 'list' } | { kind: 'form'; action: ActionDef | null };

const maturityLabel = (m: ConnectorInfo['maturity']) => (m === 'ready' ? 'listo' : 'simulado');

export function ActionsPanel({ agents, actions, connectors, defaultAgentId, onChanged }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (mode.kind === 'form') {
    return (
      <ActionForm
        action={mode.action}
        agents={agents}
        connectors={connectors}
        defaultAgentId={defaultAgentId}
        onCancel={() => setMode({ kind: 'list' })}
        onSaved={async () => {
          await onChanged();
          setMode({ kind: 'list' });
        }}
      />
    );
  }

  async function remove(a: ActionDef) {
    setBusyId(a.id);
    setError(null);
    try {
      await api.deleteAction(a.id);
      setConfirmId(null);
      await onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusyId(null);
    }
  }

  const connName = (key: string) => connectors.find((c) => c.key === key)?.name ?? key;

  return (
    <div>
      <div className="row between panel-head">
        <h2 className="h-title">Acciones</h2>
        <button
          type="button"
          className="btn btn-primary"
          disabled={agents.length === 0 || connectors.length === 0}
          onClick={() => setMode({ kind: 'form', action: null })}
        >
          Nueva acción
        </button>
      </div>
      <FormError error={error} />
      {agents.length === 0 ? (
        <EmptyState title="No hay agentes">Crea primero un agente para asignarle acciones.</EmptyState>
      ) : (
        agents.map((agent) => {
          const mine = actions.filter((a) => a.agentId === agent.id);
          return (
            <section key={agent.id} className="group" aria-label={`Acciones de ${agent.name}`}>
              <h3 className="group-title">
                <AgentDot color={agent.color} />
                {agent.name}
                <span className="muted small">{agent.area}</span>
              </h3>
              {mine.length === 0 ? (
                <p className="muted small group-empty">Sin acciones declaradas.</p>
              ) : (
                <ul className="list">
                  {mine.map((a) => (
                    <li key={a.id} className="card pad">
                      <div className="row wrap">
                        <strong>{a.name}</strong>
                        {a.requiresApproval ? <Badge tone="warn">Requiere aprobación</Badge> : null}
                        {!a.enabled ? <Badge>Deshabilitada</Badge> : null}
                      </div>
                      <p className="muted small">
                        <code>{a.key}</code> · {connName(a.connector)} · {a.params.length}{' '}
                        {a.params.length === 1 ? 'parámetro' : 'parámetros'}
                      </p>
                      {a.description ? <p className="small clamp">{a.description}</p> : null}
                      {confirmId === a.id ? (
                        <div className="confirm" role="alertdialog" aria-label={`Borrar ${a.name}`}>
                          <p className="small">
                            ¿Borrar la acción <strong>{a.name}</strong>?
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
                        <div className="row">
                          <button type="button" className="btn" onClick={() => setMode({ kind: 'form', action: a })}>
                            Editar
                          </button>
                          <button type="button" className="btn btn-danger-ghost" onClick={() => setConfirmId(a.id)}>
                            Borrar
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

interface ParamRow {
  uid: number;
  name: string;
  type: ActionParamType;
  description: string;
  required: boolean;
  enumText: string;
}

function toRows(params: ActionParam[], nextUid: () => number): ParamRow[] {
  return params.map((p) => ({
    uid: nextUid(),
    name: p.name,
    type: p.type,
    description: p.description,
    required: p.required,
    enumText: p.enum?.join(', ') ?? '',
  }));
}

function ActionForm({
  action,
  agents,
  connectors,
  defaultAgentId,
  onCancel,
  onSaved,
}: {
  action: ActionDef | null;
  agents: Agent[];
  connectors: ConnectorInfo[];
  defaultAgentId: string | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const uid = useId();
  const counter = useRef(0);
  const nextUid = () => ++counter.current;
  const errorRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState(action?.name ?? '');
  const [key, setKey] = useState(action?.key ?? '');
  // Al editar, la clave existente no se regenera desde el nombre.
  const [keyTouched, setKeyTouched] = useState(action !== null);
  const [description, setDescription] = useState(action?.description ?? '');
  const [agentId, setAgentId] = useState(
    action?.agentId ??
      (defaultAgentId && agents.some((a) => a.id === defaultAgentId) ? defaultAgentId : (agents.find((a) => a.role === 'area') ?? agents[0])?.id ?? ''),
  );
  const [rows, setRows] = useState<ParamRow[]>(() => toRows(action?.params ?? [], nextUid));
  const [connector, setConnector] = useState(action?.connector ?? connectors[0]?.key ?? '');
  const [config, setConfig] = useState<Record<string, unknown>>(action?.connectorConfig ?? {});
  const [requiresApproval, setRequiresApproval] = useState(action?.requiresApproval ?? false);
  const [enabled, setEnabled] = useState(action?.enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const conn = connectors.find((c) => c.key === connector);

  function updateRow(id: number, patch: Partial<ParamRow>) {
    setRows((rs) => rs.map((r) => (r.uid === id ? { ...r, ...patch } : r)));
  }

  function changeConnector(k: string) {
    setConnector(k);
    setConfig({});
  }

  function showError(e: unknown, local: string | null = null) {
    setError(e);
    setLocalError(local);
    queueMicrotask(() => errorRef.current?.scrollIntoView({ block: 'nearest' }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLocalError(null);
    if (!ACTION_KEY_PATTERN.test(key)) {
      showError(null, 'La clave debe empezar con una letra minúscula y usar solo minúsculas, números o «_» (2 a 63 caracteres).');
      return;
    }
    const params: ActionParam[] = rows.map((r) => {
      const p: ActionParam = { name: r.name.trim(), type: r.type, description: r.description.trim(), required: r.required };
      const values = r.enumText.split(',').map((v) => v.trim()).filter(Boolean);
      if (r.type === 'string' && values.length > 0) p.enum = values;
      return p;
    });
    // Solo se envian los campos que declara el conector elegido.
    const connectorConfig: Record<string, unknown> = {};
    for (const f of conn?.configFields ?? []) {
      const v = config[f.name];
      if (f.type === 'boolean') connectorConfig[f.name] = v === true;
      else if (typeof v === 'string' && v !== '') connectorConfig[f.name] = v;
    }
    const input: ActionInput = {
      agentId,
      key,
      name: name.trim(),
      description: description.trim(),
      params,
      connector,
      connectorConfig,
      requiresApproval,
      enabled,
    };
    setBusy(true);
    try {
      if (action) await api.updateAction(action.id, input);
      else await api.createAction(input);
      await onSaved();
    } catch (err) {
      showError(err);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={(e) => void submit(e)}>
      <h2 className="h-title">{action ? `Editar ${action.name}` : 'Nueva acción'}</h2>

      <div className="field">
        <label htmlFor={`${uid}-name`}>Nombre</label>
        <input
          id={`${uid}-name`}
          value={name}
          required
          onChange={(e) => {
            setName(e.target.value);
            if (!keyTouched) setKey(slugify(e.target.value, '_', 63));
          }}
        />
      </div>
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
          Nombre de la herramienta que ve el agente. Se genera desde el nombre; puedes editarla.
        </span>
      </div>
      <div className="field">
        <label htmlFor={`${uid}-desc`}>Descripción</label>
        <textarea
          id={`${uid}-desc`}
          rows={3}
          value={description}
          required
          onChange={(e) => setDescription(e.target.value)}
          aria-describedby={`${uid}-desc-h`}
        />
        <span id={`${uid}-desc-h`} className="hint">
          Qué hace y cuándo usarla: el agente decide con este texto.
        </span>
      </div>
      <div className="field">
        <label htmlFor={`${uid}-agent`}>Agente dueño</label>
        <select id={`${uid}-agent`} value={agentId} onChange={(e) => setAgentId(e.target.value)} required>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.area})
            </option>
          ))}
        </select>
      </div>

      <fieldset className="fieldset">
        <legend>Parámetros</legend>
        {rows.length === 0 ? <p className="muted small">La acción no recibe parámetros.</p> : null}
        {rows.map((r, i) => (
          <div key={r.uid} className="param">
            <div className="param-head">
              <strong className="small">Parámetro {i + 1}</strong>
              <button
                type="button"
                className="btn btn-danger-ghost"
                onClick={() => setRows((rs) => rs.filter((x) => x.uid !== r.uid))}
              >
                Quitar<span className="sr-only"> parámetro {i + 1}</span>
              </button>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor={`${uid}-p${r.uid}-name`}>Nombre</label>
                <input
                  id={`${uid}-p${r.uid}-name`}
                  className="mono"
                  value={r.name}
                  required
                  onChange={(e) => updateRow(r.uid, { name: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor={`${uid}-p${r.uid}-type`}>Tipo</label>
                <select
                  id={`${uid}-p${r.uid}-type`}
                  value={r.type}
                  onChange={(e) => updateRow(r.uid, { type: e.target.value as ActionParamType })}
                >
                  <option value="string">Texto</option>
                  <option value="number">Número</option>
                  <option value="boolean">Sí / No</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor={`${uid}-p${r.uid}-desc`}>Descripción</label>
              <input
                id={`${uid}-p${r.uid}-desc`}
                value={r.description}
                onChange={(e) => updateRow(r.uid, { description: e.target.value })}
              />
            </div>
            {r.type === 'string' ? (
              <div className="field">
                <label htmlFor={`${uid}-p${r.uid}-enum`}>Valores permitidos</label>
                <input
                  id={`${uid}-p${r.uid}-enum`}
                  value={r.enumText}
                  onChange={(e) => updateRow(r.uid, { enumText: e.target.value })}
                  placeholder="separados por comas; vacío = cualquier texto"
                />
              </div>
            ) : null}
            <label className="check">
              <input type="checkbox" checked={r.required} onChange={(e) => updateRow(r.uid, { required: e.target.checked })} />
              Requerido
            </label>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() =>
            setRows((rs) => [...rs, { uid: nextUid(), name: '', type: 'string', description: '', required: true, enumText: '' }])
          }
        >
          Añadir parámetro
        </button>
      </fieldset>

      <div className="field">
        <label htmlFor={`${uid}-conn`}>Conector</label>
        <select id={`${uid}-conn`} value={connector} onChange={(e) => changeConnector(e.target.value)} required>
          {connectors.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name} ({maturityLabel(c.maturity)})
            </option>
          ))}
        </select>
        {conn ? (
          <span className="hint">
            <Badge tone={conn.maturity === 'ready' ? 'ok' : 'warn'}>{maturityLabel(conn.maturity)}</Badge> {conn.description}
          </span>
        ) : null}
      </div>

      {conn?.configFields.map((f) => {
        const id = `${uid}-cfg-${f.name}`;
        const v = config[f.name];
        if (f.type === 'boolean') {
          return (
            <label key={f.name} className="check">
              <input
                type="checkbox"
                checked={v === true}
                onChange={(e) => setConfig((c) => ({ ...c, [f.name]: e.target.checked }))}
              />
              {f.label}
            </label>
          );
        }
        return (
          <div key={f.name} className="field">
            <label htmlFor={id}>
              {f.label}
              {f.required ? ' *' : ''}
            </label>
            {f.type === 'select' ? (
              <select
                id={id}
                value={typeof v === 'string' ? v : ''}
                required={f.required}
                onChange={(e) => setConfig((c) => ({ ...c, [f.name]: e.target.value }))}
              >
                <option value="">Seleccionar…</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                value={typeof v === 'string' ? v : ''}
                required={f.required}
                placeholder={f.placeholder}
                onChange={(e) => setConfig((c) => ({ ...c, [f.name]: e.target.value }))}
              />
            )}
          </div>
        );
      })}

      <label className="check">
        <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />
        Requiere aprobación
      </label>
      <label className="check">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Habilitada
      </label>

      <div ref={errorRef}>
        {localError ? (
          <div className="form-error" role="alert">
            {localError}
          </div>
        ) : null}
        <FormError error={error} />
      </div>
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
