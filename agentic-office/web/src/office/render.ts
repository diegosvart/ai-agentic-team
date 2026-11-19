/**
 * Dibujo de la oficina. Dos capas:
 *  - Capa de pixeles: se pinta a resolucion logica (1 px = 1 pixel-art) en un canvas fuera de
 *    pantalla y se escala al visible por vecino mas cercano.
 *  - Capa de texto: rotulos, nombres y globos, a resolucion de pantalla para que se lean bien.
 */
import type { Agent, AgentStatus } from '@agentic-office/shared';
import {
  CEO_SEATED_Y,
  CEO_STANDING_Y,
  DESK,
  MONITOR,
  SEATED_CHAR,
  ceoDesk,
  ceoName,
  ceoPlaque,
  ceoSeatX,
  ceoSelectRect,
  slotHead,
  slotName,
  slotPlaque,
  slotSelectRect,
  walkerSpriteRect,
  type Point,
  type Rect,
} from './geometry';
import { CELL_W, OFFICE_PARTITION, OFFICE_TOP, OFFICE_W, TILE, type DeskSlot, type SceneLayout } from './layout';
import { FONT_STACK, PAL } from './palette';
import { walkFrame, type OfficeRuntime } from './runtime';
import {
  ALERT_ICON,
  DOC_ICON,
  THOUGHT_ICON,
  appearanceFor,
  characterSprite,
  hashString,
  normalizeHex,
  seededRandom,
  shade,
  withAlpha,
  type Facing,
  type PixelSprite,
} from './sprites';
import { fitLabel, wrapText } from './text';

type Ctx = CanvasRenderingContext2D;

export interface StatusInfo {
  status: AgentStatus;
  detail: string | null;
}

export interface SceneView {
  layout: SceneLayout;
  ceo: Agent | null;
  agentsById: Map<string, Agent>;
  statusOf: (agentId: string) => StatusInfo;
  selectedId: string | null;
  /** Agente con el foco de teclado (navegacion con flechas), o null. */
  focusedId: string | null;
  runtime: OfficeRuntime;
  now: number;
}

export interface ScreenTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
  dpr: number;
  canvasW: number;
  canvasH: number;
}

// ---------------------------------------------------------------- cache de sprites

