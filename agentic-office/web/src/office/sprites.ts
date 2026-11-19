/**
 * Sprites pixel-art generados por codigo. Puro: produce matrices de colores; render.ts los
 * convierte en canvas y los cachea.
 */
import { FALLBACK_AGENT_COLOR, PAL } from './palette';

export const CHAR_W = 16;
export const CHAR_H = 24;

export type Facing = 'down' | 'up' | 'left' | 'right';

export interface PixelSprite {
  w: number;
  h: number;
  /** Color por pixel (fila por fila) o null si es transparente. */
  px: (string | null)[];
}

export interface Appearance {
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  hairStyle: number;
  shirt: string;
  shirtShade: string;
  shirtLight: string;
  pants: string;
  shoes: string;
  tie: boolean;
}

// ---------- utilidades ----------

export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Generador pseudoaleatorio determinista (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeHex(color: string): string {
  const c = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    return ('#' + c[1]! + c[1]! + c[2]! + c[2]! + c[3]! + c[3]!).toLowerCase();
  }
  return FALLBACK_AGENT_COLOR;
}

/** Mezcla un color con negro (amount < 0) o blanco (amount > 0). */
export function shade(hex: string, amount: number): string {
  const c = normalizeHex(hex);
  const n = parseInt(c.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const t = Math.min(1, Math.abs(amount));
  const ch = (v: number): string =>
    Math.round(v + (target - v) * t)
      .toString(16)
      .padStart(2, '0');
  return '#' + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
}

export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(normalizeHex(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const SKINS = ['#f6d5b8', '#eabf98', '#d8a274', '#b97a4f', '#8d5634', '#6a3f26'];
const HAIRS = ['#2a1d17', '#4a2f1d', '#7a4a26', '#c99a4e', '#e3c27a', '#a3442b', '#9aa0a8', '#2f3a5c'];
const PANTS = ['#2f3a56', '#3b3b45', '#4b3a2e', '#2e4a45'];
export const HAIR_STYLES = 6;

export function appearanceFor(agent: { id: string; color: string; role: string }): Appearance {
  const rnd = seededRandom(hashString(agent.id));
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length) % list.length]!;
  const skin = pick(SKINS);
  const hair = pick(HAIRS);
  const hairStyle = Math.floor(rnd() * HAIR_STYLES) % HAIR_STYLES;
  const pants = pick(PANTS);
  const shirt = normalizeHex(agent.color);
  return {
    skin,
    skinShade: shade(skin, -0.18),
    hair,
    hairShade: shade(hair, 0.18),
    hairStyle,
    shirt,
    shirtShade: shade(shirt, -0.28),
    shirtLight: shade(shirt, 0.55),
    pants,
    shoes: '#3a2a22',
    tie: agent.role === 'ceo',
  };
}

// ---------- lienzo de pixeles ----------

class PixelCanvas {
  readonly px: (string | null)[];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Array<string | null>(w * h).fill(null);
  }
  set(x: number, y: number, c: string | null): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }
  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x] ?? null;
  }
  rect(x: number, y: number, w: number, h: number, c: string | null): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }
  /** Contorno oscuro de 1 px alrededor de todo lo opaco. */
  outline(color: string): void {
    const src = this.px.slice();
    const at = (x: number, y: number): string | null =>
      x < 0 || y < 0 || x >= this.w || y >= this.h ? null : (src[y * this.w + x] ?? null);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (at(x, y) !== null) continue;
        if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) this.set(x, y, color);
      }
    }
  }
  mirrored(): PixelCanvas {
    const out = new PixelCanvas(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out.set(this.w - 1 - x, y, this.get(x, y));
    return out;
  }
  toSprite(): PixelSprite {
    return { w: this.w, h: this.h, px: this.px.slice() };
  }
}

// ---------- personaje ----------

/**
 * Personaje de 16x24. frame 0..3 es el ciclo de caminata (0 y 2 de pie, 1 y 3 paso);
 * sentado se usa el cuadro 0.
 */
export function characterSprite(a: Appearance, facing: Facing, frame: number, blink: boolean): PixelSprite {
  const f = ((frame % 4) + 4) % 4;
  let c: PixelCanvas;
  if (facing === 'down') c = front(a, f, blink);
  else if (facing === 'up') c = back(a, f);
  else {
    c = side(a, f, blink);
    if (facing === 'left') c = c.mirrored();
  }
  c.outline(PAL.outline);
  return c.toSprite();
}

