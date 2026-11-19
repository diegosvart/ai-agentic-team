/** Rectangulos y anclas de cada elemento, en px logicos. Puro: lo usan el render y el clic. */
import { TILE, type DeskSlot, type SceneLayout } from './layout';
import type { WalkerState } from './runtime';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export function contains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
}

// ----- Escritorio de area (coordenadas relativas al origen de la celda) -----

export const DESK = { x: 18, top: 22, w: 76, topH: 12, frontH: 11 } as const;
export const SEATED_CHAR = { x: 48, y: 4 } as const;
export const MONITOR = { x: 22, y: 9 } as const;

export function slotHitRect(s: DeskSlot): Rect {
  return { x: s.px + 14, y: s.py - 2, w: 84, h: 68 };
}

export function slotSelectRect(s: DeskSlot): Rect {
  return { x: s.px + 12, y: s.py, w: 88, h: 62 };
}

export function slotHead(s: DeskSlot): Point {
  return { x: s.px + SEATED_CHAR.x + 8, y: s.py + SEATED_CHAR.y };
}

export function slotPlaque(s: DeskSlot): Point {
  return { x: s.px + DESK.x + DESK.w / 2, y: s.py + DESK.top + DESK.topH + DESK.frontH / 2 };
}

export function slotName(s: DeskSlot): Point {
  return { x: s.px + 56, y: s.py + 55 };
}

// ----- Despacho del CEO -----

export function ceoDesk(layout: SceneLayout): { x: number; top: number; w: number; topH: number; frontH: number } {
  return { x: (layout.office.ox + 2) * TILE - 2, top: 52, w: 5 * TILE + 4, topH: 11, frontH: 13 };
}

export function ceoSeatX(layout: SceneLayout): number {
  return layout.office.seat.x * TILE + TILE / 2;
}

export const CEO_SEATED_Y = 33;
export const CEO_STANDING_Y = 29;

export function ceoHitRect(layout: SceneLayout): Rect {
  const d = ceoDesk(layout);
  return { x: d.x - 4, y: 26, w: d.w + 8, h: d.top + d.topH + d.frontH - 26 + 18 };
}

export function ceoSelectRect(layout: SceneLayout): Rect {
  const d = ceoDesk(layout);
  return { x: d.x - 6, y: 28, w: d.w + 12, h: d.top + d.topH + d.frontH - 28 + 4 };
}

export function ceoPlaque(layout: SceneLayout): Point {
  const d = ceoDesk(layout);
  return { x: d.x + d.w / 2, y: d.top + d.topH + d.frontH / 2 };
}

export function ceoName(layout: SceneLayout): Point {
  return { x: ceoSeatX(layout), y: 86 };
}

// ----- CEO caminando -----

export function walkerSpriteRect(w: WalkerState): Rect {
  return { x: Math.round(w.x) - 8, y: Math.round(w.y) + 7 - 24, w: 16, h: 24 };
}
