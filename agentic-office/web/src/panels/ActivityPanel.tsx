import type { ActionRun, Agent, Task, TaskTree } from '@agentic-office/shared';
import {
  RUN_STATUS_LABEL,
  RUN_STATUS_TONE,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  formatTime,
  formatValue,
  modelLabel,
} from './format';
import { AgentDot, Badge, EmptyState, ParamsList } from './ui';

interface Props {
  tasks: TaskTree[];
  agents: Agent[];
}

export function ActivityPanel({ tasks, agents }: Props) {
  if (tasks.length === 0) {
    return (
      <EmptyState title="Aún no hay solicitudes">
        Pídele algo al CEO desde la barra superior y verás aquí el plan, las acciones y la respuesta.
      </EmptyState>
    );
  }
  const byId = new Map(agents.map((a) => [a.id, a]));
  return (
    <ul className="list">
      {tasks.map((tree, i) => (
        <li key={tree.task.id}>
          <TaskCard tree={tree} byId={byId} defaultOpen={i === 0} />
        </li>
      ))}
    </ul>
  );
}

function TaskCard({ tree, byId, defaultOpen }: { tree: TaskTree; byId: Map<string, Agent>; defaultOpen: boolean }) {
  const { task, children, actionRuns } = tree;
  const showInstructions = task.instructions.trim() !== '' && task.instructions.trim() !== task.title.trim();
  return (
    <details className="card task-card" open={defaultOpen}>
      <summary>
        <span className="summary-main">
          <span className="card-title">{task.title}</span>
          <span className="muted small">{formatTime(task.createdAt)}</span>
        </span>
        <Badge tone={TASK_STATUS_TONE[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>
      </summary>

      <div className="card-body">
        {showInstructions ? <p className="quote">{task.instructions}</p> : null}

        <section aria-label="Plan">
          <h3 className="h-sub">Plan</h3>
          {children.length === 0 ? (
            <p className="muted small">
              {task.status === 'planning' || task.status === 'queued'
                ? 'El CEO está preparando el plan…'
                : 'Sin subtareas: el CEO respondió directamente.'}
            </p>
          ) : (
            <ol className="plan">
              {children.map((c) => (
                <SubtaskRow key={c.id} task={c} agent={byId.get(c.agentId)} />
              ))}
            </ol>
          )}
        </section>

        <section aria-label="Acciones ejecutadas">
          <h3 className="h-sub">Acciones ejecutadas</h3>
          {actionRuns.length === 0 ? (
            <p className="muted small">Todavía no se ejecutó ninguna acción.</p>
          ) : (
            <ul className="runs">
              {actionRuns.map((r) => (
                <li key={r.id}>
                  <RunItem run={r} agent={byId.get(r.agentId)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {task.result || task.error ? (
          <section aria-label="Respuesta final">
            <h3 className="h-sub">{task.error && !task.result ? 'Error' : 'Respuesta del CEO'}</h3>
            <div className={task.error && !task.result ? 'answer answer-error' : 'answer'}>
              {task.result ?? task.error}
            </div>
            {task.error && task.result ? <p className="text-error small">{task.error}</p> : null}
          </section>
        ) : null}
      </div>
    </details>
  );
}

function SubtaskRow({ task, agent }: { task: Task; agent: Agent | undefined }) {
  return (
    <li className="plan-item">
      <div className="row wrap">
        {agent ? <AgentDot color={agent.color} /> : null}
        <strong>{agent?.name ?? 'Agente eliminado'}</strong>
        <Badge tone={TASK_STATUS_TONE[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>
        <Badge tone={task.model?.toLowerCase().includes('opus') ? 'info' : 'muted'}>{modelLabel(task.model)}</Badge>
        {task.complexity === 'complex' ? <Badge tone="warn">Compleja</Badge> : null}
      </div>
      <p className="plan-title">{task.title}</p>
      {task.error ? <p className="text-error small">{task.error}</p> : null}
      {task.result ? (
        <details className="inline-details">
          <summary>Ver resultado</summary>
          <div className="answer small">{task.result}</div>
        </details>
      ) : null}
    </li>
  );
}

function RunItem({ run, agent }: { run: ActionRun; agent: Agent | undefined }) {
  const hasResult = run.result !== null && run.result !== undefined;
  return (
    <div className="run">
      <div className="row wrap">
        <strong>{run.actionName}</strong>
        <span className="muted small">{agent?.name ?? ''}</span>
        <Badge tone={RUN_STATUS_TONE[run.status]}>{RUN_STATUS_LABEL[run.status]}</Badge>
      </div>
      <ParamsList params={run.params} />
      {hasResult ? (
        <div>
          <span className="label-sm">Resultado</span>
          <pre className="pre">{formatValue(run.result)}</pre>
        </div>
      ) : null}
      {run.note && run.status !== 'rejected' ? (
        <p className="small">
          <span className="label-sm">Tu nota</span> {run.note}
        </p>
      ) : null}
      {run.error ? <p className="text-error small">{run.error}</p> : null}
    </div>
  );
}