function legsFront(c: PixelCanvas, a: Appearance, f: number): void {
  const raiseL = f === 1 ? 1 : 0;
  const raiseR = f === 3 ? 1 : 0;
  c.rect(5, 19, 3, 4 - raiseL, a.pants);
  c.rect(4, 23 - raiseL, 4, 1, a.shoes);
  c.rect(8, 19, 3, 4 - raiseR, a.pants);
  c.rect(8, 23 - raiseR, 4, 1, a.shoes);
  c.set(7, 19, shade(a.pants, -0.25));
}

function torso(c: PixelCanvas, a: Appearance, f: number, showFront: boolean): void {
  c.rect(4, 10, 8, 1, a.shirt);
  c.rect(3, 11, 10, 7, a.shirt);
  c.rect(3, 11, 1, 7, a.shirtShade);
  c.rect(12, 11, 1, 7, a.shirtShade);
  c.rect(3, 18, 10, 1, shade(a.pants, -0.3));
  // Brazos: se balancean al caminar.
  const swingL = f === 1 ? 1 : f === 3 ? -1 : 0;
  const swingR = -swingL;
  c.rect(2, 11 + swingL, 1, 6, a.shirtShade);
  c.set(2, 17 + swingL, a.skin);
  c.rect(13, 11 + swingR, 1, 6, a.shirtShade);
  c.set(13, 17 + swingR, a.skin);
  if (showFront) {
    if (a.tie) {
      c.set(6, 10, PAL.paper);
      c.set(9, 10, PAL.paper);
      c.rect(7, 10, 2, 1, shade(PAL.tie, -0.2));
      c.rect(7, 11, 2, 5, PAL.tie);
      c.set(7, 16, PAL.tie);
    } else {
      c.rect(7, 10, 2, 1, a.shirtLight);
      c.set(8, 11, a.shirtLight);
    }
  }
}

function headFront(c: PixelCanvas, a: Appearance): void {
  c.rect(4, 2, 8, 8, a.skin);
  c.set(4, 2, null);
  c.set(11, 2, null);
  c.set(4, 9, null);
  c.set(11, 9, null);
  c.set(3, 6, a.skin);
  c.set(12, 6, a.skin);
}

function hairFront(c: PixelCanvas, a: Appearance): void {
  const h = a.hair;
  const hs = a.hairShade;
  const cap = (): void => {
    c.rect(5, 1, 6, 1, h);
    c.rect(4, 2, 8, 2, h);
  };
  switch (a.hairStyle) {
    case 0: // corto
      cap();
      c.set(4, 4, h);
      c.set(11, 4, h);
      break;
    case 1: // largo
      cap();
      c.rect(3, 3, 2, 8, h);
      c.rect(11, 3, 2, 8, h);
      break;
    case 2: // de punta
      c.set(5, 0, h);
      c.set(7, 0, h);
      c.set(9, 0, h);
      c.rect(4, 1, 8, 3, h);
      c.set(4, 4, h);
      c.set(11, 4, h);
      break;
    case 3: // mono alto
      c.rect(6, 0, 4, 1, h);
      cap();
      c.set(4, 4, h);
      c.set(11, 4, h);
      break;
    case 4: // rizado
      c.rect(4, 1, 8, 1, h);
      c.rect(3, 2, 10, 3, h);
      c.rect(3, 5, 1, 3, h);
      c.rect(12, 5, 1, 3, h);
      break;
    default: // raya al lado con flequillo
      cap();
      c.rect(4, 4, 4, 1, h);
      c.set(4, 5, h);
      c.set(11, 4, h);
      break;
  }
  c.set(6, 2, hs);
  c.set(7, 2, hs);
}

function front(a: Appearance, f: number, blink: boolean): PixelCanvas {
  const c = new PixelCanvas(CHAR_W, CHAR_H);
  legsFront(c, a, f);
  torso(c, a, f, true);
  headFront(c, a);
  hairFront(c, a);
  const eye = blink ? a.skinShade : PAL.eye;
  c.set(6, 6, eye);
  c.set(9, 6, eye);
  if (!blink) {
    c.set(6, 5, shade(a.skin, 0.25));
    c.set(9, 5, shade(a.skin, 0.25));
  }
  c.rect(7, 8, 2, 1, a.skinShade);
  return c;
}

function back(a: Appearance, f: number): PixelCanvas {
  const c = new PixelCanvas(CHAR_W, CHAR_H);
  legsFront(c, a, f);
  torso(c, a, f, false);
  headFront(c, a);
  c.rect(6, 9, 4, 1, a.skinShade);
  const h = a.hair;
  const bottom = a.hairStyle === 1 ? 11 : 9;
  const wide = a.hairStyle === 4;
  c.rect(5, 1, 6, 1, h);
  c.rect(4, 2, 8, bottom - 2, h);
  if (wide) c.rect(3, 2, 10, 6, h);
  if (a.hairStyle === 1) c.rect(3, 3, 10, 8, h);
  if (a.hairStyle === 3) c.rect(6, 0, 4, 2, a.hairShade);
  if (a.hairStyle === 2) {
    c.set(5, 0, h);
    c.set(7, 0, h);
    c.set(9, 0, h);
  }
  c.set(7, 3, a.hairShade);
  return c;
}

