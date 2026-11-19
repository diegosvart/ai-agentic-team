/**
 * Estado animado de la oficina que no depende del DOM: recorridos del CEO y globos de dialogo.
 * Vive dentro de un ref del componente; nunca en estado de React.
 */
import { isWalkable, TILE, tileCenter, type SceneLayout, type TilePoint } from './layout';
import { findPath, simplifyPath } from './pathfinding';
import type { Facing } from './sprites';

export const WALK_SPEED = 80; // px logicos por segundo (5 baldosas/s)
export const HANDOFF_MS = 900;
/** Con entregas en cola el CEO acelera (hasta x4) y abrevia la entrega para no ir por detras del estado real. */
export const MAX_SPEEDUP = 4;
export const QUEUED_HANDOFF_MS = 400;
export const TELEPORT_MS = 1400;
export const BUBBLE_MS = 4200;
const MAX_QUEUE = 10;

export type WalkerMode = 'seated' | 'walking' | 'handoff' | 'teleport';

export interface WalkerState {
  mode: WalkerMode;
  /** Centro de la baldosa actual, en px logicos (los pies quedan un poco por debajo). */
  x: number;
  y: number;
  facing: Facing;
  /** Esquinas pendientes del recorrido, en px. */
  waypoints: Array<{ x: number; y: number }>;
  /** Distancia acumulada: elige el cuadro del ciclo de caminata. */
  distance: number;
  targetAgentId: string | null;
  returning: boolean;
  timer: number;
  /** Duracion total de la entrega en curso (para la animacion del documento). */
  handoffMs: number;
}

export interface Bubble {
  text: string;
  until: number;
}

export class OfficeRuntime {
  walker: WalkerState = OfficeRuntime.seatedWalker();
  queue: string[] = [];
  /** Momento en que llego cada delegacion en cola (mismo orden que queue). */
  private queuedAt: number[] = [];
  /** Momento en que llego la delegacion que se esta entregando. */
  private targetSince = 0;
  private clock = 0;
  bubbles = new Map<string, Bubble>();

  static seatedWalker(): WalkerState {
    return {
      mode: 'seated',
      x: 0,
      y: 0,
      facing: 'down',
      waypoints: [],
      distance: 0,
      targetAgentId: null,
      returning: false,
      timer: 0,
      handoffMs: HANDOFF_MS,
    };
  }

  enqueueDelegation(agentId: string, now = this.clock): void {
    this.queue.push(agentId);
    this.queuedAt.push(now);
    if (this.queue.length > MAX_QUEUE) {
      this.queue.splice(0, this.queue.length - MAX_QUEUE);
      this.queuedAt.splice(0, this.queuedAt.length - MAX_QUEUE);
    }
  }

  say(agentId: string, text: string, now: number): void {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    this.bubbles.set(agentId, { text: clean, until: now + BUBBLE_MS });
  }

  /** La distribucion cambio (agentes o tamano): el CEO vuelve a su silla, la cola se conserva. */
  resetWalker(): void {
    this.walker = OfficeRuntime.seatedWalker();
  }

  /**
   * Multiplicador de velocidad: cada delegacion pendiente acelera el recorrido, y la vuelta al
   * despacho tambien va rapida si ya llegaron delegaciones nuevas.
   */
  speedup(now = this.clock): number {
    const w = this.walker;
    // Retraso de la entrega en curso: pasado medio segundo desde la delegacion, el CEO va acelerando.
    const lag = w.targetAgentId && !w.returning ? Math.max(0, (now - this.targetSince - 500) / 500) : 0;
    return Math.min(MAX_SPEEDUP, 1 + 0.75 * this.queue.length + lag);
  }

  /** Progreso 0..1 de la entrega del documento, o null si no hay entrega en curso. */
  handoffProgress(): number | null {
    const w = this.walker;
    if (w.mode === 'handoff') return 1 - w.timer / (w.handoffMs || HANDOFF_MS);
    if (w.mode === 'teleport' && !w.returning) return Math.min(1, 1 - w.timer / TELEPORT_MS + 0.2);
    return null;
  }

