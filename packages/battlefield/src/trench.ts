import { cellKey, DELTA, DIRS, edgeInDir, inGrid, isEdgeCell, isLateral, neighbours, OPPOSITE, rotateDir, type Cell, type Dir, type Grid, type Mask } from "./grid.js";
import { PaletteError, piecesByRole, rotYForOpenings, type Palette, type RotYSense } from "./palette.js";
import type { Rng } from "./rng.js";

// The trench network (rulebook p67): the first section enters from a board
// edge, every later section connects to an existing one, and the finished
// network runs unbroken to the opposite edge. Laid as a seeded, forward-biased
// self-avoiding walk on the cell grid, then branches that either leave the
// board at another edge or rejoin the network. Nothing dead-ends, because the
// Entrance piece's opening side is unverified (palette note).
//
// Invariants the walk enforces: no cell touches more than three trench cells
// (no cross pieces exist), no 2x2 block of trench cells, and a new cell touches
// only the cell it was walked from (or exactly one more, when closing a loop).

export type Axis = "x" | "y";

export interface TrenchOptions {
  axis: Axis;
  /** Enter from the low edge (W for x, S for y) rather than the high one. */
  fromLowEdge: boolean;
  /** Longest run of consecutive sideways steps on the main path. */
  maxLateralRun: number;
  branches: number;
  branchMinLen: number;
  branchMaxLen: number;
  allowBranchExits: boolean;
  allowLoops: boolean;
  /** Search budget in node expansions before giving up on a path. */
  budget: number;
}

export const DEFAULT_TRENCH_OPTIONS: Omit<TrenchOptions, "axis" | "fromLowEdge" | "branches"> = {
  maxLateralRun: 3,
  branchMinLen: 2,
  branchMaxLen: 6,
  allowBranchExits: true,
  allowLoops: true,
  budget: 20000,
};

export interface TrenchCell extends Cell {
  openings: Dir[];
}

export interface EdgeOpening extends Cell {
  dir: Dir;
}

export interface TrenchNetwork {
  axis: Axis;
  cells: TrenchCell[];
  start: EdgeOpening;
  end: EdgeOpening;
  /** Every place the network runs off the board, including start and end. */
  exits: EdgeOpening[];
  mainPathLength: number;
  branches: number;
  loops: number;
}

export class TrenchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrenchError";
  }
}

class Network {
  private readonly set = new Map<string, Cell>();
  readonly exits: EdgeOpening[] = [];
  constructor(
    readonly grid: Grid,
    readonly blocked: Mask,
  ) {}
  has(c: number, r: number): boolean {
    return this.set.has(cellKey(c, r));
  }
  add(c: number, r: number): void {
    this.set.set(cellKey(c, r), { c, r });
  }
  remove(c: number, r: number): void {
    this.set.delete(cellKey(c, r));
  }
  size(): number {
    return this.set.size;
  }
  cells(): Cell[] {
    return [...this.set.values()];
  }
  trenchNeighbours(c: number, r: number): { dir: Dir; c: number; r: number }[] {
    return neighbours(this.grid, c, r).filter((n) => this.has(n.c, n.r));
  }
  exitsAt(c: number, r: number): Dir[] {
    return this.exits.filter((e) => e.c === c && e.r === r).map((e) => e.dir);
  }
  openingCount(c: number, r: number): number {
    return this.trenchNeighbours(c, r).length + this.exitsAt(c, r).length;
  }
  /** Would adding (c, r) complete a 2x2 block of trench cells? */
  makes2x2(c: number, r: number): boolean {
    for (const dc of [0, -1]) {
      for (const dr of [0, -1]) {
        const corners = [
          [c + dc, r + dr],
          [c + dc + 1, r + dr],
          [c + dc, r + dr + 1],
          [c + dc + 1, r + dr + 1],
        ] as const;
        if (corners.every(([x, y]) => (x === c && y === r) || this.has(x, y))) return true;
      }
    }
    return false;
  }
  free(c: number, r: number): boolean {
    return inGrid(this.grid, c, r) && !this.blocked.get(c, r) && !this.has(c, r);
  }
}

const forwardDir = (axis: Axis, fromLowEdge: boolean): Dir => (axis === "x" ? (fromLowEdge ? "E" : "W") : fromLowEdge ? "N" : "S");

function startEdgeCells(grid: Grid, enterFrom: Dir): Cell[] {
  const out: Cell[] = [];
  for (let c = 0; c < grid.cols; c++) for (let r = 0; r < grid.rows; r++) if (edgeInDir(grid, c, r, enterFrom)) out.push({ c, r });
  return out;
}

interface Search {
  expansions: number;
  budget: number;
}