function spriteToCanvas(sprite: PixelSprite): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = sprite.w;
  canvas.height = sprite.h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (let y = 0; y < sprite.h; y++) {
      for (let x = 0; x < sprite.w; x++) {
        const c = sprite.px[y * sprite.w + x];
        if (c) {
          ctx.fillStyle = c;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }
  return canvas;
}

export class SpriteCache {
  private chars = new Map<string, HTMLCanvasElement>();
  private icons = new Map<PixelSprite, HTMLCanvasElement>();

  character(agent: Agent, facing: Facing, frame: number, blink: boolean): HTMLCanvasElement {
    const key = `${agent.id}|${agent.color}|${agent.role}|${facing}|${frame}|${blink ? 1 : 0}`;
    let c = this.chars.get(key);
    if (!c) {
      c = spriteToCanvas(characterSprite(appearanceFor(agent), facing, frame, blink));
      this.chars.set(key, c);
      // Evita crecer sin limite si cambian muchos colores en caliente.
      if (this.chars.size > 600) this.chars.delete(this.chars.keys().next().value as string);
    }
    return c;
  }

  icon(sprite: PixelSprite): HTMLCanvasElement {
    let c = this.icons.get(sprite);
    if (!c) {
      c = spriteToCanvas(sprite);
      this.icons.set(sprite, c);
    }
    return c;
  }
}

// ---------------------------------------------------------------- utilidades

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Variacion animada por agente para que no parpadeen todos a la vez. */
function agentPhase(id: string): number {
  return hashString(id) % 10000;
}

function isBlinking(id: string, now: number): boolean {
  const period = 3600 + (hashString(id) % 1800);
  return (now + agentPhase(id)) % period < 140;
}

function breathOffset(id: string, now: number): number {
  return (now + agentPhase(id)) % 2400 < 1100 ? 0 : 1;
}

// ---------------------------------------------------------------- fondo estatico

export function drawBackground(ctx: Ctx, layout: SceneLayout): void {
  const W = layout.widthTiles;
  const H = layout.heightTiles;
  const ox = layout.office.ox;
  ctx.clearRect(0, 0, layout.width, layout.height);

  // Suelo de baldosas.
  for (let ty = 2; ty < H - 1; ty++) {
    for (let tx = 1; tx < W - 1; tx++) {
      const x = tx * TILE;
      const y = ty * TILE;
      rect(ctx, x, y, TILE, TILE, (tx + ty) % 2 === 0 ? PAL.floorA : PAL.floorB);
      rect(ctx, x, y, TILE, 1, PAL.floorGrout);
      rect(ctx, x, y, 1, TILE, PAL.floorGrout);
    }
  }

  // Parquet del despacho.
  const officeX = (ox + 1) * TILE;
  const officeW = (OFFICE_W - 2) * TILE;
  const officeY = OFFICE_TOP * TILE;
  const officeH = (OFFICE_PARTITION - OFFICE_TOP) * TILE;
  for (let row = 0; row * 4 < officeH; row++) {
    const y = officeY + row * 4;
    rect(ctx, officeX, y, officeW, 4, row % 2 === 0 ? PAL.plankA : PAL.plankB);
    rect(ctx, officeX, y + 3, officeW, 1, PAL.plankSeam);
    for (let x = officeX + ((row * 11) % 24); x < officeX + officeW; x += 24) rect(ctx, x, y, 1, 3, PAL.plankSeam);
  }
  // Umbral de la puerta.
  rect(ctx, (ox + 3) * TILE, OFFICE_PARTITION * TILE, 3 * TILE, TILE, PAL.plankB);
  rect(ctx, (ox + 3) * TILE, OFFICE_PARTITION * TILE + TILE - 2, 3 * TILE, 2, PAL.plankSeam);

  // Alfombra bajo el escritorio del CEO.
  const rugX = (ox + 2) * TILE - 6;
  const rugY = 3 * TILE - 6;
  const rugW = 5 * TILE + 12;
  const rugH = 3 * TILE + 4;
  rect(ctx, rugX, rugY, rugW, rugH, PAL.rugBorder);
  rect(ctx, rugX + 2, rugY + 2, rugW - 4, rugH - 4, PAL.rug);
  rect(ctx, rugX + 5, rugY + 5, rugW - 10, rugH - 10, PAL.rugInner);
  rect(ctx, rugX + 7, rugY + 7, rugW - 14, rugH - 14, PAL.rug);

  // Alfombra del pasillo.
  const corridorY = (OFFICE_PARTITION + 1) * TILE + 3;
  rect(ctx, TILE + 4, corridorY, (W - 2) * TILE - 8, 2 * TILE - 6, PAL.runnerBorder);
  rect(ctx, TILE + 6, corridorY + 2, (W - 2) * TILE - 12, 2 * TILE - 10, PAL.runner);
  for (let x = TILE + 10; x < (W - 1) * TILE - 10; x += 8) rect(ctx, x, corridorY + TILE - 4, 4, 1, PAL.runnerStripe);

  // Pared superior.
  rect(ctx, 0, 0, layout.width, 6, PAL.wallTop);
  rect(ctx, 0, 5, layout.width, 1, PAL.wallTopEdge);
  rect(ctx, 0, 6, layout.width, 24, PAL.wallFace);
  for (let x = TILE; x < layout.width - TILE; x += 32) rect(ctx, x, 6, 1, 24, PAL.wallFaceDark);
  rect(ctx, 0, 30, layout.width, 2, PAL.baseboard);
  for (const d of layout.decor) drawWallDecor(ctx, d.kind, d.tx * TILE, d.w * TILE);

  // Paredes laterales e inferior (vistas desde arriba).
  rect(ctx, 0, 0, TILE, layout.height, PAL.wallTop);
  rect(ctx, TILE - 2, 6, 2, layout.height - TILE - 6, PAL.wallTopEdge);
  rect(ctx, layout.width - TILE, 0, TILE, layout.height, PAL.wallTop);
  rect(ctx, layout.width - TILE, 6, 2, layout.height - TILE - 6, PAL.wallTopEdge);
  rect(ctx, 0, layout.height - TILE, layout.width, TILE, PAL.wallTop);
  rect(ctx, TILE, layout.height - TILE, layout.width - 2 * TILE, 2, PAL.wallTopEdge);

  // Tabiques de cristal del despacho.
  const partY = OFFICE_PARTITION * TILE;
  const sideTop = OFFICE_TOP * TILE;
  for (const col of [ox, ox + OFFICE_W - 1]) {
    const x = col * TILE + 5;
    rect(ctx, x, sideTop, 6, partY + 12 - sideTop, PAL.frame);
    rect(ctx, x + 1, sideTop, 4, partY + 10 - sideTop, PAL.glass);
    rect(ctx, x + 2, sideTop + 6, 1, partY - sideTop - 12, PAL.glassShine);
  }
  for (let col = ox; col < ox + OFFICE_W; col++) {
    if (col >= ox + 3 && col <= ox + 5) continue;
    const x = col * TILE;
    rect(ctx, x, partY + 2, TILE, 10, PAL.frame);
    rect(ctx, x, partY + 3, TILE, 6, PAL.glass);
    rect(ctx, x + 3, partY + 4, 5, 1, PAL.glassShine);
  }
  // Marcos de la puerta.
  rect(ctx, (ox + 3) * TILE - 2, partY, 3, 13, PAL.frame);
  rect(ctx, (ox + 6) * TILE - 1, partY, 3, 13, PAL.frame);

  for (const f of layout.furniture) drawFurniture(ctx, f.kind, f.tx * TILE, f.ty * TILE, f.w * TILE);
}

function drawWallDecor(ctx: Ctx, kind: string, x: number, w: number): void {
  switch (kind) {
    case 'window': {
      const wx = x + 3;
      const ww = w - 6;
      if (ww < 6) return;
      rect(ctx, wx, 9, ww, 18, PAL.frame);
      rect(ctx, wx + 2, 11, ww - 4, 14, PAL.sky);
      rect(ctx, wx + 2, 11, ww - 4, 5, PAL.skyLight);
      rect(ctx, wx + Math.floor(ww / 2) - 1, 11, 2, 14, PAL.frame);
      rect(ctx, wx + 4, 13, 3, 1, '#ffffff');
      break;
    }
    case 'shelf': {
      rect(ctx, x + 2, 8, w - 4, 22, PAL.woodEdge);
      rect(ctx, x + 3, 9, w - 6, 20, PAL.woodFront);
      for (const sy of [9, 19]) {
        let bx = x + 4;
        let i = Math.floor(x / 16);
        while (bx < x + w - 5) {
          const bw = 2 + (i % 2);
          const bh = 7 + (i % 3);
          rect(ctx, bx, sy + 9 - bh, bw, bh, PAL.books[i % PAL.books.length]!);
          bx += bw + 1;
          i++;
        }
        rect(ctx, x + 3, sy + 9, w - 6, 1, PAL.woodEdge);
      }
      break;
    }
    case 'frame': {
      rect(ctx, x + 1, 10, 14, 14, PAL.rugBorder);
      rect(ctx, x + 3, 12, 10, 10, PAL.rug);
      rect(ctx, x + 6, 14, 4, 4, PAL.rugBorder);
      rect(ctx, x + 5, 18, 6, 2, PAL.glassShine);
      break;
    }
    case 'clock': {
      rect(ctx, x + 4, 11, 8, 8, PAL.outline);
      rect(ctx, x + 5, 12, 6, 6, PAL.paper);
      rect(ctx, x + 7, 13, 1, 3, PAL.outline);
      rect(ctx, x + 8, 15, 2, 1, PAL.outline);
      break;
    }
    case 'whiteboard': {
      const bx = x + 3;
      const bw = w - 6;
      rect(ctx, bx, 9, bw, 18, '#9aa3b5');
      rect(ctx, bx + 1, 10, bw - 2, 15, PAL.whiteboard);
      const rnd = seededRandom(x * 7 + w);
      for (let line = 0; line < 4; line++) {
        const lw = Math.max(3, Math.floor((bw - 8) * (0.4 + rnd() * 0.5)));
        rect(ctx, bx + 3, 12 + line * 3, lw, 1, PAL.marker[line % PAL.marker.length]!);
      }
      if (bw > 20) {
        rect(ctx, bx + bw - 10, 13, 6, 6, PAL.marker[0]!);
        rect(ctx, bx + bw - 9, 14, 4, 4, PAL.whiteboard);
      }
      rect(ctx, bx + 2, 25, bw - 4, 2, '#7d8698');
      break;
    }
  }
}

function drawPlant(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x + 3, y + 14, 10, 2, PAL.shadow);
  rect(ctx, x + 4, y + 9, 8, 6, PAL.plantPot);
  rect(ctx, x + 4, y + 9, 8, 1, PAL.plantPotDark);
  rect(ctx, x + 10, y + 10, 2, 5, PAL.plantPotDark);
  rect(ctx, x + 3, y + 1, 10, 8, PAL.leafDark);
  rect(ctx, x + 4, y - 2, 8, 9, PAL.leaf);
  rect(ctx, x + 2, y + 3, 3, 4, PAL.leaf);
  rect(ctx, x + 11, y + 2, 3, 4, PAL.leaf);
  rect(ctx, x + 5, y - 1, 2, 2, PAL.leafLight);
  rect(ctx, x + 9, y + 2, 2, 2, PAL.leafLight);
  rect(ctx, x + 3, y + 4, 1, 1, PAL.leafLight);
}

