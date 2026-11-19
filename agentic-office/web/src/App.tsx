import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useOffice, type StatusMap } from './api/useOffice';
import { OfficeCanvas } from './office/OfficeCanvas';
import { ActionsPanel } from './panels/ActionsPanel';
import { ActivityPanel } from './panels/ActivityPanel';
import { AgentDetail } from './panels/AgentDetail';
import { ApprovalsPanel } from './panels/ApprovalsPanel';
import { RequestBar } from './panels/RequestBar';
import { TeamPanel } from './panels/TeamPanel';
import { ErrorState, LoadingState } from './panels/ui';

type TabKey = 'activity' | 'approvals' | 'team' | 'actions';

const CONNECTION_LABEL = {
  connecting: 'Conectando…',
  online: 'En vivo',
  offline: 'Reconectando…',
} as const;

export function App() {
  const office = useOffice();
  const [tab, setTab] = useState<TabKey>('activity');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});

  const { agents, statuses } = office;
  const filledStatuses = useMemo<StatusMap>(() => {
    const out: StatusMap = {};
    for (const a of agents) out[a.id] = statuses[a.id] ?? { status: 'idle', taskId: null, detail: null };
    return out;
  }, [agents, statuses]);

  // Si el agente seleccionado se borra, la ficha se cierra sola.
  const selected = agents.find((a) => a.id === selectedId) ?? null;

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: 'activity', label: 'Actividad' },
    { key: 'approvals', label: 'Aprobaciones', count: office.approvals.length },
    { key: 'team', label: 'Equipo' },
    { key: 'actions', label: 'Acciones' },
  ];

  function selectTab(key: TabKey) {
    setTab(key);
    setSelectedId(null);
  }

  function onTabKeyDown(e: KeyboardEvent, index: number) {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    if (!next) return;
    selectTab(next.key);
    tabRefs.current[next.key]?.focus();
  }

  const live = office.health?.llmMode === 'live';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Agentic Office</h1>
          {office.tenant ? <span className="tenant">{office.tenant.name}</span> : null}
        </div>
        <div className="topbar-status">
          {office.health ? (
            <span
              className={`mode ${live ? 'mode-live' : 'mode-mock'}`}
              title={`Opus: ${office.health.models.opus} · Sonnet: ${office.health.models.sonnet}`}
            >
              {live ? 'Claude en vivo' : 'Simulación'}
            </span>
          ) : null}
          <span className={`conn conn-${office.connection}`} role="status">
            <span className="conn-dot" aria-hidden="true" />
            {CONNECTION_LABEL[office.connection]}
          </span>
        </div>
      </header>

      {office.phase === 'loading' ? (
        <main className="fullstate">
          <LoadingState label="Abriendo la oficina…" />
        </main>
      ) : office.phase === 'error' ? (
        <main className="fullstate">
          <ErrorState message={office.error ?? 'No se pudo cargar la oficina.'} onRetry={office.reload} />
        </main>
      ) : (
        <>
          <RequestBar
            onCreated={(tree) => {
              office.applyTree(tree);
              selectTab('activity');
            }}
          />
          <main className="layout">
            <section className="office" aria-label="Oficina">
              <OfficeCanvas
                agents={agents}
                statuses={filledStatuses}
                subscribe={office.subscribe}
                selectedAgentId={selected?.id ?? null}
                onSelectAgent={(id) => {
                  setSelectedId(id);
                }}
              />
            </section>

            <aside className="side" aria-label="Panel lateral">
              <div className="tabs" role="tablist" aria-label="Secciones">
                {tabs.map((t, i) => (
                  <button
                    key={t.key}
                    ref={(el) => {
                      tabRefs.current[t.key] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`tab-${t.key}`}
                    aria-selected={tab === t.key && !selected}
                    aria-controls="side-panel"
                    tabIndex={tab === t.key ? 0 : -1}
                    className="tab"
                    onClick={() => selectTab(t.key)}
                    onKeyDown={(e) => onTabKeyDown(e, i)}
                  >
                    {t.label}
                    {t.count ? <span className="count" aria-label={`${t.count} pendientes`}>{t.count}</span> : null}
                  </button>
                ))}
              </div>
              <div className="side-body" role="tabpanel" id="side-panel" aria-labelledby={`tab-${tab}`}>
                {selected ? (
                  <AgentDetail
                    agent={selected}
                    status={filledStatuses[selected.id]}
                    actions={office.actions}
                    tasks={office.tasks}
                    onClose={() => setSelectedId(null)}
                  />
                ) : tab === 'activity' ? (
                  <ActivityPanel tasks={office.tasks} agents={agents} />
                ) : tab === 'approvals' ? (
                  <ApprovalsPanel approvals={office.approvals} agents={agents} onResolved={office.applyRun} />
                ) : tab === 'team' ? (
                  <TeamPanel
                    agents={agents}
                    actions={office.actions}
                    selectedAgentId={selectedId}
                    onSelectAgent={setSelectedId}
                    onChanged={office.reloadState}
                  />
                ) : (
                  <ActionsPanel
                    // El CEO no ejecuta acciones (la API rechaza asignarselas): solo agentes de area.
                    agents={agents.filter((a) => a.role === 'area')}
                    actions={office.actions}
                    connectors={office.connectors}
                    defaultAgentId={null}
                    onChanged={office.reloadState}
                  />
                )}
              </div>
            </aside>
          </main>
        </>
      )}
    </div>
  );
}
