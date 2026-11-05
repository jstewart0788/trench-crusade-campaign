// The cell model: a square board of boardIn inches cut into cellIn-inch cells,
// column c along board x (west to east) and row r along board y (south to
// north), both from 0. Board coordinates are the scenario coordinates in
// data/rules/scenarios.json (inches, origin bottom-left).

export type Dir = "N" | "E" | "S" | "W";
export const DIRS: readonly Dir[] = ["N", "E", "S", "W"];
export const DELTA: Record<Dir, readonly [number, number]> = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };
export const OPPOSITE: Record<Dir, Dir> = { N: "S", E: "W", S: "N", W: "E" };

/** Rotates a side by quarter turns clockwise viewed from above (N → E → S → W). */
export function rotateDir(dir: Dir, quarterTurnsCw: number): Dir {
  const k = ((quarterTurnsCw % 4) + 4) % 4;
  return DIRS[(DIRS.indexOf(dir) + k) % 4]!;
}

export const isLateral = (dir: Dir, forward: Dir): boolean => dir !== forward && dir !== OPPOSITE[forward];

export interface Cell {
  c: number;
  r: number;
}

export const cellKey = (c: number, r: number): string => `${c},${r}`;

export interface Grid {
  boardIn: number;
  cellIn: number;
  cols: number;
  rows: number;
}

export function createGrid(boardIn = 36, cellIn = 4): Grid {
  const n = boardIn / cellIn;
  if (!Number.isInteger(n) || n < 2) throw new Error(`Board ${boardIn}in is not a whole number of ${cellIn}in cells`);
  return { boardIn, cellIn, cols: n, rows: n };
}

export const inGrid = (g: Grid, c: number, r: number): boolean => c >= 0 && r >= 0 && c < g.cols && r < g.rows;

export const isEdgeCell = (g: Grid, c: number, r: number): boolean => c === 0 || r === 0 || c === g.cols - 1 || r === g.rows - 1;

/** The board edge a cell lies on in the given direction, or null when the cell is interior on that side. */
export const edgeInDir = (g: Grid, c: number, r: number, dir: Dir): boolean =>
  (dir === "W" && c === 0) || (dir === "E" && c === g.cols - 1) || (dir === "S" && r === 0) || (dir === "N" && r === g.rows - 1);

export function cellCentre(g: Grid, c: number, r: number): [number, number] {
  return [c * g.cellIn + g.cellIn / 2, r * g.cellIn + g.cellIn / 2];
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function cellRect(g: Grid, c: number, r: number): Rect {
  return { x0: c * g.cellIn, y0: r * g.cellIn, x1: (c + 1) * g.cellIn, y1: (r + 1) * g.cellIn };
}

/** The cell containing a board point; points on the far edge fall into the last cell. */
export function cellAt(g: Grid, x: number, y: number): Cell | null {
  if (x < 0 || y < 0 || x > g.boardIn || y > g.boardIn) return null;
  return { c: Math.min(g.cols - 1, Math.floor(x / g.cellIn)), r: Math.min(g.rows - 1, Math.floor(y / g.cellIn)) };
}

export function neighbours(g: Grid, c: number, r: number): { dir: Dir; c: number; r: number }[] {
  const out: { dir: Dir; c: number; r: number }[] = [];
  for (const dir of DIRS) {
    const [dc, dr] = DELTA[dir];
    if (inGrid(g, c + dc, r + dr)) out.push({ dir, c: c + dc, r: r + dr });
  }
  return out;
}

export function rectFromCentre(cx: number, cy: number, w: number, d: number): Rect {
  return { x0: cx - w / 2, y0: cy - d / 2, x1: cx + w / 2, y1: cy + d / 2 };
}

export function expandRect(r: Rect, m: number): Rect {
  return { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m };
}

export const rectContains = (r: Rect, x: number, y: number): boolean => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

export const rectInside = (inner: Rect, outer: Rect): boolean => inner.x0 >= outer.x0 && inner.y0 >= outer.y0 && inner.x1 <= outer.x1 && inner.y1 <= outer.y1;

/** Positive-area overlap; touching edges do not count. */
export const rectsOverlap = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Shortest distance between two axis-aligned rectangles; 0 when they touch or overlap. */
export function rectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1);
  const dy = Math.max(0, b.y0 - a.y1, a.y0 - b.y1);
  return Math.hypot(dx, dy);
}

