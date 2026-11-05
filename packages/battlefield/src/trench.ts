import { cellKey, DELTA, DIRS, edgeInDir, inGrid, isEdgeCell, isLateral, neighbours, OPPOSITE, rotateDir, type Cell, type Dir, type Grid, type Mask } from "./grid.js";
import { decoratedSides, PaletteError, piecesByRole, rotationsForOpenings, type Palette, type PalettePiece, type RotYSense } from "./palette.js";
import type { Rng } from "./rng.js";

// The trench network (rulebook p67): the first section enters from a board
// edge, every later section connects to an existing one, and the finished
// network runs unbroken to the opposite edge. Built in passes:
//   - with deployment zones on opposite edges: a line inside each zone along
//     its board edge, so a warband deploys into trench (Jonathan's review of
//     the first live board), joined across no man's land by a cross trench;
//     the lines reach the opposite board edges between them;
//   - otherwise: the spine, a seeded, forward-biased self-avoiding walk from
//     one board edge to the opposite one, with a line for any single zone
//     joined to it by a communication trench (BFS);
//   - then branches that leave the board at another edge or rejoin the network.
// Nothing dead-ends, because the Entrance piece's opening side is unverified.
// No Man's Land allows trenches only wholly inside deployment zones, so there
// the deployment lines are the whole network.
//
// Invariants every pass keeps: no cell touches more than three trench cells
// (no cross pieces exist), no 2x2 block of trench cells, and a new cell touches
// only the cell it grew from (or exactly one more, where it joins).

export type Axis = "x" | "y";

export type NetworkMode = "trench-lines" | "deployment-only";

export interface DeploymentTrack {
  zoneLabel: string;
  player: string;
  /** The board edge the zone runs along. */
  side: Dir;
  /** The axis the track runs along. */
  along: Axis;
  /** Cells wholly inside the zone along its board edge, ordered from the low end (S or W). */
  cells: Cell[];
}

export interface TrenchOptions {
  mode: NetworkMode;
  axis: Axis;
  /** Enter from the low edge (W for x, S for y) rather than the high one. */
  fromLowEdge: boolean;
  /** Longest run of consecutive sideways steps on the spine. */
  maxLateralRun: number;
  branches: number;
  branchMinLen: number;
  branchMaxLen: number;
  allowBranchExits: boolean;
  allowLoops: boolean;
  /** Search budget in node expansions before giving up on a path. */
  budget: number;
  tracks: DeploymentTrack[];
  /** Shortest deployment line worth laying. */
  minLineCells: number;
  /** Longest communication trench, in cells. */
  maxCommCells: number;
}

export const DEFAULT_TRENCH_OPTIONS: Omit<TrenchOptions, "mode" | "axis" | "fromLowEdge" | "branches" | "tracks"> = {
  maxLateralRun: 3,
  branchMinLen: 2,
  branchMaxLen: 6,
  allowBranchExits: true,
  allowLoops: true,
  budget: 20000,
  minLineCells: 4,
  maxCommCells: 10,
};

export interface TrenchCell extends Cell {
  openings: Dir[];
}

export interface EdgeOpening extends Cell {
  dir: Dir;
}

export interface DeploymentLine {
  zoneLabel: string;
  player: string;
  side: Dir;
  cells: Cell[];
  variant: "full" | "from-low" | "from-high";
  /** Cells of the communication trench joining this line to the rest. */
  commCells: Cell[];
}