function drawFurniture(ctx: Ctx, kind: string, x: number, y: number, w: number): void {
  switch (kind) {
    case 'plant':
      drawPlant(ctx, x, y);
      break;
    case 'coffee':
      rect(ctx, x, y - 2, w, 8, PAL.counterTop);
      rect(ctx, x, y + 6, w, 9, PAL.woodFront);
      rect(ctx, x, y + 14, w, 2, PAL.shadow);
      rect(ctx, x + 2, y - 9, 9, 12, PAL.machine);
      rect(ctx, x + 3, y - 8, 7, 3, '#555b70');
      rect(ctx, x + 8, y - 4, 1, 1, PAL.machineLight);
      rect(ctx, x + 5, y + 1, 3, 2, PAL.paper);
      if (w >= 24) {
        rect(ctx, x + 15, y, 4, 4, PAL.paper);
        rect(ctx, x + 20, y + 1, 4, 3, '#e2574c');
        rect(ctx, x + 26, y - 2, 4, 6, '#3b82c4');
      }
      break;
    case 'cooler':
      rect(ctx, x + 4, y + 14, 9, 2, PAL.shadow);
      rect(ctx, x + 4, y + 4, 8, 11, PAL.coolerBase);
      rect(ctx, x + 5, y - 5, 6, 9, PAL.cooler);
      rect(ctx, x + 6, y - 4, 1, 6, '#c9ecfa');
      rect(ctx, x + 5, y + 7, 2, 1, '#3b82c4');
      rect(ctx, x + 9, y + 7, 2, 1, '#e2574c');
      break;
    case 'table':
      rect(ctx, x - 2, y + 12, 20, 3, PAL.shadow);
      rect(ctx, x - 1, y + 2, 18, 10, PAL.woodEdge);
      rect(ctx, x, y + 2, 16, 8, PAL.woodTopLight);
      rect(ctx, x + 4, y + 4, 4, 3, PAL.paper);
      rect(ctx, x + 10, y + 4, 3, 3, '#e2574c');
      // Taburetes
      rect(ctx, x - 9, y + 5, 6, 6, PAL.chairLight);
      rect(ctx, x + 19, y + 5, 6, 6, PAL.chairLight);
      break;
    case 'cabinet':
      rect(ctx, x + 1, y + 14, 14, 2, PAL.shadow);
      rect(ctx, x + 1, y + 1, 14, 14, PAL.woodEdge);
      rect(ctx, x + 2, y + 2, 12, 5, PAL.woodFront);
      rect(ctx, x + 2, y + 8, 12, 6, PAL.woodFront);
      rect(ctx, x + 7, y + 4, 2, 1, PAL.rugBorder);
      rect(ctx, x + 7, y + 10, 2, 1, PAL.rugBorder);
      rect(ctx, x + 3, y - 3, 5, 4, PAL.paper);
      break;
  }
}

