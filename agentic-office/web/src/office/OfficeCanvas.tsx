import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react';
import type { Agent, AgentStatus, OfficeEvent } from '@agentic-office/shared';
import { OfficeScene } from './scene';
import { PAL } from './palette';

export interface OfficeCanvasProps {
  agents: Agent[]; // incluye al CEO (role 'ceo'); puede cambiar en caliente
  statuses: Record<string, { status: AgentStatus; taskId: string | null; detail: string | null }>;
  /** Flujo de eventos en vivo; reacciona a 'delegation' y 'agent.say'. Devuelve unsubscribe. */
  subscribe: (listener: (event: OfficeEvent) => void) => () => void;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'disponible',
  thinking: 'pensando',
  delegating: 'delegando',
  working: 'trabajando',
  waiting_approval: 'esperando aprobación',
};

/** Resumen textual para lectores de pantalla. */
function describeOffice(agents: Agent[], statuses: OfficeCanvasProps['statuses']): string {
  const visible = agents.filter((a) => a.role === 'ceo' || a.enabled);
  if (visible.length === 0) return 'Oficina virtual vacía.';
  const parts = visible.map((a) => {
    const s = statuses[a.id];
    const label = STATUS_LABEL[s?.status ?? 'idle'];
    const detail = s?.detail ? ` (${s.detail})` : '';
    return `${a.name}, ${a.area}: ${label}${detail}`;
  });
  return `Oficina virtual. ${parts.join('; ')}.`;
}

/**
 * Oficina pixel-art en canvas. Todo el estado de animacion vive en OfficeScene (fuera de React);
 * el componente solo sincroniza props y suscripciones.
 */
export function OfficeCanvas(props: OfficeCanvasProps): JSX.Element {
  const { agents, statuses, subscribe, selectedAgentId, onSelectAgent } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OfficeScene | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Efecto de layout para que la escena exista antes de recibir las primeras props.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const scene = new OfficeScene(canvas, container);
    sceneRef.current = scene;
    return () => {
      scene.destroy();
      sceneRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    sceneRef.current?.setInputs({ agents, statuses, selectedAgentId, onSelectAgent, onFocusAgent: setFocusedId });
  }, [agents, statuses, selectedAgentId, onSelectAgent]);

  useEffect(() => {
    return subscribe((event) => sceneRef.current?.handleEvent(event));
  }, [subscribe]);

  const label = useMemo(() => describeOffice(agents, statuses), [agents, statuses]);
  // Anuncio del agente con el foco de teclado (nombre completo y estado).
  const focused = focusedId ? agents.find((a) => a.id === focusedId) : undefined;
  const focusText = focused
    ? `${focused.name}, ${focused.area}: ${STATUS_LABEL[statuses[focused.id]?.status ?? 'idle']}. Pulsa Enter para abrir su ficha.`
    : '';

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 280,
        overflow: 'hidden',
        background: PAL.background,
      }}
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-roledescription="oficina"
        aria-label={`${label} Usa las flechas para recorrer a los agentes y Enter para abrir su ficha.`}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'manipulation' }}
      />
      <div className="sr-only" aria-live="polite">
        {focusText}
      </div>
    </div>
  );
}
