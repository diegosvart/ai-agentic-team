/** A* en 4 direcciones sobre la rejilla de baldosas. Puro, sin DOM. */
import type { TilePoint } from './layout';

export interface Grid {
  width: number;
  height: number;
  isWalkable(x: number, y: number): boolean;
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Penalizacion pequena por girar: produce caminos en L en vez de escaleras. */
const TURN_COST = 0.01;

/**
 * Devuelve el camino de start a goal (ambos incluidos) o null si no hay.
 * El origen se acepta aunque no sea transitable (p. ej. la silla del CEO).
 */
export function findPath(grid: Grid, start: TilePoint, goal: TilePoint): TilePoint[] | null {
  const { width, height } = grid;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height;
  if (!inside(start.x, start.y) || !inside(goal.x, goal.y)) return null;
  if (!grid.isWalkable(goal.x, goal.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [{ ...start }];

  const size = width * height;
  const g = new Float64Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);
  const dirOf = new Int8Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const open: number[] = [];

  const idx = (x: number, y: number): number => y * width + x;
  const h = (i: number): number => Math.abs((i % width) - goal.x) + Math.abs(Math.floor(i / width) - goal.y);

  const s = idx(start.x, start.y);
  const goalIdx = idx(goal.x, goal.y);
  g[s] = 0;
  open.push(s);

  while (open.length > 0) {
    // La rejilla es pequena (< 2000 baldosas): una busqueda lineal del minimo basta.
    let bestPos = 0;
    let bestF = Infinity;
    for (let k = 0; k < open.length; k++) {
      const i = open[k]!;
      const f = g[i]! + h(i);
      if (f < bestF) {
        bestF = f;
        bestPos = k;
      }
    }
    const current = open[bestPos]!;
    open[bestPos] = open[open.length - 1]!;
    open.pop();
    if (current === goalIdx) break;
    if (closed[current]) continue;
    closed[current] = 1;

    const cx = current % width;
    const cy = Math.floor(current / width);
    for (let d = 0; d < DIRS.length; d++) {
      const [dx, dy] = DIRS[d]!;
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inside(nx, ny) || !grid.isWalkable(nx, ny)) continue;
      const n = idx(nx, ny);
      if (closed[n]) continue;
      const prevDir = dirOf[current]!;
      const cost = g[current]! + 1 + (prevDir !== -1 && prevDir !== d ? TURN_COST : 0);
      if (cost < g[n]!) {
        g[n] = cost;
        cameFrom[n] = current;
        dirOf[n] = d;
        open.push(n);
      }
    }
  }

  if (cameFrom[goalIdx] === -1) return null;
  const path: TilePoint[] = [];
  let cur = goalIdx;
  while (cur !== -1) {
    path.push({ x: cur % width, y: Math.floor(cur / width) });
    if (cur === s) break;
    cur = cameFrom[cur]!;
  }
  path.reverse();
  return path;
}

/** Elimina los puntos intermedios de los tramos rectos (solo quedan esquinas). */
export function simplifyPath(path: TilePoint[]): TilePoint[] {
  if (path.length <= 2) return path.slice();
  const out: TilePoint[] = [path[0]!];
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const c = path[i + 1]!;
    const sameDir = b.x - a.x === c.x - b.x && b.y - a.y === c.y - b.y;
    if (!sameDir) out.push(b);
  }
  out.push(path[path.length - 1]!);
  return out;
}
