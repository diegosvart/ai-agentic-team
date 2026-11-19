import type { ActionDef, Agent, AgentStatus, TaskTree } from '@agentic-office/shared';
import {
  AGENT_STATUS_LABEL,
  AGENT_STATUS_TONE,
  RUN_STATUS_LABEL,
  RUN_STATUS_TONE,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  formatTime,
  modelLabel,
} from './format';
import { AgentDot, Badge } from './ui';

interface Props {
  agent: Agent;
  status: { status: AgentStatus; taskId: string | null; detail: string | null } | undefined;
  actions: ActionDef[];
  tasks: TaskTree[];
  onClose: () => void;
}

/** Ficha del agente seleccionado en la oficina. */
export function AgentDetail({ agent, status, actions, tasks, onClose }: Props) {
  const current = status ?? { status: 'idle' as const, taskId: null, detail: null };
  const mine = actions.filter((a) => a.agentId === agent.id);

  const allTasks = tasks.flatMap((t) => [t.task, ...t.children]);
  const currentTask = current.taskId ? allTasks.find((t) => t.id === current.taskId) : undefined;
  const recentTasks = allTasks
    .filter((t) => t.agentId === agent.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  const recentRuns = tasks
    .flatMap((t) => t.actionRuns)
    .filter((r) => r.agentId === agent.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  return (
    <div className="agent-detail">
      <div className="row between">
        <h2 className="h-title row">
          <AgentDot color={agent.color} />
          {agent.name}
        </h2>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cerrar ficha
        </button>
      </div>
      <p className="muted small">
        {agent.area} · {agent.role === 'ceo' ? 'Dirección' : 'Agente de área'} · modelo {modelLabel(agent.defaultModel)}
        {!agent.enabled ? ' · deshabilitado' : ''}
      </p>
      {agent.description ? <p>{agent.description}</p> : null}

      <h3 className="h-sub">Estado</h3>
      <div className="row wrap">
        <Badge tone={AGENT_STATUS_TONE[current.status]}>{AGENT_STATUS_LABEL[current.status]}</Badge>
        {current.detail ? <span className="small">{current.detail}</span> : null}
      </div>

      <h3 className="h-sub">Tarea actual</h3>
      {currentTask ? (
        <p>{currentTask.title}</p>
      ) : (
        <p className="muted small">Sin tarea en curso.</p>
      )}

      <h3 className="h-sub">Acciones disponibles</h3>
      {mine.length === 0 ? (
        <p className="muted small">No tiene acciones declaradas.</p>
      ) : (
        <ul className="plain">
          {mine.map((a) => (
            <li key={a.id} className="row wrap">
              <strong>{a.name}</strong>
              {a.requiresApproval ? <Badge tone="warn">Requiere aprobación</Badge> : null}
              {!a.enabled ? <Badge>Deshabilitada</Badge> : null}
            </li>
          ))}
        </ul>
      )}

      <h3 className="h-sub">Actividad reciente</h3>
      {recentTasks.length === 0 && recentRuns.length === 0 ? (
        <p className="muted small">Todavía no ha participado en ninguna solicitud.</p>
      ) : (
        <ul className="plain">
          {recentTasks.map((t) => (
            <li key={t.id} className="row wrap">
              <Badge tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
              <span>{t.title}</span>
              <span className="muted small">{formatTime(t.updatedAt)}</span>
            </li>
          ))}
          {recentRuns.map((r) => (
            <li key={r.id} className="row wrap">
              <Badge tone={RUN_STATUS_TONE[r.status]}>{RUN_STATUS_LABEL[r.status]}</Badge>
              <span>Acción {r.actionName}</span>
              <span className="muted small">{formatTime(r.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