// ---------------------------------------------------------------- piezas dinamicas

type MonitorMode = 'off' | 'think' | 'on' | 'alert';

function monitorMode(status: AgentStatus): MonitorMode {
  if (status === 'working' || status === 'delegating') return 'on';
  if (status === 'thinking') return 'think';
  if (status === 'waiting_approval') return 'alert';
  return 'off';
}

function drawMonitor(ctx: Ctx, x: number, y: number, mode: MonitorMode, now: number, seed: number): void {
  rect(ctx, x + 6, y + 18, 10, 2, PAL.monitorFrame);
  rect(ctx, x + 9, y + 15, 4, 3, PAL.monitorFrame);
  rect(ctx, x, y, 22, 15, PAL.monitorFrame);
  const sx = x + 2;
  const sy = y + 2;
  const sw = 18;
  const sh = 11;
  if (mode === 'off') {
    rect(ctx, sx, sy, sw, sh, PAL.screenOff);
    rect(ctx, sx + 1, sy + 1, 3, 1, '#2c3548');
    rect(ctx, x + 19, y + 13, 1, 1, PAL.led);
    return;
  }
  if (mode === 'alert') {
    const on = Math.floor(now / 450) % 2 === 0;
    rect(ctx, sx, sy, sw, sh, on ? PAL.screenAlert : '#3d2a0b');
    rect(ctx, sx + 8, sy + 2, 2, 5, PAL.alert);
    rect(ctx, sx + 8, sy + 8, 2, 2, PAL.alert);
    return;
  }
  rect(ctx, sx, sy, sw, sh, PAL.screenOn);
  if (mode === 'think') {
    rect(ctx, sx + 2, sy + 2, 9, 1, PAL.screenLines[0]!);
    if (Math.floor(now / 500) % 2 === 0) rect(ctx, sx + 2, sy + 5, 2, 3, PAL.screenLines[0]!);
    return;
  }
  // Trabajando: lineas de "codigo" que se desplazan.
  const step = Math.floor(now / 280);
  for (let i = 0; i < 5; i++) {
    const rnd = seededRandom(seed + (step + i) * 7919);
    const indent = Math.floor(rnd() * 3) * 2;
    const len = 3 + Math.floor(rnd() * (sw - 6 - indent));
    const color = PAL.screenLines[Math.floor(rnd() * PAL.screenLines.length) % PAL.screenLines.length]!;
    rect(ctx, sx + 1 + indent, sy + 1 + i * 2, len, 1, color);
  }
}

function drawChair(ctx: Ctx, x: number, y: number, w: number, h: number, base: string, light: string): void {
  rect(ctx, x, y, w, h, PAL.outline);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, base);
  rect(ctx, x + 2, y + 2, w - 4, 2, light);
}

function drawDesk(
  ctx: Ctx,
  x: number,
  top: number,
  w: number,
  topH: number,
  frontH: number,
  accent: string | null,
): void {
  rect(ctx, x + 2, top + topH + frontH, w - 4, 2, PAL.shadow);
  rect(ctx, x, top, w, topH, PAL.woodTop);
  rect(ctx, x, top, w, 1, PAL.woodTopLight);
  rect(ctx, x, top + topH, w, frontH, PAL.woodFront);
  rect(ctx, x, top + topH, w, 1, PAL.woodEdge);
  rect(ctx, x, top + topH + frontH - 1, w, 1, PAL.woodEdge);
  if (accent) rect(ctx, x + 3, top + topH + 2, w - 6, 1, accent);
}

function drawSprite(ctx: Ctx, img: HTMLCanvasElement, x: number, y: number): void {
  ctx.drawImage(img, Math.round(x), Math.round(y));
}

/** Manos tecleando sobre el teclado (por delante del escritorio). */
function drawTypingHands(ctx: Ctx, agent: Agent, kbX: number, kbY: number, now: number): void {
  const app = appearanceFor(agent);
  const beat = Math.floor((now + agentPhase(agent.id)) / 130) % 2;
  const lift = (n: number): number => (beat === n ? 1 : 0);
  // Antebrazos apoyados en la mesa y manos sobre el teclado.
  rect(ctx, kbX, kbY - 5, 4, 5, PAL.outline);
  rect(ctx, kbX + 12, kbY - 5, 4, 5, PAL.outline);
  rect(ctx, kbX + 1, kbY - 5, 2, 5, app.shirtShade);
  rect(ctx, kbX + 13, kbY - 5, 2, 5, app.shirtShade);
  rect(ctx, kbX + 2, kbY - lift(0), 3, 2, app.skin);
  rect(ctx, kbX + 11, kbY - lift(1), 3, 2, app.skin);
}

