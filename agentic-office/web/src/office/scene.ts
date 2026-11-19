/**
 * Controlador imperativo del canvas: tamano, bucle de animacion, eventos y clics.
 * El componente React solo le pasa las props; nada de esto provoca re-renders.
 */
import type { Agent, AgentStatus, OfficeEvent } from '@agentic-office/shared';
import { ceoHitRect, ceoName, contains, slotHead, slotHitRect, walkerSpriteRect, type Point } from './geometry';
import { chooseColumns, computeLayout, effectiveScale, type SceneLayout } from './layout';
import { PAL } from './palette';
import { SpriteCache, drawBackground, drawPixelLayer, drawTextLayer, type SceneView, type ScreenTransform } from './render';
import { OfficeRuntime } from './runtime';

export type StatusMap = Record<string, { status: AgentStatus; taskId: string | null; detail: string | null }>;

export interface SceneInputs {
  agents: Agent[];
  statuses: StatusMap;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  /** Cambio del foco de teclado dentro de la oficina (para anunciarlo a lectores de pantalla). */
  onFocusAgent?: (agentId: string | null) => void;
}

export class OfficeScene {
  private inputs: SceneInputs = { agents: [], statuses: {}, selectedAgentId: null, onSelectAgent: () => {} };
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly runtime = new OfficeRuntime();
  private readonly sprites = new SpriteCache();
  private readonly pixelCanvas = document.createElement('canvas');
  private readonly bgCanvas = document.createElement('canvas');
  private layout: SceneLayout | null = null;
  private layoutKey = '';
  private transform: ScreenTransform = { offsetX: 0, offsetY: 0, scale: 1, dpr: 1, canvasW: 0, canvasH: 0 };
  private cssW = 0;
  private cssH = 0;
  private rafId = 0;
  private lastTime = 0;
  private reducedMotion = false;
  private readonly motionQuery: MediaQueryList | null;
  private readonly resizeObserver: ResizeObserver;
  private destroyed = false;
  /** Agente con el foco de teclado; null si el lienzo no tiene el foco. */
  private focusedId: string | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly container: HTMLElement,
  ) {
    this.ctx = canvas.getContext('2d');
    this.motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reducedMotion = this.motionQuery?.matches ?? false;
    this.motionQuery?.addEventListener('change', this.onMotionChange);

    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      this.cssW = entry.contentRect.width;
      this.cssH = entry.contentRect.height;
    });
    this.resizeObserver.observe(container);
    const r = container.getBoundingClientRect();
    this.cssW = r.width;
    this.cssH = r.height;

    canvas.addEventListener('click', this.onClick);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('keydown', this.onKeyDown);
    canvas.addEventListener('focus', this.onFocus);
    canvas.addEventListener('blur', this.onBlur);
    this.rafId = requestAnimationFrame(this.frame);
  }

  setInputs(inputs: SceneInputs): void {
    this.inputs = inputs;
  }

  handleEvent(event: OfficeEvent): void {
    const now = performance.now();
    if (event.type === 'delegation') {
      this.runtime.enqueueDelegation(event.toAgentId, now);
    } else if (event.type === 'agent.say') {
      this.runtime.say(event.agentId, event.text, now);
    }
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.motionQuery?.removeEventListener('change', this.onMotionChange);
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('focus', this.onFocus);
    this.canvas.removeEventListener('blur', this.onBlur);
  }

  // ------------------------------------------------------------------ bucle

  private readonly onMotionChange = (e: MediaQueryListEvent): void => {
    this.reducedMotion = e.matches;
  };

  private readonly frame = (now: number): void => {
    if (this.destroyed) return;
    const dt = this.lastTime ? now - this.lastTime : 16;
    this.lastTime = now;
    try {
      this.syncSize();
      const layout = this.ensureLayout();
      if (layout && this.ctx) {
        this.runtime.update(dt, now, layout, this.reducedMotion);
        this.draw(layout, now);
      }
    } finally {
      this.rafId = requestAnimationFrame(this.frame);
    }
  };

  private areaAgents(): Agent[] {
    return this.inputs.agents.filter((a) => a.role === 'area' && a.enabled);
  }

  private ceo(): Agent | null {
    return this.inputs.agents.find((a) => a.role === 'ceo') ?? null;
  }

  private syncSize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.cssW * dpr));
    const h = Math.max(1, Math.round(this.cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.transform.dpr = dpr;
    this.transform.canvasW = w;
    this.transform.canvasH = h;
  }

  /** Recalcula la distribucion solo si cambian los agentes o la forma del contenedor. */
  private ensureLayout(): SceneLayout | null {
    const { canvasW, canvasH } = this.transform;
    const areas = this.areaAgents();
    const cols = chooseColumns(areas.length, canvasW, canvasH);
    const key = cols + '|' + areas.map((a) => a.id).join(',');
    if (!this.layout || key !== this.layoutKey) {
      this.layout = computeLayout(
        areas.map((a) => a.id),
        cols,
      );
      this.layoutKey = key;
      this.pixelCanvas.width = this.layout.width;
      this.pixelCanvas.height = this.layout.height;
      this.bgCanvas.width = this.layout.width;
      this.bgCanvas.height = this.layout.height;
      const bg = this.bgCanvas.getContext('2d');
      if (bg) drawBackground(bg, this.layout);
      this.runtime.resetWalker();
    }
    const layout = this.layout;
    const fit = Math.min(canvasW / layout.width, canvasH / layout.height);
    const scale = effectiveScale(fit);
    this.transform.scale = scale;
    this.transform.offsetX = Math.round((canvasW - layout.width * scale) / 2);
    this.transform.offsetY = Math.round((canvasH - layout.height * scale) / 2);
    return layout;
  }

  private view(layout: SceneLayout, now: number): SceneView {
    const statuses = this.inputs.statuses;
    const agentsById = new Map<string, Agent>();
    for (const a of this.inputs.agents) agentsById.set(a.id, a);
    return {
      layout,
      ceo: this.ceo(),
      agentsById,
      statusOf: (id) => {
        const s = statuses[id];
        return { status: s?.status ?? 'idle', detail: s?.detail ?? null };
      },
      selectedId: this.inputs.selectedAgentId,
      focusedId: this.focusedId,
      runtime: this.runtime,
      now,
    };
  }

  private draw(layout: SceneLayout, now: number): void {
    const ctx = this.ctx!;
    const t = this.transform;
    const view = this.view(layout, now);

    const pctx = this.pixelCanvas.getContext('2d');
    if (pctx) drawPixelLayer(pctx, view, this.bgCanvas, this.sprites);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAL.background;
    ctx.fillRect(0, 0, t.canvasW, t.canvasH);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.pixelCanvas, t.offsetX, t.offsetY, layout.width * t.scale, layout.height * t.scale);
    drawTextLayer(ctx, view, t);
  }

  // ------------------------------------------------------------------ interaccion

  private toLogical(clientX: number, clientY: number): Point {
    const r = this.canvas.getBoundingClientRect();
    const t = this.transform;
    const dx = ((clientX - r.left) / Math.max(1, r.width)) * t.canvasW;
    const dy = ((clientY - r.top) / Math.max(1, r.height)) * t.canvasH;
    return { x: (dx - t.offsetX) / t.scale, y: (dy - t.offsetY) / t.scale };
  }

  /** Agente bajo el punto (px logicos) o null. */
  private hitTest(p: Point): string | null {
    const layout = this.layout;
    if (!layout) return null;
    const ceo = this.ceo();
    const w = this.runtime.walker;
    if (ceo && w.mode !== 'seated' && contains(walkerSpriteRect(w), p)) return ceo.id;
    for (const slot of layout.slots) if (contains(slotHitRect(slot), p)) return slot.agentId;
    if (ceo && contains(ceoHitRect(layout), p)) return ceo.id;
    return null;
  }

  private readonly onClick = (e: MouseEvent): void => {
    this.inputs.onSelectAgent(this.hitTest(this.toLogical(e.clientX, e.clientY)));
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const hit = this.hitTest(this.toLogical(e.clientX, e.clientY));
    this.canvas.style.cursor = hit ? 'pointer' : 'default';
    // Nombre completo al pasar el raton (los rotulos pueden ir abreviados).
    const agent = hit ? this.inputs.agents.find((a) => a.id === hit) : undefined;
    this.canvas.title = agent ? `${agent.name} · ${agent.area}` : '';
  };

  private readonly onPointerLeave = (): void => {
    this.canvas.style.cursor = 'default';
    this.canvas.title = '';
  };

  // ------------------------------------------------------------------ teclado

  /** Agentes navegables con su posicion en la escena (px logicos). */
  private focusTargets(): Array<{ id: string; p: Point }> {
    const layout = this.layout;
    if (!layout) return [];
    const out: Array<{ id: string; p: Point }> = [];
    const ceo = this.ceo();
    if (ceo) out.push({ id: ceo.id, p: ceoName(layout) });
    for (const slot of layout.slots) out.push({ id: slot.agentId, p: slotHead(slot) });
    return out;
  }

  private setFocus(id: string | null): void {
    if (id === this.focusedId) return;
    this.focusedId = id;
    this.inputs.onFocusAgent?.(id);
  }

  private readonly onFocus = (): void => {
    // Con el raton (clic) no se muestra el foco: solo al llegar con el teclado.
    if (!this.canvas.matches(':focus-visible')) return;
    const targets = this.focusTargets();
    const selected = this.inputs.selectedAgentId;
    this.setFocus(targets.find((t) => t.id === selected)?.id ?? targets[0]?.id ?? null);
  };

  private readonly onBlur = (): void => {
    this.setFocus(null);
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const targets = this.focusTargets();
    if (targets.length === 0) return;
    const current = targets.find((t) => t.id === this.focusedId) ?? targets[0]!;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.setFocus(current.id);
      this.inputs.onSelectAgent(current.id);
      return;
    }
    if (e.key === 'Escape') {
      if (this.inputs.selectedAgentId) {
        e.preventDefault();
        this.inputs.onSelectAgent(null);
      }
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      this.setFocus((e.key === 'Home' ? targets[0] : targets[targets.length - 1])!.id);
      return;
    }
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!dir) return;
    e.preventDefault();
    const [dx, dy] = dir as [number, number];
    // El mas cercano en esa direccion, penalizando la desviacion lateral.
    let best: { id: string; score: number } | null = null;
    for (const t of targets) {
      if (t.id === current.id) continue;
      const along = (t.p.x - current.p.x) * dx + (t.p.y - current.p.y) * dy;
      if (along <= 0) continue;
      const across = Math.abs((t.p.x - current.p.x) * dy) + Math.abs((t.p.y - current.p.y) * dx);
      const score = along + across * 2;
      if (!best || score < best.score) best = { id: t.id, score };
    }
    if (best) this.setFocus(best.id);
  };
}