  update(dtMs: number, now: number, layout: SceneLayout, reducedMotion: boolean): void {
    this.clock = now;
    for (const [id, b] of this.bubbles) if (b.until <= now) this.bubbles.delete(id);

    const dt = Math.min(dtMs, 100);
    const w = this.walker;
    switch (w.mode) {
      case 'seated':
        this.startNext(layout, layout.office.seat, reducedMotion);
        break;
      case 'walking':
        this.advance(dt * this.speedup());
        break;
      case 'handoff':
        w.timer -= dt;
        if (w.timer <= 0) this.afterHandoff(layout, reducedMotion);
        break;
      case 'teleport':
        w.timer -= dt;
        if (w.timer <= 0) {
          if (w.returning) this.resetWalker();
          else this.afterHandoff(layout, reducedMotion);
        }
        break;
    }
  }

  private currentTile(): TilePoint {
    return { x: Math.floor(this.walker.x / TILE), y: Math.floor(this.walker.y / TILE) };
  }

  /** Saca de la cola el siguiente destino valido y arranca hacia el desde `from`. */
  private startNext(layout: SceneLayout, from: TilePoint, reducedMotion: boolean): boolean {
    while (this.queue.length > 0) {
      const id = this.queue.shift()!;
      this.targetSince = this.queuedAt.shift() ?? this.clock;
      const slot = layout.slots.find((s) => s.agentId === id);
      if (!slot) continue;
      if (reducedMotion) {
        const c = tileCenter(slot.stand);
        this.walker = { ...OfficeRuntime.seatedWalker(), mode: 'teleport', x: c.x, y: c.y, facing: 'up', targetAgentId: id, timer: TELEPORT_MS };
        return true;
      }
      const path = this.route(layout, from, slot.stand);
      if (!path) continue;
      const start = tileCenter(from);
      this.walker = {
        ...OfficeRuntime.seatedWalker(),
        mode: 'walking',
        x: start.x,
        y: start.y,
        facing: 'down',
        waypoints: path,
        targetAgentId: id,
        distance: this.walker.mode === 'seated' ? 0 : this.walker.distance,
      };
      return true;
    }
    return false;
  }

  private route(layout: SceneLayout, from: TilePoint, to: TilePoint): Array<{ x: number; y: number }> | null {
    const grid = {
      width: layout.widthTiles,
      height: layout.heightTiles,
      isWalkable: (x: number, y: number) => isWalkable(layout, x, y),
    };
    const path = findPath(grid, from, to);
    if (!path) return null;
    return simplifyPath(path).slice(1).map(tileCenter);
  }

  private afterHandoff(layout: SceneLayout, reducedMotion: boolean): void {
    if (this.startNext(layout, this.currentTile(), reducedMotion)) return;
    const seat = layout.office.seat;
    if (reducedMotion) {
      const c = tileCenter(seat);
      this.walker = { ...OfficeRuntime.seatedWalker(), mode: 'teleport', x: c.x, y: c.y, returning: true, timer: 250 };
      return;
    }
    const path = this.route(layout, this.currentTile(), seat);
    if (!path || path.length === 0) {
      this.resetWalker();
      return;
    }
    Object.assign(this.walker, { mode: 'walking', waypoints: path, returning: true, targetAgentId: null });
  }

  private advance(dt: number): void {
    const w = this.walker;
    let budget = (WALK_SPEED * dt) / 1000;
    while (budget > 0 && w.waypoints.length > 0) {
      const next = w.waypoints[0]!;
      const dx = next.x - w.x;
      const dy = next.y - w.y;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > 0) {
        w.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      }
      if (dist <= budget) {
        w.x = next.x;
        w.y = next.y;
        w.distance += dist;
        budget -= dist;
        w.waypoints.shift();
      } else {
        const step = budget / dist;
        w.x += dx * step;
        w.y += dy * step;
        w.distance += budget;
        budget = 0;
      }
    }
    if (w.waypoints.length === 0) {
      if (w.returning) {
        this.resetWalker();
      } else {
        w.mode = 'handoff';
        w.facing = 'up';
        w.timer = this.queue.length > 0 ? QUEUED_HANDOFF_MS : HANDOFF_MS;
        w.handoffMs = w.timer;
      }
    }
  }
}

/** Cuadro del ciclo de caminata (4 cuadros, uno cada 5 px recorridos). */
export function walkFrame(w: WalkerState): number {
  if (w.mode !== 'walking') return 0;
  return Math.floor(w.distance / 5) % 4;
}