function mainPathStep(net: Network, rng: Rng, opts: TrenchOptions, forward: Dir, path: Cell[], lateral: { dir: Dir | null; run: number }, search: Search): boolean {
  const cur = path[path.length - 1]!;
  if (path.length > 1 && edgeInDir(net.grid, cur.c, cur.r, forward)) return true;
  if (++search.expansions > search.budget) return false;
  const left = rotateDir(forward, -1);
  const right = rotateDir(forward, 1);
  const order = rng.weightedOrder([
    { item: forward, weight: 0.55 },
    { item: left, weight: 0.225 },
    { item: right, weight: 0.225 },
  ]);
  for (const dir of order) {
    if (path.length === 1 && dir !== forward) continue;
    if (isLateral(dir, forward) && lateral.dir === dir && lateral.run >= opts.maxLateralRun) continue;
    const [dc, dr] = DELTA[dir];
    const c = cur.c + dc;
    const r = cur.r + dr;
    if (!net.free(c, r)) continue;
    // Only the far-edge cell, entered head-on, may lie on a board edge: a run
    // along an edge is dead ground nobody fights over.
    if (isEdgeCell(net.grid, c, r) && !(edgeInDir(net.grid, c, r, forward) && dir === forward)) continue;
    if (net.trenchNeighbours(c, r).length !== 1) continue;
    net.add(c, r);
    path.push({ c, r });
    const nextLateral = isLateral(dir, forward) ? { dir, run: lateral.dir === dir ? lateral.run + 1 : 1 } : { dir: null, run: 0 };
    if (mainPathStep(net, rng, opts, forward, path, nextLateral, search)) return true;
    path.pop();
    net.remove(c, r);
    if (search.expansions > search.budget) return false;
  }
  return false;
}

function layMainPath(net: Network, rng: Rng, opts: TrenchOptions): Cell[] | null {
  const forward = forwardDir(opts.axis, opts.fromLowEdge);
  const enterFrom = OPPOSITE[forward];
  const starts = rng.shuffle(startEdgeCells(net.grid, enterFrom)).filter((s) => {
    const [dc, dr] = DELTA[forward];
    return net.free(s.c, s.r) && net.free(s.c + dc, s.r + dr);
  });
  for (const start of starts) {
    net.add(start.c, start.r);
    const path = [start];
    const search: Search = { expansions: 0, budget: opts.budget };
    if (mainPathStep(net, rng, opts, forward, path, { dir: null, run: 0 }, search)) return path;
    net.remove(start.c, start.r);
  }
  return null;
}

type BranchEnd = { kind: "exit"; exit: EdgeOpening } | { kind: "loop" };

function branchStep(net: Network, rng: Rng, opts: TrenchOptions, path: Cell[], lastDir: Dir, search: Search): BranchEnd | null {
  const cur = path[path.length - 1]!;
  if (path.length >= opts.branchMaxLen) return null;
  if (++search.expansions > search.budget) return null;
  const order = rng.weightedOrder([
    { item: lastDir, weight: 0.5 },
    { item: rotateDir(lastDir, -1), weight: 0.25 },
    { item: rotateDir(lastDir, 1), weight: 0.25 },
  ]);
  for (const dir of order) {
    const [dc, dr] = DELTA[dir];
    const c = cur.c + dc;
    const r = cur.r + dr;
    if (!net.free(c, r)) continue;
    const touches = net.trenchNeighbours(c, r).filter((n) => !(n.c === cur.c && n.r === cur.r));
    const onEdge = isEdgeCell(net.grid, c, r);
    const longEnough = path.length + 1 >= opts.branchMinLen;
    if (touches.length === 0) {
      if (onEdge) {
        if (opts.allowBranchExits && longEnough && edgeInDir(net.grid, c, r, dir) && !net.makes2x2(c, r)) {
          net.add(c, r);
          path.push({ c, r });
          return { kind: "exit", exit: { c, r, dir } };
        }
        continue;
      }
      net.add(c, r);
      path.push({ c, r });
      const end = branchStep(net, rng, opts, path, dir, search);
      if (end) return end;
      path.pop();
      net.remove(c, r);
      if (search.expansions > search.budget) return null;
      continue;
    }
    if (touches.length === 1 && opts.allowLoops && longEnough && !onEdge) {
      const t = touches[0]!;
      if (net.openingCount(t.c, t.r) === 2 && !net.makes2x2(c, r)) {
        net.add(c, r);
        path.push({ c, r });
        return { kind: "loop" };
      }
    }
  }
  return null;
}

function layBranch(net: Network, rng: Rng, opts: TrenchOptions): BranchEnd | null {
  const starts = rng.shuffle(net.cells().filter((cell) => !isEdgeCell(net.grid, cell.c, cell.r) && net.openingCount(cell.c, cell.r) === 2));
  for (const start of starts) {
    for (const dir of rng.shuffle(DIRS)) {
      const [dc, dr] = DELTA[dir];
      const c = start.c + dc;
      const r = start.r + dr;
      if (!net.free(c, r) || isEdgeCell(net.grid, c, r)) continue;
      if (net.trenchNeighbours(c, r).length !== 1) continue;
      net.add(c, r);
      const path = [{ c, r }];
      const end = branchStep(net, rng, opts, path, dir, { expansions: 0, budget: Math.min(opts.budget, 4000) });
      if (end) return end;
      net.remove(c, r);
    }
  }
  return null;
}

