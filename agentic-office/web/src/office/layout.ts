/**
 * Distribucion de la oficina en una rejilla de baldosas. Funciones puras, sin DOM.
 *
 * Filas (en baldosas):
 *   0-1   pared superior (cara visible)
 *   2-6   despacho del CEO (centro) y zona comun (lados)
 *   7     tabique de cristal del despacho, con puerta
 *   8-9   pasillo
 *   10..  rejilla de escritorios (CELL_H filas por fila de escritorios)
 *   ultima pared inferior
 */

export const TILE = 16;
/** Celda de un escritorio: columnas 0 y 6 son pasillo; filas 0-2 escritorio, 3-4 pasillo. */
export const CELL_W = 7;
export const CELL_H = 5;
export const OFFICE_W = 9;
export const OFFICE_TOP = 2;
export const OFFICE_PARTITION = 7;
export const GRID_TOP = 10;
const MIN_INNER = 14;
export const MAX_COLS = 6;

export interface TilePoint {
  x: number;
  y: number;
}

export interface DeskSlot {
  agentId: string;
  index: number;
  /** Origen de la celda, en baldosas. */
  tx: number;
  ty: number;
  /** Origen de la celda, en pixeles logicos. */
  px: number;
  py: number;
  /** Baldosa donde se para quien entrega algo en este escritorio (frente al escritorio). */
  stand: TilePoint;
}

export interface CeoOffice {
  /** Columna del tabique izquierdo; el despacho ocupa ox..ox+8. */
  ox: number;
  /** Baldosa de la silla del CEO (inicio y fin de sus recorridos). */
  seat: TilePoint;
}

export type FurnitureKind = 'coffee' | 'plant' | 'cooler' | 'table' | 'cabinet';

export interface Furniture {
  kind: FurnitureKind;
  tx: number;
  ty: number;
  w: number;
  h: number;
}

export type WallDecorKind = 'window' | 'shelf' | 'frame' | 'whiteboard' | 'clock';

export interface WallDecor {
  kind: WallDecorKind;
  tx: number;
  w: number;
}

export interface SceneLayout {
  cols: number;
  rows: number;
  widthTiles: number;
  heightTiles: number;
  /** Tamano en pixeles logicos. */
  width: number;
  height: number;
  slots: DeskSlot[];
  office: CeoOffice;
  furniture: Furniture[];
  decor: WallDecor[];
  /** Mapa de baldosas transitables, fila por fila (width * height). */
  walkable: boolean[];
}

export function gridRows(count: number, cols: number): number {
  return Math.max(1, Math.ceil(count / Math.max(1, cols)));
}

export function sceneSizeTiles(count: number, cols: number): { w: number; h: number } {
  const c = Math.max(1, cols);
  const inner = Math.max(c * CELL_W, MIN_INNER);
  return { w: inner + 2, h: GRID_TOP + gridRows(count, c) * CELL_H + 1 };
}

/**
 * Elige cuantas columnas de escritorios usar para aprovechar mejor el area disponible.
 * Puntua con la escala entera resultante (como se dibujara) y desempata con la escala real.
 */
export function chooseColumns(count: number, viewportW: number, viewportH: number): number {
  if (count <= 1 || viewportW <= 0 || viewportH <= 0) return 1;
  let best = 1;
  let bestScore = -1;
  let bestFit = -1;
  for (let c = 1; c <= Math.min(count, MAX_COLS); c++) {
    const { w, h } = sceneSizeTiles(count, c);
    const fit = Math.min(viewportW / (w * TILE), viewportH / (h * TILE));
    const score = effectiveScale(fit);
    if (score > bestScore + 1e-9 || (Math.abs(score - bestScore) < 1e-9 && fit > bestFit)) {
      best = c;
      bestScore = score;
      bestFit = fit;
    }
  }
  return best;
}

/**
 * Escala de dibujo: entera a partir de x2 (pixel-art nitido). Por debajo se usa la escala real
 * para no desperdiciar media pantalla en moviles; el dibujo sigue siendo por vecino mas cercano.
 */
export function effectiveScale(fit: number): number {
  if (fit >= 2) return Math.floor(fit);
  return Math.max(0.25, fit);
}