export interface TrenchNetwork {
  axis: Axis;
  mode: NetworkMode;
  cells: TrenchCell[];
  start: EdgeOpening | null;
  end: EdgeOpening | null;
  /** Every place the network runs off the board. */
  exits: EdgeOpening[];
  mainPathLength: number;
  branches: number;
  loops: number;
  deploymentLines: DeploymentLine[];
  warnings: string[];
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

const lowDir = (axis: Axis): Dir => (axis === "x" ? "W" : "S");
const highDir = (axis: Axis): Dir => (axis === "x" ? "E" : "N");
const forwardDir = (axis: Axis, fromLowEdge: boolean): Dir => (fromLowEdge ? highDir(axis) : lowDir(axis));

function edgeCells(grid: Grid, side: Dir): Cell[] {
  const out: Cell[] = [];
  for (let c = 0; c < grid.cols; c++) for (let r = 0; r < grid.rows; r++) if (edgeInDir(grid, c, r, side)) out.push({ c, r });
  return out;
}

interface Search {
  expansions: number;
  budget: number;
}

// ---- deployment lines ---------------------------------------------------

type LinePlan = { variant: DeploymentLine["variant"]; from: number; to: number };

/** Every line shape the track allows, in seeded order: full length, or a run from one board edge. */
function linePlans(net: Network, rng: Rng, track: DeploymentTrack, opts: TrenchOptions): LinePlan[] {
  const n = track.cells.length;
  const usable = track.cells.map((cell) => net.free(cell.c, cell.r) && net.trenchNeighbours(cell.c, cell.r).length === 0);
  const freeRun = (from: number, to: number) => usable.slice(from, to + 1).every(Boolean);
  const options: { item: LinePlan; weight: number }[] = [];
  if (n >= opts.minLineCells && freeRun(0, n - 1)) options.push({ item: { variant: "full", from: 0, to: n - 1 }, weight: opts.mode === "deployment-only" ? 1 : 2 });
  if (opts.mode === "trench-lines") {
    const each = 2 / Math.max(1, n - opts.minLineCells);
    for (let k = opts.minLineCells - 1; k <= n - 2; k++) if (freeRun(0, k)) options.push({ item: { variant: "from-low", from: 0, to: k }, weight: each });
    for (let k = n - opts.minLineCells; k >= 1; k--) if (freeRun(k, n - 1)) options.push({ item: { variant: "from-high", from: k, to: n - 1 }, weight: each });
  }
  return rng.weightedOrder(options);
}

/**
 * Lays one deployment line, trying its shapes in seeded order; in trench-lines
 * mode a shape only stands if a communication trench can join it to the rest.
 */
function layDeploymentLine(net: Network, rng: Rng, track: DeploymentTrack, opts: TrenchOptions): DeploymentLine | null {
  for (const plan of linePlans(net, rng, track, opts)) {
    const laid = addLine(net, track, plan);
    if (opts.mode === "deployment-only" || connectLine(net, rng, laid.line, opts.maxCommCells)) return laid.line;
    removeLine(net, laid);
  }
  return null;
}

// ---- the spine ----------------------------------------------------------

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
  // Starts near the middle of the edge come first, so the spine runs through no man's land.
  const mid = (opts.axis === "y" ? net.grid.cols - 1 : net.grid.rows - 1) / 2;
  const across = (s: Cell) => Math.abs((opts.axis === "y" ? s.c : s.r) - mid);
  const starts = rng
    .weightedOrder(edgeCells(net.grid, enterFrom).map((s) => ({ item: s, weight: 1 / (1 + across(s) * across(s)) })))
    .filter((s) => {
      const [dc, dr] = DELTA[forward];
      return net.free(s.c, s.r) && net.free(s.c + dc, s.r + dr) && net.trenchNeighbours(s.c, s.r).length === 0;
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

// ---- communication trenches ---------------------------------------------

/**
 * Shortest seeded path from the cell beside `junction` (on the `inward` side)
 * to any trench cell outside `ownCells` that can take one more opening. Path
 * cells touch no trench except their predecessor, and the last one touches
 * exactly one target, so no 2x2 block and no fourth opening can form.
 */
function connect(net: Network, rng: Rng, junction: Cell, inward: Dir, ownCells: Set<string>, maxCells: number, isTarget: (t: Cell) => boolean = (t) => net.openingCount(t.c, t.r) === 2): Cell[] | null {
  if (net.openingCount(junction.c, junction.r) >= 3) return null;
  const [ic, ir] = DELTA[inward];
  const first = { c: junction.c + ic, r: junction.r + ir };
  // Like the spine, these trenches keep off the board edge: a run along it is dead ground.
  if (!net.free(first.c, first.r) || isEdgeCell(net.grid, first.c, first.r)) return null;
  const targetOf = (c: number, r: number, from: Cell | null): { ok: boolean; joins: boolean } => {
    const touching = net.trenchNeighbours(c, r).filter((n) => !(from && n.c === from.c && n.r === from.r));
    if (touching.length === 0) return { ok: true, joins: false };
    if (touching.length > 1) return { ok: false, joins: false };
    const t = touching[0]!;
    if (ownCells.has(cellKey(t.c, t.r))) return { ok: false, joins: false };
    return { ok: net.openingCount(t.c, t.r) <= 2 && isTarget(t), joins: true };
  };
  const firstState = targetOf(first.c, first.r, junction);
  if (!firstState.ok) return null;
  if (firstState.joins) return [first];
  const parent = new Map<string, Cell | null>([[cellKey(first.c, first.r), null]]);
  const depth = new Map<string, number>([[cellKey(first.c, first.r), 1]]);
  const queue: Cell[] = [first];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = depth.get(cellKey(cur.c, cur.r))!;
    if (d >= maxCells) continue;
    for (const dir of rng.shuffle(DIRS)) {
      const [dc, dr] = DELTA[dir];
      const next = { c: cur.c + dc, r: cur.r + dr };
      const key = cellKey(next.c, next.r);
      if (parent.has(key) || !net.free(next.c, next.r) || isEdgeCell(net.grid, next.c, next.r)) continue;
      const state = targetOf(next.c, next.r, null);
      if (!state.ok) continue;
      parent.set(key, cur);
      depth.set(key, d + 1);
      if (state.joins) {
        const path: Cell[] = [];
        for (let at: Cell | null = next; at; at = parent.get(cellKey(at.c, at.r)) ?? null) path.unshift(at);
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

function connectLine(net: Network, rng: Rng, line: DeploymentLine, maxCells: number): boolean {
  const inward = OPPOSITE[line.side];
  const own = new Set(line.cells.map((cell) => cellKey(cell.c, cell.r)));
  const junctions =
    line.variant === "full"
      ? rng.shuffle(line.cells.slice(1, -1))
      : [line.variant === "from-low" ? line.cells[line.cells.length - 1]! : line.cells[0]!];
  for (const junction of junctions) {
    const path = connect(net, rng, junction, inward, own, maxCells);
    if (!path) continue;
    for (const cell of path) net.add(cell.c, cell.r);
    line.commCells = path;
    return true;
  }
  return false;
}

// ---- paired deployment lines --------------------------------------------

const opposedTracks = (tracks: readonly DeploymentTrack[]): boolean => tracks.length === 2 && OPPOSITE[tracks[0]!.side] === tracks[1]!.side;

// The network must reach opposite board edges along the lines' axis: a full
// line does, and so do two partial lines starting from opposite edges.
const spansEdges = (a: LinePlan, b: LinePlan): boolean => a.variant === "full" || b.variant === "full" || (a.variant !== b.variant);

const junctionsOf = (line: DeploymentLine): Cell[] =>
  line.variant === "full" ? line.cells.slice(1, -1) : [line.variant === "from-low" ? line.cells[line.cells.length - 1]! : line.cells[0]!];

function addLine(net: Network, track: DeploymentTrack, plan: LinePlan): { line: DeploymentLine; exits: EdgeOpening[] } {
  const n = track.cells.length;
  const cells = track.cells.slice(plan.from, plan.to + 1);
  for (const cell of cells) net.add(cell.c, cell.r);
  const exits: EdgeOpening[] = [];
  if (plan.from === 0) exits.push({ ...track.cells[0]!, dir: lowDir(track.along) });
  if (plan.to === n - 1) exits.push({ ...track.cells[n - 1]!, dir: highDir(track.along) });
  net.exits.push(...exits);
  return { line: { zoneLabel: track.zoneLabel, player: track.player, side: track.side, cells, variant: plan.variant, commCells: [] }, exits };
}

function removeLine(net: Network, laid: { line: DeploymentLine; exits: EdgeOpening[] }): void {
  for (const cell of laid.line.cells) net.remove(cell.c, cell.r);
  for (const exit of laid.exits) net.exits.splice(net.exits.indexOf(exit), 1);
}

/**
 * Two deployment zones on opposite edges: a line in each, joined across no
 * man's land by a cross trench from a junction on one to a junction on the
 * other (Trenches Square Off's shape), sometimes a second one making a loop.
 * The lines carry the edge-to-edge requirement. Returns the cross trench
 * length, or null when no pairing of line shapes can be joined.
 */
function layPairedLines(net: Network, rng: Rng, opts: TrenchOptions, lines: DeploymentLine[]): number | null {
  const [ta, tb] = opts.tracks as [DeploymentTrack, DeploymentTrack];
  const plansA = linePlans(net, rng, ta, opts);
  const plansB = linePlans(net, rng, tb, opts);
  const combos = plansA.flatMap((a, i) => plansB.map((b, j) => ({ a, b, rank: i + j + rng.next() }))).filter((x) => spansEdges(x.a, x.b));
  combos.sort((x, y) => x.rank - y.rank);
  for (const { a, b } of combos.slice(0, 16)) {
    const la = addLine(net, ta, a);
    const lb = addLine(net, tb, b);
    const own = new Set(la.line.cells.map((cell) => cellKey(cell.c, cell.r)));
    const targets = new Set(junctionsOf(lb.line).map((cell) => cellKey(cell.c, cell.r)));
    const width = Math.abs(ta.along === "y" ? ta.cells[0]!.c - tb.cells[0]!.c : ta.cells[0]!.r - tb.cells[0]!.r);
    let cross: Cell[] | null = null;
    for (const junction of rng.shuffle(junctionsOf(la.line)).slice(0, 6)) {
      cross = connect(net, rng, junction, OPPOSITE[ta.side], own, width + 6, (t) => targets.has(cellKey(t.c, t.r)));
      if (cross) break;
    }
    if (!cross) {
      removeLine(net, lb);
      removeLine(net, la);
      continue;
    }
    for (const cell of cross) net.add(cell.c, cell.r);
    la.line.commCells = cross;
    if (rng.chance(0.35)) {
      const second = rng
        .shuffle(la.line.cells.filter((cell) => net.openingCount(cell.c, cell.r) === 2 && !net.exitsAt(cell.c, cell.r).length))
        .map((junction) => connect(net, rng, junction, OPPOSITE[ta.side], own, width + 2, (t) => lb.line.cells.some((x) => x.c === t.c && x.r === t.r)))
        .find((path) => path !== null);
      if (second) {
        for (const cell of second) net.add(cell.c, cell.r);
        lb.line.commCells = second;
      }
    }
    lines.push(la.line, lb.line);
    return cross.length;
  }
  return null;
}

// ---- branches -----------------------------------------------------------

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

function layBranch(net: Network, rng: Rng, opts: TrenchOptions, exclude: Set<string>): BranchEnd | null {
  const starts = rng.shuffle(net.cells().filter((cell) => !exclude.has(cellKey(cell.c, cell.r)) && !isEdgeCell(net.grid, cell.c, cell.r) && net.openingCount(cell.c, cell.r) === 2));
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

/**
 * Lays the network, or returns null when this attempt cannot fit (no spine,
 * or a deployment line that cannot be joined); the caller retries with fresh
 * draws or smaller objective covers.
 */
export function layTrenchNetwork(grid: Grid, blocked: Mask, rng: Rng, opts: TrenchOptions): TrenchNetwork | null {
  const warnings: string[] = [];
  const net = new Network(grid, blocked.clone());
  const trackCells = opts.tracks.flatMap((t) => t.cells);
  // The spine keeps off the tracks and the cells beside them, so the lines can
  // go in afterwards without touching it; communication trenches cross that
  // strip later.
  const buffer = opts.tracks.flatMap((t) => t.cells.map((cell) => ({ c: cell.c + DELTA[OPPOSITE[t.side]][0], r: cell.r + DELTA[OPPOSITE[t.side]][1] })));
  for (const cell of [...trackCells, ...buffer]) net.blocked.set(cell.c, cell.r);

  let start: EdgeOpening | null = null;
  let end: EdgeOpening | null = null;
  let mainPathLength = 0;
  const paired = opts.mode === "trench-lines" && opposedTracks(opts.tracks);
  if (opts.mode === "trench-lines" && !paired) {
    const path = layMainPath(net, rng, opts);
    if (!path) return null;
    const forward = forwardDir(opts.axis, opts.fromLowEdge);
    const first = path[0]!;
    const last = path[path.length - 1]!;
    start = { c: first.c, r: first.r, dir: OPPOSITE[forward] };
    end = { c: last.c, r: last.r, dir: forward };
    net.exits.push(start, end);
    mainPathLength = path.length;
  }
  for (const cell of [...trackCells, ...buffer]) net.blocked.set(cell.c, cell.r, blocked.get(cell.c, cell.r));

  const lines: DeploymentLine[] = [];
  if (paired) {
    const crossLength = layPairedLines(net, rng, opts, lines);
    if (crossLength === null) return null;
    mainPathLength = crossLength;
    const along = opts.tracks[0]!.along;
    start = net.exits.find((e) => e.dir === lowDir(along)) ?? null;
    end = net.exits.find((e) => e.dir === highDir(along)) ?? null;
  } else {
    for (const track of opts.tracks) {
      const line = layDeploymentLine(net, rng, track, opts);
      if (line) lines.push(line);
      else if (opts.mode === "trench-lines") return null;
      else warnings.push(`no room for a deployment line in ${track.zoneLabel}`);
    }
  }
  for (const cell of trackCells) if (!net.has(cell.c, cell.r)) net.blocked.set(cell.c, cell.r);
  const lineKeys = new Set(lines.flatMap((l) => l.cells.map((cell) => cellKey(cell.c, cell.r))));

  let branches = 0;
  let loops = 0;
  if (opts.mode === "trench-lines") {
    for (let i = 0; i < opts.branches; i++) {
      const outcome = layBranch(net, rng, opts, lineKeys);
      if (!outcome) break;
      branches++;
      if (outcome.kind === "exit") net.exits.push(outcome.exit);
      else loops++;
    }
  } else if (lines[0]) {
    const first = lines[0];
    const at = (cell: Cell) => net.exits.find((e) => e.c === cell.c && e.r === cell.r) ?? null;
    start = at(first.cells[0]!);
    end = at(first.cells[first.cells.length - 1]!);
  }

  const cells: TrenchCell[] = net
    .cells()
    .sort((a, b) => a.r - b.r || a.c - b.c)
    .map((cell) => {
      const openings = DIRS.filter((d) => net.trenchNeighbours(cell.c, cell.r).some((n) => n.dir === d) || net.exitsAt(cell.c, cell.r).includes(d));
      if (openings.length < 2 || openings.length > 3) throw new TrenchError(`cell ${cell.c},${cell.r} has ${openings.length} openings`);
      return { c: cell.c, r: cell.r, openings };
    });
  const axis = opts.tracks[0]?.along ?? opts.axis;
  return { axis, mode: opts.mode, cells, start, end, exits: [...net.exits], mainPathLength, branches, loops, deploymentLines: lines, warnings };
}

/**
 * True when a model can enter the trench from the board edge on one side of
 * the axis and leave it on the opposite side without leaving a trench. Walks
 * the openings only, so it checks what the pieces say, not what the walk
 * intended.
 */
export function trenchConnectsEdges(grid: Grid, cells: readonly TrenchCell[], axis: Axis): boolean {
  const byKey = new Map(cells.map((cell) => [cellKey(cell.c, cell.r), cell]));
  const low = lowDir(axis);
  const high = OPPOSITE[low];
  const starts = cells.filter((cell) => edgeInDir(grid, cell.c, cell.r, low) && cell.openings.includes(low));
  const seen = new Set<string>(starts.map((s) => cellKey(s.c, s.r)));
  const queue = [...starts];
  while (queue.length) {
    const cur = queue.shift()!;
    if (edgeInDir(grid, cur.c, cur.r, high) && cur.openings.includes(high)) return true;
    for (const next of linked(byKey, cur)) {
      const key = cellKey(next.c, next.r);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return false;
}

function linked(byKey: Map<string, TrenchCell>, cell: TrenchCell): TrenchCell[] {
  const out: TrenchCell[] = [];
  for (const dir of cell.openings) {
    const [dc, dr] = DELTA[dir];
    const next = byKey.get(cellKey(cell.c + dc, cell.r + dr));
    if (next && next.openings.includes(OPPOSITE[dir])) out.push(next);
  }
  return out;
}

/** Groups trench cells into networks a model can walk between through matching openings. */
export function trenchComponents(cells: readonly TrenchCell[]): TrenchCell[][] {
  const byKey = new Map(cells.map((cell) => [cellKey(cell.c, cell.r), cell]));
  const seen = new Set<string>();
  const out: TrenchCell[][] = [];
  for (const cell of cells) {
    if (seen.has(cellKey(cell.c, cell.r))) continue;
    const component: TrenchCell[] = [];
    const queue = [cell];
    seen.add(cellKey(cell.c, cell.r));
    while (queue.length) {
      const cur = queue.shift()!;
      component.push(cur);
      for (const next of linked(byKey, cur)) {
        const key = cellKey(next.c, next.r);
        if (!seen.has(key)) {
          seen.add(key);
          queue.push(next);
        }
      }
    }
    out.push(component);
  }
  return out;
}

// ---- pieces and wall lining ------------------------------------------------

export interface TrenchPiece {
  paletteId: string;
  rotY: number;
  /** Walls the mesh lines itself (ledge or logs). */
  lined: { side: Dir; kind: "ledge" | "logs" }[];
  /** Full-length walls left bare by the mesh, which get a log fence. */
  fences: Dir[];
}

const isOpposite = (sides: readonly Dir[]): boolean => sides.length === 2 && OPPOSITE[sides[0]!] === sides[1];

/**
 * Picks a piece, rotation and wall lining for one trench cell. Every full-length
 * wall (a side that is not an opening) must end up lined: by the mesh's own
 * ledge or logs, or by a log fence. A straight whose wall faces the enemy's
 * deployment zone takes the fire-step ledge on that wall; other straights take
 * plain walls with fences, or logs once the logs side is confirmed.
 */
export function resolveTrenchPiece(openings: readonly Dir[], palette: Palette, rng: Rng, enemy: Dir | null): TrenchPiece {
  const sense: RotYSense = palette.rotation.rotYSense;
  const walls = DIRS.filter((d) => !openings.includes(d));
  const straights = piecesByRole(palette, "trench-straight");
  const choose = (pool: PalettePiece[], wantLedgeOn: Dir | null): { piece: PalettePiece; rotY: number } | null => {
    for (const piece of rng.shuffle(pool)) {
      const rotations = rotationsForOpenings(piece, openings, sense);
      const fitting = wantLedgeOn ? rotations.filter((rotY) => decoratedSides(piece, rotY, sense).includes(wantLedgeOn)) : rotations;
      if (fitting.length) return { piece, rotY: rng.pick(fitting) };
    }
    return null;
  };
  let chosen: { piece: PalettePiece; rotY: number } | null = null;
  if (openings.length === 3) chosen = choose(piecesByRole(palette, "trench-t"), null);
  else if (!isOpposite(openings)) chosen = choose(piecesByRole(palette, "trench-corner"), null);
  else {
    const usable = (kind: "ledge" | "logs" | null) => straights.filter((p) => (kind === null ? !p.decoratedWalls : p.decoratedWalls?.kind === kind && p.decoratedWalls.source !== "assumed"));
    if (enemy && walls.includes(enemy)) chosen = choose(usable("ledge"), enemy);
    chosen ??= choose(usable("logs"), null) ?? choose(usable(null), null) ?? choose(straights, null);
  }
  if (!chosen) throw new PaletteError(`no enabled trench piece opens on ${openings.join("")}`);
  const kind = chosen.piece.decoratedWalls?.kind ?? "logs";
  const lined = decoratedSides(chosen.piece, chosen.rotY, sense).map((side) => ({ side, kind }));
  const fences = walls.filter((w) => !lined.some((l) => l.side === w));
  return { paletteId: chosen.piece.id, rotY: chosen.rotY, lined, fences };
}

/** Picks pieces for every network cell; `enemyOf` says which side faces the enemy from a cell. */
export function resolveTrenchPieces(network: TrenchNetwork, palette: Palette, rng: Rng, enemyOf: (cell: Cell) => Dir | null = () => null): Map<string, TrenchPiece> {
  if (!piecesByRole(palette, "trench-straight").length || !piecesByRole(palette, "trench-corner").length || !piecesByRole(palette, "trench-t").length) {
    throw new PaletteError("palette needs an enabled straight, corner and T trench piece");
  }
  const out = new Map<string, TrenchPiece>();
  for (const cell of network.cells) out.set(cellKey(cell.c, cell.r), resolveTrenchPiece(cell.openings, palette, rng, enemyOf(cell)));
  return out;
}