export function rectPointDistance(r: Rect, x: number, y: number): number {
  const dx = Math.max(0, r.x0 - x, x - r.x1);
  const dy = Math.max(0, r.y0 - y, y - r.y1);
  return Math.hypot(dx, dy);
}

/** Cells whose rectangle intersects (or merely touches, when `touching`) the rectangle. */
export function cellsInRect(g: Grid, r: Rect, touching = false): Cell[] {
  const out: Cell[] = [];
  for (let c = 0; c < g.cols; c++) {
    for (let row = 0; row < g.rows; row++) {
      const cr = cellRect(g, c, row);
      if (touching ? rectDistance(cr, r) === 0 : rectsOverlap(cr, r)) out.push({ c, r: row });
    }
  }
  return out;
}

export type Point = readonly [number, number];

function onSegment(p: Point, a: Point, b: Point): boolean {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  if (Math.abs(cross) > 1e-9) return false;
  return p[0] >= Math.min(a[0], b[0]) - 1e-9 && p[0] <= Math.max(a[0], b[0]) + 1e-9 && p[1] >= Math.min(a[1], b[1]) - 1e-9 && p[1] <= Math.max(a[1], b[1]) + 1e-9;
}

/** Ray-cast point-in-polygon; points on the boundary count as inside. */
export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (onSegment(p, a, b)) return true;
    const crosses = a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

/** A boolean per cell, row-major. */
export class Mask {
  readonly data: Uint8Array;
  constructor(readonly grid: Grid, data?: Uint8Array) {
    this.data = data ?? new Uint8Array(grid.cols * grid.rows);
  }
  private idx(c: number, r: number): number {
    return r * this.grid.cols + c;
  }
  get(c: number, r: number): boolean {
    return inGrid(this.grid, c, r) && this.data[this.idx(c, r)] === 1;
  }
  set(c: number, r: number, on = true): void {
    if (inGrid(this.grid, c, r)) this.data[this.idx(c, r)] = on ? 1 : 0;
  }
  count(): number {
    return this.data.reduce((n, v) => n + v, 0);
  }
  cells(): Cell[] {
    const out: Cell[] = [];
    for (let r = 0; r < this.grid.rows; r++) for (let c = 0; c < this.grid.cols; c++) if (this.get(c, r)) out.push({ c, r });
    return out;
  }
  clone(): Mask {
    return new Mask(this.grid, new Uint8Array(this.data));
  }
  or(other: Mask): Mask {
    const out = this.clone();
    for (let i = 0; i < out.data.length; i++) if (other.data[i]) out.data[i] = 1;
    return out;
  }
  /** Cells whose centre lies inside the polygon (boundary inclusive). */
  static fromPolygon(grid: Grid, polygon: readonly Point[]): Mask {
    const m = new Mask(grid);
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) if (pointInPolygon(cellCentre(grid, c, r), polygon)) m.set(c, r);
    return m;
  }
  /** Cells containing the points. */
  static fromPoints(grid: Grid, points: readonly Point[]): Mask {
    const m = new Mask(grid);
    for (const p of points) {
      const cell = cellAt(grid, p[0], p[1]);
      if (cell) m.set(cell.c, cell.r);
    }
    return m;
  }
  static fromCells(grid: Grid, cells: readonly Cell[]): Mask {
    const m = new Mask(grid);
    for (const cell of cells) m.set(cell.c, cell.r);
    return m;
  }
}