/** Lays the network, or returns null when no path fits the blocked cells within the search budget. */
export function layTrenchNetwork(grid: Grid, blocked: Mask, rng: Rng, opts: TrenchOptions): TrenchNetwork | null {
  const net = new Network(grid, blocked);
  const path = layMainPath(net, rng, opts);
  if (!path) return null;
  const forward = forwardDir(opts.axis, opts.fromLowEdge);
  const first = path[0]!;
  const last = path[path.length - 1]!;
  const start: EdgeOpening = { c: first.c, r: first.r, dir: OPPOSITE[forward] };
  const end: EdgeOpening = { c: last.c, r: last.r, dir: forward };
  net.exits.push(start, end);

  let branches = 0;
  let loops = 0;
  for (let i = 0; i < opts.branches; i++) {
    const outcome = layBranch(net, rng, opts);
    if (!outcome) break;
    branches++;
    if (outcome.kind === "exit") net.exits.push(outcome.exit);
    else loops++;
  }

  const cells: TrenchCell[] = net
    .cells()
    .sort((a, b) => a.r - b.r || a.c - b.c)
    .map((cell) => {
      const openings = DIRS.filter((d) => net.trenchNeighbours(cell.c, cell.r).some((n) => n.dir === d) || net.exitsAt(cell.c, cell.r).includes(d));
      if (openings.length < 2 || openings.length > 3) throw new TrenchError(`cell ${cell.c},${cell.r} has ${openings.length} openings`);
      return { c: cell.c, r: cell.r, openings };
    });
  return { axis: opts.axis, cells, start, end, exits: [...net.exits], mainPathLength: path.length, branches, loops };
}

const lowEdgeDir = (axis: Axis): Dir => (axis === "x" ? "W" : "S");

/**
 * True when a model can enter the trench from the board edge on one side of
 * the axis and leave it on the opposite side without leaving a trench. Walks
 * the openings only, so it checks what the pieces say, not what the walk
 * intended.
 */
export function trenchConnectsEdges(grid: Grid, cells: readonly TrenchCell[], axis: Axis): boolean {
  const byKey = new Map(cells.map((cell) => [cellKey(cell.c, cell.r), cell]));
  const low = lowEdgeDir(axis);
  const high = OPPOSITE[low];
  const starts = cells.filter((cell) => edgeInDir(grid, cell.c, cell.r, low) && cell.openings.includes(low));
  const seen = new Set<string>();
  const queue = [...starts];
  for (const s of starts) seen.add(cellKey(s.c, s.r));
  while (queue.length) {
    const cur = queue.shift()!;
    if (edgeInDir(grid, cur.c, cur.r, high) && cur.openings.includes(high)) return true;
    for (const dir of cur.openings) {
      const [dc, dr] = DELTA[dir];
      const next = byKey.get(cellKey(cur.c + dc, cur.r + dr));
      if (!next || !next.openings.includes(OPPOSITE[dir])) continue;
      const key = cellKey(next.c, next.r);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return false;
}

export interface TrenchPiece {
  paletteId: string;
  rotY: number;
}

const isOpposite = (openings: readonly Dir[]): boolean => openings.length === 2 && OPPOSITE[openings[0]!] === openings[1];

/** Picks a palette piece and rotation for every trench cell from its openings. */
export function resolveTrenchPieces(network: TrenchNetwork, palette: Palette, rng: Rng): Map<string, TrenchPiece> {
  const straights = piecesByRole(palette, "trench-straight");
  const corners = piecesByRole(palette, "trench-corner");
  const tees = piecesByRole(palette, "trench-t");
  if (!straights.length || !corners.length || !tees.length) throw new PaletteError("palette needs an enabled straight, corner and T trench piece");
  const sense: RotYSense = palette.rotation.rotYSense;
  const out = new Map<string, TrenchPiece>();
  for (const cell of network.cells) {
    const n = cell.openings.length;
    const piece = n === 3 ? rng.pick(tees) : isOpposite(cell.openings) ? rng.pick(straights) : rng.pick(corners);
    const rotY = rotYForOpenings(piece, cell.openings, sense);
    if (rotY === null) throw new TrenchError(`${piece.id} cannot be turned to open on ${cell.openings.join("")} at ${cell.c},${cell.r}`);
    out.set(cellKey(cell.c, cell.r), { paletteId: piece.id, rotY });
  }
  return out;
}
