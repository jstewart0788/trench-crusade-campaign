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
  /** A box turned off the axes: its exact outline, which the bounds above enclose. */
  poly?: readonly Point[];
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

export const rectContains = (r: Rect, x: number, y: number): boolean => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1 && (!r.poly || outlinePointDistance(r.poly, x, y) === 0);

export const rectInside = (inner: Rect, outer: Rect): boolean => inner.x0 >= outer.x0 && inner.y0 >= outer.y0 && inner.x1 <= outer.x1 && inner.y1 <= outer.y1;

/** Positive-area overlap; touching edges do not count. */
export const rectsOverlap = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1 && (!a.poly && !b.poly ? true : !separated(outline(a), outline(b), 1e-9));

/** Beyond this the bounds' gap stands in for a turned outline's: more than any clearance asks, and never more than the true gap. */
const OUTLINE_REACH_IN = 4;

/** Shortest distance between two rectangles, turned ones by their exact outline; 0 when they touch or overlap. */
export function rectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1);
  const dy = Math.max(0, b.y0 - a.y1, a.y0 - b.y1);
  const bounds = Math.hypot(dx, dy);
  if ((!a.poly && !b.poly) || bounds > OUTLINE_REACH_IN) return bounds;
  return outlineDistance(outline(a), outline(b));
}

/** Whether two rectangles stand closer than `gap`; the bounds settle it unless they come that close. */
export function rectsWithin(a: Rect, b: Rect, gap: number): boolean {
  const dx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1);
  const dy = Math.max(0, b.y0 - a.y1, a.y0 - b.y1);
  if (dx >= gap || dy >= gap || dx * dx + dy * dy >= gap * gap) return false;
  return !a.poly && !b.poly ? true : outlineDistance(outline(a), outline(b)) < gap;
}

export function rectPointDistance(r: Rect, x: number, y: number): number {
  if (r.poly) return outlinePointDistance(r.poly, x, y);
  const dx = Math.max(0, r.x0 - x, x - r.x1);
  const dy = Math.max(0, r.y0 - y, y - r.y1);
  return Math.hypot(dx, dy);
}

/** A rectangle's corners in order round it: its turned outline, or its bounds. */
export const outline = (r: Rect): readonly Point[] => r.poly ?? [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];

function segmentPointDistance(p: Point, a: Point, b: Point): number {
  const [vx, vy] = [b[0] - a[0], b[1] - a[1]];
  const len = vx * vx + vy * vy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

/** Whether an edge normal of either convex outline separates them, by more than `slack` when given. */
function separated(a: readonly Point[], b: readonly Point[], slack = 0): boolean {
  for (let k = 0; k < 2; k++) {
    const poly = k === 0 ? a : b;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      let a0 = Number.POSITIVE_INFINITY;
      let a1 = Number.NEGATIVE_INFINITY;
      let b0 = Number.POSITIVE_INFINITY;
      let b1 = Number.NEGATIVE_INFINITY;
      for (const pt of a) {
        const v = pt[0] * nx + pt[1] * ny;
        if (v < a0) a0 = v;
        if (v > a1) a1 = v;
      }
      for (const pt of b) {
        const v = pt[0] * nx + pt[1] * ny;
        if (v < b0) b0 = v;
        if (v > b1) b1 = v;
      }
      const tol = slack * Math.hypot(nx, ny);
      if (a1 < b0 + tol || b1 < a0 + tol) return true;
    }
  }
  return false;
}

/** Distance between two convex outlines: 0 when they meet, else the nearest corner to an edge. */
export function outlineDistance(a: readonly Point[], b: readonly Point[]): number {
  if (!separated(a, b)) return 0;
  let d = Number.POSITIVE_INFINITY;
  for (const [from, to] of [[a, b], [b, a]] as const) {
    for (const p of from) for (let i = 0; i < to.length; i++) d = Math.min(d, segmentPointDistance(p, to[i]!, to[(i + 1) % to.length]!));
  }
  return d;
}

/** Area two rectangles share, turned ones by their exact outline (the first clipped to the second, which is convex). */
export function rectOverlapArea(a: Rect, b: Rect): number {
  const bounds = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  if (bounds === 0 || (!a.poly && !b.poly)) return bounds;
  const clip = outline(b);
  // Wound the same way round, so "inside" is the same side of every edge.
  const turn = Math.sign(signedArea(clip));
  let poly: Point[] = [...outline(a)];
  for (let i = 0; i < clip.length && poly.length; i++) {
    const [p, q] = [clip[i]!, clip[(i + 1) % clip.length]!];
    const side = (pt: Point) => turn * ((q[0] - p[0]) * (pt[1] - p[1]) - (q[1] - p[1]) * (pt[0] - p[0]));
    const next: Point[] = [];
    for (let k = 0; k < poly.length; k++) {
      const [u, v] = [poly[k]!, poly[(k + 1) % poly.length]!];
      const [su, sv] = [side(u), side(v)];
      if (su >= 0) next.push(u);
      if ((su >= 0) !== (sv >= 0)) {
        const t = su / (su - sv);
        next.push([u[0] + t * (v[0] - u[0]), u[1] + t * (v[1] - u[1])]);
      }
    }
    poly = next;
  }
  return Math.abs(signedArea(poly));
}

export const rectArea = (r: Rect): number => (r.poly ? Math.abs(signedArea(r.poly)) : (r.x1 - r.x0) * (r.y1 - r.y0));

function signedArea(poly: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [p, q] = [poly[i]!, poly[(i + 1) % poly.length]!];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Distance from a point to a convex outline; 0 inside or on it. */
export function outlinePointDistance(poly: readonly Point[], x: number, y: number): number {
  let inside = true;
  let sign = 0;
  for (let i = 0; i < poly.length && inside; i++) {
    const [p, q] = [poly[i]!, poly[(i + 1) % poly.length]!];
    const cross = (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    if (Math.abs(cross) < 1e-12) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) inside = false;
  }
  if (inside) return 0;
  let d = Number.POSITIVE_INFINITY;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segmentPointDistance([x, y], poly[i]!, poly[(i + 1) % poly.length]!));
  return d;
}

/** Cells whose rectangle intersects (or merely touches, when `touching`) the rectangle. */
export function cellsInRect(g: Grid, r: Rect, touching = false): Cell[] {
  const out: Cell[] = [];
  const c0 = Math.max(0, Math.floor(r.x0 / g.cellIn) - 1);
  const c1 = Math.min(g.cols - 1, Math.floor(r.x1 / g.cellIn) + 1);
  const r0 = Math.max(0, Math.floor(r.y0 / g.cellIn) - 1);
  const r1 = Math.min(g.rows - 1, Math.floor(r.y1 / g.cellIn) + 1);
  for (let c = c0; c <= c1; c++) {
    for (let row = r0; row <= r1; row++) {
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