function drawDeskSlot(ctx: Ctx, view: SceneView, slot: DeskSlot, sprites: SpriteCache): void {
  const agent = view.agentsById.get(slot.agentId);
  if (!agent) return;
  const { status } = view.statusOf(agent.id);
  const now = view.now;
  const x0 = slot.px;
  const y0 = slot.py;
  const color = normalizeHex(agent.color);

  // Tapete con el color del agente.
  rect(ctx, x0 + 12, y0 + 2, 88, 58, withAlpha(color, 0.13));
  rect(ctx, x0 + 12, y0 + 59, 88, 1, withAlpha(color, 0.35));

  drawChair(ctx, x0 + 47, y0 + 8, 18, 15, PAL.chair, PAL.chairLight);

  const bob = status === 'idle' || status === 'thinking' ? breathOffset(agent.id, now) : 0;
  const img = sprites.character(agent, 'down', 0, isBlinking(agent.id, now));
  drawSprite(ctx, img, x0 + SEATED_CHAR.x, y0 + SEATED_CHAR.y + bob);

  drawDesk(ctx, x0 + DESK.x, y0 + DESK.top, DESK.w, DESK.topH, DESK.frontH, color);
  drawMonitor(ctx, x0 + MONITOR.x, y0 + MONITOR.y, monitorMode(status), now, hashString(agent.id));
  // Teclado, taza y papeles.
  const kbX = x0 + 48;
  const kbY = y0 + 27;
  rect(ctx, kbX, kbY, 16, 4, PAL.keyboardDark);
  rect(ctx, kbX, kbY, 16, 3, PAL.keyboard);
  for (let k = 0; k < 7; k++) rect(ctx, kbX + 1 + k * 2, kbY + 1, 1, 1, PAL.keyboardDark);
  rect(ctx, x0 + 72, y0 + 24, 6, 7, PAL.outline);
  rect(ctx, x0 + 73, y0 + 25, 4, 5, color);
  rect(ctx, x0 + 77, y0 + 26, 2, 2, PAL.outline);
  rect(ctx, x0 + 82, y0 + 24, 9, 7, PAL.paperLine);
  rect(ctx, x0 + 82, y0 + 23, 9, 7, PAL.paper);
  rect(ctx, x0 + 84, y0 + 25, 5, 1, PAL.paperLine);
  rect(ctx, x0 + 84, y0 + 27, 4, 1, PAL.paperLine);

  if (status === 'working' || status === 'delegating') drawTypingHands(ctx, agent, kbX, kbY, now);
}

function ceoIsAway(view: SceneView): boolean {
  return view.runtime.walker.mode !== 'seated';
}

function drawCeoOffice(ctx: Ctx, view: SceneView, sprites: SpriteCache): void {
  const ceo = view.ceo;
  const layout = view.layout;
  const d = ceoDesk(layout);
  const sx = ceoSeatX(layout);
  const status = ceo ? view.statusOf(ceo.id).status : 'idle';

  drawChair(ctx, sx - 11, 31, 22, 19, PAL.ceoChair, PAL.ceoChairLight);
  if (ceo && !ceoIsAway(view)) {
    const standing = status === 'delegating';
    const bob = standing ? 0 : breathOffset(ceo.id, view.now);
    const img = sprites.character(ceo, 'down', 0, isBlinking(ceo.id, view.now));
    drawSprite(ctx, img, sx - 8, (standing ? CEO_STANDING_Y : CEO_SEATED_Y) + bob);
  }
  drawDesk(ctx, d.x, d.top, d.w, d.topH, d.frontH, ceo ? normalizeHex(ceo.color) : null);
  drawMonitor(ctx, d.x + 6, d.top - 16, monitorMode(ceo && !ceoIsAway(view) ? status : 'idle'), view.now, 99);
  // Bandeja de documentos y lampara.
  rect(ctx, d.x + d.w - 26, d.top + 2, 12, 7, PAL.woodEdge);
  rect(ctx, d.x + d.w - 25, d.top + 1, 10, 5, PAL.paper);
  rect(ctx, d.x + d.w - 24, d.top + 3, 6, 1, PAL.paperLine);
  rect(ctx, d.x + d.w - 10, d.top - 9, 2, 13, PAL.monitorFrame);
  rect(ctx, d.x + d.w - 13, d.top - 12, 8, 4, PAL.rugBorder);
  rect(ctx, d.x + d.w - 12, d.top + 3, 6, 2, PAL.monitorFrame);
  if (ceo && !ceoIsAway(view) && status === 'working') drawTypingHands(ctx, ceo, sx - 8, d.top + 6, view.now);
}

function drawWalker(ctx: Ctx, view: SceneView, sprites: SpriteCache): void {
  const ceo = view.ceo;
  const w = view.runtime.walker;
  if (!ceo || w.mode === 'seated') return;
  const r = walkerSpriteRect(w);
  rect(ctx, r.x + 3, r.y + 22, 10, 2, PAL.shadow);
  const blink = isBlinking(ceo.id, view.now);
  drawSprite(ctx, sprites.character(ceo, w.facing, walkFrame(w), blink), r.x, r.y);

  const doc = sprites.icon(DOC_ICON);
  const p = view.runtime.handoffProgress();
  if (p === null) {
    // Lleva el documento en la mano mientras va hacia el escritorio.
    if (w.targetAgentId && w.mode === 'walking') {
      const hx = w.facing === 'left' ? r.x - 3 : w.facing === 'up' ? r.x + 9 : r.x + 11;
      drawSprite(ctx, doc, hx, r.y + 12);
    }
    return;
  }
  const slot = view.layout.slots.find((s) => s.agentId === w.targetAgentId);
  if (!slot) return;
  const target = slotHead(slot);
  const fromX = r.x + 4;
  const fromY = r.y + 8;
  const toX = target.x - 3;
  const toY = target.y + 16;
  const t = Math.min(1, Math.max(0, p));
  const arc = Math.sin(t * Math.PI) * 8;
  drawSprite(ctx, doc, fromX + (toX - fromX) * t, fromY + (toY - fromY) * t - arc);
}