function side(a: Appearance, f: number, blink: boolean): PixelCanvas {
  const c = new PixelCanvas(CHAR_W, CHAR_H);
  const pantsDark = shade(a.pants, -0.25);
  // Piernas
  if (f === 1) {
    c.rect(5, 19, 2, 3, pantsDark);
    c.rect(4, 22, 3, 1, a.shoes);
    c.rect(8, 19, 3, 4, a.pants);
    c.rect(8, 23, 4, 1, a.shoes);
  } else if (f === 3) {
    c.rect(9, 19, 2, 3, pantsDark);
    c.rect(9, 22, 3, 1, a.shoes);
    c.rect(5, 19, 3, 4, a.pants);
    c.rect(5, 23, 4, 1, a.shoes);
  } else {
    c.rect(6, 19, 4, 4, a.pants);
    c.set(7, 19, pantsDark);
    c.rect(6, 23, 5, 1, a.shoes);
  }
  // Torso
  c.rect(5, 10, 6, 8, a.shirt);
  c.rect(5, 10, 1, 8, a.shirtShade);
  c.rect(5, 18, 6, 1, shade(a.pants, -0.3));
  if (a.tie) c.rect(10, 11, 1, 4, PAL.tie);
  // Brazo
  const ax = f === 1 ? 9 : f === 3 ? 5 : 7;
  c.rect(ax, 11, 2, 6, a.shirtShade);
  c.rect(ax, 17, 2, 1, a.skin);
  // Cabeza
  c.rect(5, 2, 7, 8, a.skin);
  c.set(5, 2, null);
  c.set(11, 2, null);
  c.set(11, 9, null);
  c.set(12, 6, a.skin);
  c.set(8, 6, a.skinShade);
  c.set(10, 6, blink ? a.skinShade : PAL.eye);
  c.set(11, 8, a.skinShade);
  // Pelo
  const h = a.hair;
  c.rect(6, 1, 5, 1, h);
  c.rect(5, 2, 7, 2, h);
  c.rect(5, 4, 2, 4, h);
  switch (a.hairStyle) {
    case 1:
      c.rect(4, 3, 3, 8, h);
      break;
    case 2:
      c.set(6, 0, h);
      c.set(8, 0, h);
      c.set(10, 0, h);
      break;
    case 3:
      c.rect(3, 1, 3, 3, h);
      break;
    case 4:
      c.rect(4, 1, 8, 4, h);
      c.rect(4, 5, 3, 4, h);
      break;
    case 5:
      c.rect(9, 4, 3, 1, h);
      break;
    default:
      break;
  }
  c.set(8, 2, a.hairShade);
  return c;
}

// ---------- iconos ----------

function fromRows(rows: string[], colors: Record<string, string>): PixelSprite {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const px: (string | null)[] = new Array<string | null>(w * h).fill(null);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = colors[row[x]!];
      if (col) px[y * w + x] = col;
    }
  });
  return { w, h, px };
}

export const ALERT_ICON: PixelSprite = fromRows(
  [
    '.....#.....',
    '....#Y#....',
    '....#Y#....',
    '...#YKY#...',
    '...#YKY#...',
    '..#YYKYY#..',
    '..#YYKYY#..',
    '.#YYYYYYY#.',
    '.#YYYKYYY#.',
    '###########',
  ],
  { '#': PAL.alertDark, Y: PAL.alert, K: PAL.outline },
);

export const DOC_ICON: PixelSprite = fromRows(
  ['#####..', '#WWW##.', '#WWW#W#', '#WWWWW#', '#WGGGW#', '#WWWWW#', '#WGGGW#', '#WWWWW#', '#######'],
  { '#': PAL.outline, W: PAL.paper, G: PAL.paperLine },
);

/** Nube de pensamiento sin puntos (los puntos se animan al dibujar). */
export const THOUGHT_ICON: PixelSprite = fromRows(
  [
    '..#########..',
    '.#WWWWWWWWW#.',
    '#WWWWWWWWWWW#',
    '#WWWWWWWWWWW#',
    '#WWWWWWWWWWW#',
    '.#WWWWWWWWW#.',
    '..##W######..',
    '...#W#.......',
    '....#........',
    '.##..........',
    '#WW#.........',
    '.##..........',
  ],
  { '#': PAL.outline, W: PAL.bubble },
);