export function computeLayout(areaAgentIds: string[], requestedCols: number): SceneLayout {
  const count = areaAgentIds.length;
  const cols = Math.max(1, Math.min(requestedCols, Math.max(1, count)));
  const rows = gridRows(count, cols);
  const { w: W, h: H } = sceneSizeTiles(count, cols);
  const inner = W - 2;

  const walkable: boolean[] = new Array<boolean>(W * H).fill(true);
  const block = (x: number, y: number, w = 1, h = 1): void => {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (xx >= 0 && xx < W && yy >= 0 && yy < H) walkable[yy * W + xx] = false;
      }
    }
  };

  // Paredes exteriores.
  block(0, 0, W, 2);
  block(0, 0, 1, H);
  block(W - 1, 0, 1, H);
  block(0, H - 1, W, 1);

  // Despacho del CEO, centrado.
  const ox = 1 + Math.floor((inner - OFFICE_W) / 2);
  block(ox, OFFICE_TOP, 1, OFFICE_PARTITION - OFFICE_TOP + 1);
  block(ox + OFFICE_W - 1, OFFICE_TOP, 1, OFFICE_PARTITION - OFFICE_TOP + 1);
  for (let x = ox; x < ox + OFFICE_W; x++) {
    const isDoor = x >= ox + 3 && x <= ox + 5;
    if (!isDoor) block(x, OFFICE_PARTITION);
  }
  // Escritorio del CEO (filas 3-4).
  block(ox + 2, 3, 5, 2);

  const furniture: Furniture[] = [];
  const addFurniture = (f: Furniture): void => {
    furniture.push(f);
    block(f.tx, f.ty, f.w, f.h);
  };
  // Dentro del despacho.
  addFurniture({ kind: 'plant', tx: ox + 1, ty: 6, w: 1, h: 1 });
  addFurniture({ kind: 'cabinet', tx: ox + 7, ty: 6, w: 1, h: 1 });

  // Zona comun izquierda (columnas 1..ox-1) y derecha (ox+9..W-2).
  const leftW = ox - 1;
  const rightX = ox + OFFICE_W;
  const rightW = W - 1 - rightX;
  addFurniture({ kind: 'coffee', tx: 1, ty: 2, w: Math.min(2, leftW), h: 1 });
  if (leftW >= 3) addFurniture({ kind: 'cooler', tx: ox - 1, ty: 2, w: 1, h: 1 });
  addFurniture({ kind: 'plant', tx: 1, ty: OFFICE_PARTITION, w: 1, h: 1 });
  if (rightW >= 1) addFurniture({ kind: 'plant', tx: W - 2, ty: 2, w: 1, h: 1 });
  if (rightW >= 2) addFurniture({ kind: 'table', tx: rightX + Math.floor((rightW - 1) / 2), ty: 5, w: 1, h: 1 });
  if (rightW >= 1) addFurniture({ kind: 'plant', tx: W - 2, ty: OFFICE_PARTITION, w: 1, h: 1 });

  const decor: WallDecor[] = [];
  // Ventanas de 2-3 baldosas repartidas en el tramo izquierdo.
  for (let x = 1; x <= leftW; ) {
    const remaining = leftW - x + 1;
    const w = remaining <= 3 ? remaining : remaining === 4 ? 2 : 3;
    decor.push({ kind: 'window', tx: x, w });
    x += w;
  }
  decor.push({ kind: 'shelf', tx: ox + 1, w: 2 });
  decor.push({ kind: 'frame', tx: ox + 4, w: 1 });
  decor.push({ kind: 'clock', tx: ox + 6, w: 1 });
  decor.push({ kind: 'window', tx: ox + 7, w: 1 });
  if (rightW >= 2) decor.push({ kind: 'whiteboard', tx: rightX, w: rightW });
  else if (rightW === 1) decor.push({ kind: 'window', tx: rightX, w: 1 });

  // Rejilla de escritorios: filas completas alineadas, la ultima fila centrada.
  const slots: DeskSlot[] = [];
  const gridX0 = 1 + Math.floor((inner - cols * CELL_W) / 2);
  areaAgentIds.forEach((agentId, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const inRow = Math.min(cols, count - row * cols);
    const rowOffset = Math.floor(((cols - inRow) * CELL_W) / 2);
    const tx = gridX0 + rowOffset + col * CELL_W;
    const ty = GRID_TOP + row * CELL_H;
    block(tx + 1, ty, 5, 3);
    slots.push({ agentId, index, tx, ty, px: tx * TILE, py: ty * TILE, stand: { x: tx + 3, y: ty + 3 } });
  });

  return {
    cols,
    rows,
    widthTiles: W,
    heightTiles: H,
    width: W * TILE,
    height: H * TILE,
    slots,
    office: { ox, seat: { x: ox + 4, y: OFFICE_TOP } },
    furniture,
    decor,
    walkable,
  };
}

export function isWalkable(layout: SceneLayout, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= layout.widthTiles || y >= layout.heightTiles) return false;
  return layout.walkable[y * layout.widthTiles + x] === true;
}

export function tileCenter(p: TilePoint): { x: number; y: number } {
  return { x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 };
}