function headOf(view: SceneView, agentId: string): Point | null {
  const layout = view.layout;
  if (view.ceo && agentId === view.ceo.id) {
    const w = view.runtime.walker;
    if (w.mode !== 'seated') {
      const r = walkerSpriteRect(w);
      return { x: r.x + 8, y: r.y };
    }
    const standing = view.statusOf(agentId).status === 'delegating';
    return { x: ceoSeatX(layout), y: standing ? CEO_STANDING_Y : CEO_SEATED_Y };
  }
  const slot = layout.slots.find((s) => s.agentId === agentId);
  return slot ? slotHead(slot) : null;
}

function drawOverheadIcons(ctx: Ctx, view: SceneView, sprites: SpriteCache): void {
  const ids: string[] = view.layout.slots.map((s) => s.agentId);
  if (view.ceo) ids.push(view.ceo.id);
  for (const id of ids) {
    if (!view.agentsById.has(id)) continue;
    const head = headOf(view, id);
    if (!head) continue;
    const { status } = view.statusOf(id);
    if (status === 'thinking') {
      drawSprite(ctx, sprites.icon(THOUGHT_ICON), head.x + 1, head.y - 13);
      const phase = Math.floor((view.now + agentPhase(id)) / 350) % 4;
      for (let i = 0; i < 3; i++) {
        if (i < phase) rect(ctx, head.x + 4 + i * 3, head.y - 10, 2, 2, PAL.outline);
      }
    } else if (status === 'waiting_approval') {
      if (Math.floor(view.now / 420) % 2 === 0) {
        const bounce = Math.floor(view.now / 210) % 2;
        drawSprite(ctx, sprites.icon(ALERT_ICON), head.x - 5, head.y - 13 - bounce);
      }
    }
  }
}

/** Marco de esquinas: seleccion (amarillo, parpadea) o foco de teclado (blanco, fijo). */
function drawSelection(ctx: Ctx, view: SceneView, id: string | null = view.selectedId, focus = false): void {
  if (!id) return;
  let r: Rect | null = null;
  if (view.ceo && id === view.ceo.id) {
    const w = view.runtime.walker;
    r = w.mode !== 'seated' ? grow(walkerSpriteRect(w), 3) : ceoSelectRect(view.layout);
  } else {
    const slot = view.layout.slots.find((s) => s.agentId === id);
    if (slot) r = slotSelectRect(slot);
  }
  if (!r) return;
  // Marco de esquinas parpadeante suave.
  if (focus) r = grow(r, 2);
  const on = Math.floor(view.now / 500) % 2 === 0;
  const c = focus ? PAL.chipText : on ? PAL.select : shade(PAL.select, -0.25);
  const L = 6;
  const corners: Array<[number, number, number, number]> = [
    [r.x, r.y, 1, 1],
    [r.x + r.w, r.y, -1, 1],
    [r.x, r.y + r.h, 1, -1],
    [r.x + r.w, r.y + r.h, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    const bx = dx > 0 ? cx : cx - L;
    const by = dy > 0 ? cy : cy - 2;
    rect(ctx, bx, by, L, 2, c);
    const vx = dx > 0 ? cx : cx - 2;
    const vy = dy > 0 ? cy : cy - L;
    rect(ctx, vx, vy, 2, L, c);
  }
}

function grow(r: Rect, n: number): Rect {
  return { x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n };
}

/** Pinta la capa de pixeles completa en un contexto de resolucion logica. */
export function drawPixelLayer(ctx: Ctx, view: SceneView, background: HTMLCanvasElement, sprites: SpriteCache): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, view.layout.width, view.layout.height);
  ctx.drawImage(background, 0, 0);

  drawCeoOffice(ctx, view, sprites);

  const w = view.runtime.walker;
  const walkerFeet = w.mode === 'seated' ? -1 : w.y + 7;
  let walkerDrawn = false;
  // Orden por profundidad: el CEO que camina se dibuja tras los escritorios que quedan por encima.
  for (const slot of view.layout.slots) {
    const deskBottom = slot.py + DESK.top + DESK.topH + DESK.frontH;
    if (!walkerDrawn && walkerFeet >= 0 && walkerFeet < deskBottom) {
      drawWalker(ctx, view, sprites);
      walkerDrawn = true;
    }
    drawDeskSlot(ctx, view, slot, sprites);
  }
  if (!walkerDrawn) drawWalker(ctx, view, sprites);

  drawOverheadIcons(ctx, view, sprites);
  drawSelection(ctx, view);
  if (view.focusedId) drawSelection(ctx, view, view.focusedId, true);
}

// ---------------------------------------------------------------- capa de texto

function font(px: number, bold = false): string {
  return `${bold ? '700 ' : ''}${Math.round(px)}px ${FONT_STACK}`;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

interface ChipStyle {
  /** Tamano de fuente en px de dispositivo. */
  size: number;
  /** Tamano minimo al que se puede reducir antes de acortar el texto. */
  minSize: number;
  bold: boolean;
  bg: string;
  fg: string;
  padX: number;
  height: number;
  radius: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Dibuja un rotulo centrado y devuelve su rectangulo en pantalla. Si no cabe, primero usa una
 * forma mas corta del texto ("Mateo R.", "Agente 3"), luego reduce la fuente y solo al final
 * recorta con elipsis. Si tapa al CEO que camina (avoid), se vuelve casi transparente.
 */
function drawChip(ctx: Ctx, text: string, cx: number, cy: number, maxW: number, s: ChipStyle, avoid: Rect | null = null): Rect {
  let size = s.size;
  let label = text;
  for (;;) {
    ctx.font = font(size, s.bold);
    const pad = Math.round((s.padX * size) / s.size);
    const fit = fitLabel(text, Math.max(10, maxW - 2 * pad), (t) => ctx.measureText(t).width);
    label = fit.label;
    if (!fit.truncated || size <= s.minSize) break;
    size = Math.max(s.minSize, size - Math.max(1, Math.round(s.size * 0.1)));
  }
  const scale = size / s.size;
  const padX = Math.round(s.padX * scale);
  const h = Math.round(s.height * scale);
  const w = Math.ceil(ctx.measureText(label).width) + 2 * padX;
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);
  const prevAlpha = ctx.globalAlpha;
  if (avoid && overlaps(avoid, { x, y, w, h })) ctx.globalAlpha = 0.25;
  ctx.fillStyle = s.bg;
  roundRect(ctx, x, y, w, h, Math.round(s.radius * scale));
  ctx.fill();
  ctx.fillStyle = s.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.globalAlpha = prevAlpha;
  return { x, y, w, h };
}

/** Tamano de fuente en px de dispositivo: proporcional a la escena, con minimo legible. */
function fontPx(t: ScreenTransform, logical: number, minCss: number, maxCss: number): number {
  return Math.round(Math.min(Math.max(logical * t.scale, minCss * t.dpr), maxCss * t.dpr));
}

export function drawTextLayer(ctx: Ctx, view: SceneView, t: ScreenTransform): void {
  const toScreen = (p: Point): Point => ({ x: t.offsetX + p.x * t.scale, y: t.offsetY + p.y * t.scale });
  const layout = view.layout;
  const plaqueSize = fontPx(t, 5.5, 9, 12);
  const nameSize = fontPx(t, 6, 10, 14);
  const plaque: ChipStyle = {
    size: plaqueSize,
    minSize: Math.round(7 * t.dpr),
    bold: true,
    bg: PAL.plaqueBg,
    fg: PAL.plaqueText,
    padX: Math.round(plaqueSize * 0.45),
    height: Math.round(plaqueSize * 1.35),
    radius: Math.round(t.dpr * 2),
  };
  const name: ChipStyle = {
    size: nameSize,
    minSize: Math.round(8 * t.dpr),
    bold: false,
    bg: PAL.chipBg,
    fg: PAL.chipText,
    padX: Math.round(nameSize * 0.5),
    height: Math.round(nameSize * 1.5),
    radius: Math.round(nameSize * 0.75),
  };
  const selected: ChipStyle = { ...name, bg: PAL.select, fg: PAL.outline, bold: true };
  const focused: ChipStyle = { ...name, bg: PAL.chipText, fg: PAL.chipBg, bold: true };
  const nameStyle = (id: string) => (id === view.selectedId ? selected : id === view.focusedId ? focused : name);
  /** Rotulos ya dibujados: los globos intentan no taparlos. */
  const labels: Rect[] = [];
  const walker = view.runtime.walker;
  let avoid: Rect | null = null;
  if (view.ceo && walker.mode !== 'seated') {
    const r = walkerSpriteRect(walker);
    const p = toScreen(r);
    avoid = { x: p.x, y: p.y, w: r.w * t.scale, h: r.h * t.scale };
  }

  for (const slot of layout.slots) {
    const agent = view.agentsById.get(slot.agentId);
    if (!agent) continue;
    const p = toScreen(slotPlaque(slot));
    // El rotulo del area no debe salirse de la placa del escritorio.
    labels.push(drawChip(ctx, agent.area.toUpperCase(), p.x, p.y, (DESK.w - 2) * t.scale, plaque, avoid));
    const n = toScreen(slotName(slot));
    labels.push(drawChip(ctx, agent.name, n.x, n.y, (CELL_W * TILE - 2) * t.scale, nameStyle(agent.id), avoid));
  }

  if (view.ceo) {
    const d = ceoDesk(layout);
    const p = toScreen(ceoPlaque(layout));
    labels.push(drawChip(ctx, view.ceo.area.toUpperCase(), p.x, p.y, d.w * t.scale - 4 * t.dpr, plaque));
    const n = toScreen(ceoName(layout));
    labels.push(drawChip(ctx, view.ceo.name, n.x, n.y, (OFFICE_W - 2) * TILE * t.scale, nameStyle(view.ceo.id)));
  }

  if (layout.slots.length === 0) {
    const p = toScreen({ x: layout.width / 2, y: (layout.height + 10 * TILE) / 2 });
    drawChip(ctx, 'Sin agentes de área habilitados', p.x, p.y, layout.width * t.scale, name);
  }

  drawBubbles(ctx, view, t, toScreen, avoid ? [...labels, avoid] : labels);
}

/**
 * Globos de dialogo sin solaparse. Se colocan del mas reciente al mas antiguo; cada uno prueba
 * varias posiciones (sobre la cabeza, desplazado a los lados, apilado mas arriba, debajo) y se
 * queda con la primera que no pisa otro globo ni un rotulo (nombres y areas). Si no hay sitio,
 * se acepta tapar rotulos pero nunca otro globo; si tampoco, el globo no se muestra (el icono
 * de estado del agente sigue visible). En pantallas angostas los globos son mas pequenos y hay
 * un tope de globos visibles.
 */
function drawBubbles(
  ctx: Ctx,
  view: SceneView,
  t: ScreenTransform,
  toScreen: (p: Point) => Point,
  obstacles: Rect[],
): void {
  const cssW = t.canvasW / t.dpr;
  const narrow = cssW < 600;
  const size = narrow ? fontPx(t, 5, 10, 12) : fontPx(t, 5.5, 11, 14);
  ctx.font = font(size);
  const lineH = Math.round(size * 1.3);
  const pad = Math.round(size * (narrow ? 0.45 : 0.6));
  const margin = Math.round(4 * t.dpr);
  const tail = Math.round((narrow ? 4 : 6) * t.dpr);
  const maxLines = narrow ? 2 : 3;
  const maxVisible = narrow ? 2 : cssW < 1000 ? 3 : 5;
  // Como maximo el ancho de ~1,5 escritorios (y nunca mas de 200 px css).
  const maxTextW = Math.max(
    40 * t.dpr,
    Math.min(200 * t.dpr, CELL_W * TILE * t.scale * 1.5 - 2 * pad, t.canvasW - 2 * margin - 2 * pad),
  );
  const measure = (str: string): number => ctx.measureText(str).width;
  const placed: Rect[] = [];

  const newestFirst = [...view.runtime.bubbles].sort((a, b) => b[1].until - a[1].until);
  for (const [agentId, bubble] of newestFirst) {
    if (placed.length >= maxVisible) break;
    if (!view.agentsById.has(agentId)) continue;
    const headLogical = headOf(view, agentId);
    if (!headLogical) continue;
    const head = toScreen(headLogical);
    const lines = wrapText(bubble.text, maxTextW, maxLines, measure);
    if (lines.length === 0) continue;
    const textW = Math.max(...lines.map(measure));
    const w = Math.ceil(textW) + 2 * pad;
    const h = lines.length * lineH + 2 * pad - Math.round(size * 0.3);
    const gap = 3 * t.scale;

    const clampX = (x: number) => Math.min(Math.max(margin, x), t.canvasW - margin - w);
    const fits = (y: number) => y >= margin && y + h <= t.canvasH - margin;
    const aboveY = head.y - gap - tail - h;
    const belowY = head.y + 26 * t.scale + tail;
    const xs = [clampX(head.x - w / 2), clampX(head.x - w + 12 * t.dpr), clampX(head.x - 12 * t.dpr)];
    const candidates: Array<{ x: number; y: number; above: boolean }> = [];
    for (const y of [aboveY, aboveY - (h + tail + 4), belowY]) {
      if (!fits(y)) continue;
      for (const x of xs) candidates.push({ x, y, above: y < head.y });
    }
    // Rectangulo ocupado por el globo y su cola (la cola va abajo si el globo esta encima).
    const box = (c: { x: number; y: number; above: boolean }): Rect =>
      c.above ? { x: c.x, y: c.y, w, h: h + tail } : { x: c.x, y: c.y - tail, w, h: h + tail };
    const free = (c: { x: number; y: number; above: boolean }, avoidLabels: boolean) => {
      const r = box(c);
      return !placed.some((p) => overlaps(p, r)) && (!avoidLabels || !obstacles.some((o) => overlaps(o, r)));
    };
    const spot = candidates.find((c) => free(c, true)) ?? candidates.find((c) => free(c, false));
    if (!spot) continue;
    const { x, y, above } = spot;
    placed.push(box(spot));

    // Fade de salida en los ultimos 400 ms.
    const remaining = bubble.until - view.now;
    ctx.globalAlpha = Math.max(0, Math.min(1, remaining / 400));

    ctx.fillStyle = PAL.bubble;
    ctx.strokeStyle = PAL.bubbleBorder;
    ctx.lineWidth = Math.max(1, Math.round(1.5 * t.dpr));
    roundRect(ctx, Math.round(x), Math.round(y), w, h, Math.round(5 * t.dpr));
    ctx.fill();
    ctx.stroke();

    const tx = Math.min(Math.max(x + 8 * t.dpr, head.x), x + w - 8 * t.dpr);
    ctx.beginPath();
    if (above) {
      ctx.moveTo(tx - tail * 0.7, y + h - 1);
      ctx.lineTo(tx, y + h + tail);
      ctx.lineTo(tx + tail * 0.7, y + h - 1);
    } else {
      ctx.moveTo(tx - tail * 0.7, y + 1);
      ctx.lineTo(tx, y - tail);
      ctx.lineTo(tx + tail * 0.7, y + 1);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Tapa el trazo del borde en la base de la cola.
    ctx.fillRect(tx - tail * 0.7 + ctx.lineWidth, above ? y + h - ctx.lineWidth - 1 : y + 1, tail * 1.4 - 2 * ctx.lineWidth, ctx.lineWidth + 1);

    ctx.fillStyle = PAL.bubbleText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, Math.round(x + pad), Math.round(y + pad + i * lineH)));
    ctx.globalAlpha = 1;
  }
}
