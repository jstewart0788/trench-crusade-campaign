import { cellKey, DELTA, DIRS, edgeInDir, inGrid, isEdgeCell, isLateral, neighbours, OPPOSITE, rotateDir, type Cell, type Dir, type Grid, type Mask } from "./grid.js";
import { decoratedSides, PaletteError, piecesByRole, rotationsForOpenings, type Palette, type PalettePiece, type RotYSense } from "./palette.js";
import { mapCell, sideOf, type Parity } from "./parity.js";
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
  /** Lay the two deployment lines as twins under this parity. */
  parity?: Parity;
  /** Longest run of straight pieces anywhere in the network (fire bays between jogs). */
  maxStraightRun: number;
}

export const DEFAULT_TRENCH_OPTIONS: Omit<TrenchOptions, "mode" | "axis" | "fromLowEdge" | "branches" | "tracks"> = {
  maxLateralRun: 3,
  branchMinLen: 2,
  branchMaxLen: 6,
  allowBranchExits: true,
  allowLoops: true,
  budget: 20000,
  minLineCells: 5,
  maxCommCells: 10,
  maxStraightRun: 6,
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
  /** Path order from the low end; a jog leaves the board-edge column for a bay in the next one in. */
  cells: Cell[];
  variant: "full" | "from-low" | "from-high";
  /** Track index where the line jogs inward, or null for a straight line. */
  jog: number | null;
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
  /** The cross trench between the deployment lines runs straight: no jog fitted. */
  straightCross: boolean;
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
  /** Set when no bending cross trench fitted and a straight one joins the lines. */
  straightCross = false;
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

type LinePlan = { variant: DeploymentLine["variant"]; from: number; to: number; jog: number | null };

// A deployment line runs along its zone's board-edge column and jogs once into
// the next column in for a single bay (Jonathan: real fire trenches bend; most
// of the line stays wholly inside the zone, which the edge column is). The jog
// at track index s takes the line from the edge column at s, through the inner
// column at s..s+2, back to the edge column at s+2.
const JOG_SPAN = 2;

const inwardOf = (track: DeploymentTrack): Dir => OPPOSITE[track.side];

function innerCell(track: DeploymentTrack, i: number): Cell {
  const [dc, dr] = DELTA[inwardOf(track)];
  return { c: track.cells[i]!.c + dc, r: track.cells[i]!.r + dr };
}

/** The line's cells in path order from its low end. */
function lineCells(track: DeploymentTrack, plan: LinePlan): Cell[] {
  const out: Cell[] = [];
  for (let i = plan.from; i <= plan.to; i++) {
    if (plan.jog !== null && i >= plan.jog && i <= plan.jog + JOG_SPAN) {
      if (i === plan.jog) out.push(track.cells[i]!, innerCell(track, i));
      else if (i === plan.jog + JOG_SPAN) out.push(innerCell(track, i), track.cells[i]!);
      else out.push(innerCell(track, i));
    } else out.push(track.cells[i]!);
  }
  return out;
}

/** Jog positions that keep each straight stretch of the line within the run cap. */
function jogsFor(from: number, to: number, opts: TrenchOptions): number[] {
  const out: number[] = [];
  for (let s = from + 1; s + JOG_SPAN <= to - 1; s++) if (s - from <= opts.maxStraightRun && to - (s + JOG_SPAN) <= opts.maxStraightRun) out.push(s);
  return out;
}

/** Every line shape the track allows, in seeded order: full length, or a run from one board edge, each with a seeded jog. */
function linePlans(net: Network, rng: Rng, track: DeploymentTrack, opts: TrenchOptions): LinePlan[] {
  const n = track.cells.length;
  const fits = (plan: LinePlan) => lineCells(track, plan).every((cell) => net.free(cell.c, cell.r) && net.trenchNeighbours(cell.c, cell.r).length === 0);
  const options: { item: LinePlan; weight: number }[] = [];
  const add = (variant: LinePlan["variant"], from: number, to: number, weight: number) => {
    // No Man's Land keeps its trenches wholly inside the zones, so its lines stay in the edge column.
    const jogs = opts.mode === "deployment-only" ? [null] : rng.shuffle(jogsFor(from, to, opts));
    const plan = jogs.map((jog) => ({ variant, from, to, jog })).find(fits);
    if (plan) options.push({ item: plan, weight });
  };
  if (n >= opts.minLineCells) add("full", 0, n - 1, opts.mode === "deployment-only" ? 1 : 2);
  if (opts.mode === "trench-lines") {
    const each = 2 / Math.max(1, n - opts.minLineCells);
    for (let k = opts.minLineCells - 1; k <= n - 2; k++) add("from-low", 0, k, each);
    for (let k = n - opts.minLineCells; k >= 1; k--) add("from-high", k, n - 1, each);
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
    if (opts.mode === "deployment-only" || connectLine(net, rng, laid.line, opts.maxCommCells, opts)) return laid.line;
    removeLine(net, laid);
  }
  return null;
}

// ---- the spine ----------------------------------------------------------

function mainPathStep(net: Network, rng: Rng, opts: TrenchOptions, forward: Dir, path: Cell[], lateral: { dir: Dir | null; run: number }, search: Search, straight: { dir: Dir; run: number } = { dir: forward, run: 1 }): boolean {
  const cur = path[path.length - 1]!;
  // The exit off the far edge is one more forward move.
  if (path.length > 1 && edgeInDir(net.grid, cur.c, cur.r, forward)) return !(straight.dir === forward && straight.run + 1 > opts.maxStraightRun + 1);
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
    const nextStraight = { dir, run: dir === straight.dir ? straight.run + 1 : 1 };
    if (nextStraight.run > opts.maxStraightRun + 1) continue;
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
    if (mainPathStep(net, rng, opts, forward, path, nextLateral, search, nextStraight)) return true;
    path.pop();
    net.remove(c, r);
    if (search.expansions > search.budget) return false;
  }
  return false;
}

/**
 * On a mirrored board whose mirror line runs along the spine's axis, the spine
 * runs down that line, so both halves keep the same room, with one jog of a
 * single bay to one side (a trench never runs dead straight; that bay is the
 * one place the spine is not its own twin). Laid when the cells are free.
 */
function layMirrorSpine(net: Network, rng: Rng, opts: TrenchOptions): Cell[] | null {
  const g = net.grid;
  const kind = opts.parity?.kind;
  if (!(kind === "mirror-x" && opts.axis === "y" && g.cols % 2 === 1) && !(kind === "mirror-y" && opts.axis === "x" && g.rows % 2 === 1)) return null;
  const forward = forwardDir(opts.axis, opts.fromLowEdge);
  const n = opts.axis === "y" ? g.rows : g.cols;
  const centre = ((opts.axis === "y" ? g.cols : g.rows) - 1) / 2;
  const at = (i: number, off: number): Cell => (opts.axis === "y" ? { c: centre + off, r: i } : { c: i, r: centre + off });
  const options: Cell[][] = [];
  for (let s = 1; s + JOG_SPAN <= n - 2; s++) {
    if (s > opts.maxStraightRun || n - 1 - (s + JOG_SPAN) > opts.maxStraightRun) continue;
    for (const side of [1, -1]) {
      const line: Cell[] = [];
      for (let i = 0; i < n; i++) {
        if (i === s) line.push(at(i, 0), at(i, side));
        else if (i === s + JOG_SPAN) line.push(at(i, side), at(i, 0));
        else line.push(at(i, i > s && i < s + JOG_SPAN ? side : 0));
      }
      options.push(line);
    }
  }
  for (const line of rng.shuffle(options)) {
    if (!line.every((cell) => net.free(cell.c, cell.r) && net.trenchNeighbours(cell.c, cell.r).length === 0)) continue;
    const path = forward === "N" || forward === "E" ? line : [...line].reverse();
    for (const cell of path) net.add(cell.c, cell.r);
    return path;
  }
  return null;
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

interface PathRules {
  /** Longest run of straight cells the path may form. */
  maxStraight: number;
  /** The path must bend at least once (a jog), so no trench runs dead straight. */
  needTurn: boolean;
}

/**
 * Shortest seeded path from the cell beside `junction` (on the `inward` side)
 * to any trench cell outside `ownCells` that can take one more opening, that
 * keeps every straight run within the cap and, when asked, bends at least
 * once. Path cells touch no trench except their predecessor and never each
 * other out of turn; the last one touches exactly one target, so no 2x2 block
 * and no fourth opening can form.
 */
function connect(net: Network, rng: Rng, junction: Cell, inward: Dir, ownCells: Set<string>, maxCells: number, isTarget: (t: Cell) => boolean = (t) => net.openingCount(t.c, t.r) === 2, rules: PathRules = { maxStraight: 6, needTurn: false }): Cell[] | null {
  if (net.openingCount(junction.c, junction.r) >= 3) return null;
  const [ic, ir] = DELTA[inward];
  const first = { c: junction.c + ic, r: junction.r + ir };
  // Like the spine, these trenches keep off the board edge: a run along it is dead ground.
  if (!net.free(first.c, first.r) || isEdgeCell(net.grid, first.c, first.r)) return null;
  const touching = (c: number, r: number, from: Cell | null) => net.trenchNeighbours(c, r).filter((n) => !(from && n.c === from.c && n.r === from.r));
  const joinOf = (c: number, r: number, from: Cell | null): { ok: boolean; target: Cell | null } => {
    const t = touching(c, r, from);
    if (t.length === 0) return { ok: true, target: null };
    if (t.length > 1) return { ok: false, target: null };
    const target = t[0]!;
    if (ownCells.has(cellKey(target.c, target.r))) return { ok: false, target: null };
    return { ok: net.openingCount(target.c, target.r) <= 2 && isTarget(target), target };
  };
  type State = { cell: Cell; dir: Dir; run: number; turned: boolean; depth: number; parent: State | null };
  const pathOf = (st: State): Cell[] => {
    const out: Cell[] = [];
    for (let at: State | null = st; at; at = at.parent) out.unshift(at.cell);
    return out;
  };
  // Self-avoiding and never alongside itself, so no piece gains an opening the path did not mean.
  const clean = (path: Cell[]) => {
    const keys = new Set(path.map((cell) => cellKey(cell.c, cell.r)));
    if (keys.size !== path.length) return false;
    for (let i = 0; i < path.length; i++) for (let k = i + 2; k < path.length; k++) if (Math.abs(path[i]!.c - path[k]!.c) + Math.abs(path[i]!.r - path[k]!.r) === 1) return false;
    return true;
  };
  const finish = (st: State, target: Cell): Cell[] | null => {
    const jd = DIRS.find((d) => st.cell.c + DELTA[d][0] === target.c && st.cell.r + DELTA[d][1] === target.r)!;
    const run = jd === st.dir ? st.run + 1 : 1;
    if (run > rules.maxStraight + 1) return null;
    if (rules.needTurn && !(st.turned || jd !== st.dir)) return null;
    const path = pathOf(st);
    return clean(path) ? path : null;
  };
  const firstJoin = joinOf(first.c, first.r, junction);
  if (!firstJoin.ok) return null;
  const root: State = { cell: first, dir: inward, run: 1, turned: false, depth: 1, parent: null };
  if (firstJoin.target) return finish(root, firstJoin.target);
  const seen = new Set<string>([`${first.c},${first.r},${inward},1,0`]);
  const queue: State[] = [root];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.depth >= maxCells) continue;
    for (const dir of rng.shuffle(DIRS)) {
      if (dir === OPPOSITE[cur.dir]) continue;
      const run = dir === cur.dir ? cur.run + 1 : 1;
      if (run > rules.maxStraight + 1) continue;
      const [dc, dr] = DELTA[dir];
      const next = { c: cur.cell.c + dc, r: cur.cell.r + dr };
      if (!net.free(next.c, next.r) || isEdgeCell(net.grid, next.c, next.r)) continue;
      const turned = cur.turned || dir !== cur.dir;
      const stateKey = `${next.c},${next.r},${dir},${run},${turned ? 1 : 0}`;
      if (seen.has(stateKey)) continue;
      const join = joinOf(next.c, next.r, null);
      if (!join.ok) continue;
      seen.add(stateKey);
      const st: State = { cell: next, dir, run, turned, depth: cur.depth + 1, parent: cur };
      if (join.target) {
        const path = finish(st, join.target);
        if (path) return path;
        continue;
      }
      queue.push(st);
    }
  }
  return null;
}

const pathRules = (opts: TrenchOptions, needTurn = true): PathRules => ({ maxStraight: opts.maxStraightRun, needTurn });

function connectLine(net: Network, rng: Rng, line: DeploymentLine, maxCells: number, opts: TrenchOptions): boolean {
  const inward = OPPOSITE[line.side];
  const own = new Set(line.cells.map((cell) => cellKey(cell.c, cell.r)));
  const junctions =
    line.variant === "full"
      ? rng.shuffle(line.cells.slice(1, -1))
      : [line.variant === "from-low" ? line.cells[line.cells.length - 1]! : line.cells[0]!];
  for (const junction of junctions) {
    const path = connect(net, rng, junction, inward, own, maxCells, undefined, pathRules(opts, false));
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

/** Line cells that can take a communication trench toward the zone's inside: the interior for a full line, the inner end otherwise. */
const junctionCandidates = (net: Network, line: DeploymentLine): Cell[] => junctionsOf(line).filter((cell) => net.openingCount(cell.c, cell.r) < 3);

function addLine(net: Network, track: DeploymentTrack, plan: LinePlan): { line: DeploymentLine; exits: EdgeOpening[] } {
  return addCells(net, track, lineCells(track, plan), plan.variant, plan.jog);
}

/** Lays given line cells (path order from the track's low end) with exits where they reach the track's ends. */
function addCells(net: Network, track: DeploymentTrack, cells: Cell[], variant: DeploymentLine["variant"], jog: number | null): { line: DeploymentLine; exits: EdgeOpening[] } {
  const n = track.cells.length;
  for (const cell of cells) net.add(cell.c, cell.r);
  const exits: EdgeOpening[] = [];
  const at = (i: number) => cells.some((cell) => cell.c === track.cells[i]!.c && cell.r === track.cells[i]!.r);
  if (variant !== "from-high" && at(0)) exits.push({ ...track.cells[0]!, dir: lowDir(track.along) });
  if (variant !== "from-low" && at(n - 1)) exits.push({ ...track.cells[n - 1]!, dir: highDir(track.along) });
  net.exits.push(...exits);
  return { line: { zoneLabel: track.zoneLabel, player: track.player, side: track.side, cells, variant, jog, commCells: [] }, exits };
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
  if (opts.parity && opts.parity.kind !== "none") return layTwinLines(net, rng, opts, lines, opts.parity);
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
      cross = connect(net, rng, junction, OPPOSITE[ta.side], own, width + 6, (t) => targets.has(cellKey(t.c, t.r)), pathRules(opts));
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
        .map((junction) => connect(net, rng, junction, OPPOSITE[ta.side], own, width + 2, (t) => lb.line.cells.some((x) => x.c === t.c && x.r === t.r), pathRules(opts)))
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

const key = (cell: Cell) => cellKey(cell.c, cell.r);

/**
 * Twin deployment lines: line B is line A's image under the parity, so both
 * players get the same length, shape, jog and junctions. Under a mirror the
 * cross trench is its own image (a meander with jogs at mirrored columns);
 * under point symmetry a pair of cross trenches, each the other's image, joins
 * them, or one where the pair cannot fit. A mirror needs full-length lines to
 * reach both board edges.
 */
function layTwinLines(net: Network, rng: Rng, opts: TrenchOptions, lines: DeploymentLine[], parity: Parity): number | null {
  const g = net.grid;
  const tracks = [...opts.tracks].sort((a, b) => (sideOf(parity, a.cells[0]!.c * g.cellIn + g.cellIn / 2, a.cells[0]!.r * g.cellIn + g.cellIn / 2) === "A" ? -1 : 1) - (sideOf(parity, b.cells[0]!.c * g.cellIn + g.cellIn / 2, b.cells[0]!.r * g.cellIn + g.cellIn / 2) === "A" ? -1 : 1));
  const [ta, tb] = tracks as [DeploymentTrack, DeploymentTrack];
  const n = tb.cells.length;
  const width = Math.abs(ta.along === "y" ? ta.cells[0]!.c - tb.cells[0]!.c : ta.cells[0]!.r - tb.cells[0]!.r);
  const indexIn = (track: DeploymentTrack, cell: Cell) => track.cells.findIndex((x) => x.c === cell.c && x.r === cell.r);
  for (const plan of linePlans(net, rng, ta, opts).filter((p) => parity.kind === "point" || p.variant === "full").slice(0, 12)) {
    const cellsA = lineCells(ta, plan);
    const mapped = cellsA.map((cell) => mapCell(parity, g, cell));
    if (!mapped.every((cell) => net.free(cell.c, cell.r) && net.trenchNeighbours(cell.c, cell.r).length === 0)) continue;
    // B's path runs from its own low end, which is A's high end under a point turn.
    const onTrack = mapped.map((cell) => indexIn(tb, cell)).filter((i) => i >= 0);
    const lo = Math.min(...onTrack);
    const hi = Math.max(...onTrack);
    const cellsB = indexIn(tb, mapped[0]!) === lo ? mapped : [...mapped].reverse();
    const variant: DeploymentLine["variant"] = lo === 0 && hi === n - 1 ? "full" : lo === 0 ? "from-low" : "from-high";
    const jogB = plan.jog === null ? null : Math.min(...[plan.jog, plan.jog + JOG_SPAN].map((i) => indexIn(tb, mapCell(parity, g, ta.cells[i]!))));
    const la = addLine(net, ta, plan);
    const lb = addCells(net, tb, cellsB, variant, jogB);
    let cross = parity.kind === "point" ? (layCrossPair(net, rng, la.line, lb.line, ta, parity, width, opts) ?? layCrossSingle(net, rng, la.line, lb.line, ta, width, opts, parity)) : layMeanderCross(net, rng, la.line, lb.line, ta, parity, false);
    if (cross === null) {
      // Where no bend fits between the covers, a straight cross trench still joins the lines; the board says so.
      cross = parity.kind === "point" ? layCrossSingle(net, rng, la.line, lb.line, ta, width, opts, parity, false) : layMeanderCross(net, rng, la.line, lb.line, ta, parity, true);
      if (cross !== null) net.straightCross = true;
    }
    if (cross !== null) {
      lines.push(la.line, lb.line);
      return cross;
    }
    removeLine(net, lb);
    removeLine(net, la);
  }
  return null;
}

/**
 * The cross trench under a mirror: from a junction on line A it runs inward,
 * jogging one cell aside now and then, to the centre column, and on as its own
 * mirror image to the matching junction on line B. Every candidate (junction,
 * jog pattern) that fits is weighed, more jogs a little more often, so it
 * meanders rather than running dead straight; `straight` asks for the one
 * pattern without a jog instead. Null when none fits.
 */
function layMeanderCross(net: Network, rng: Rng, la: DeploymentLine, lb: DeploymentLine, ta: DeploymentTrack, parity: Parity, straight: boolean): number | null {
  const g = net.grid;
  const inward = OPPOSITE[ta.side];
  const alongX = inward === "E" || inward === "W";
  const span = alongX ? g.cols : g.rows;
  const across = alongX ? g.rows : g.cols;
  const mid = (span - 1) / 2;
  if (!Number.isInteger(mid)) return null;
  // Local coordinates: u steps inward from A's edge, v runs across.
  const uOf = (cell: Cell) => (alongX ? (inward === "E" ? cell.c : g.cols - 1 - cell.c) : inward === "N" ? cell.r : g.rows - 1 - cell.r);
  const vOf = (cell: Cell) => (alongX ? cell.r : cell.c);
  const cellAt = (u: number, v: number): Cell => (alongX ? { c: inward === "E" ? u : g.cols - 1 - u, r: v } : { c: v, r: inward === "N" ? u : g.rows - 1 - u });
  const lineB = new Set(lb.cells.map(key));
  const candidates: { item: Cell[]; weight: number }[] = [];
  for (const j of junctionCandidates(net, la)) {
    const u0 = uOf(j) + 1;
    const v0 = vOf(j);
    if (u0 > mid) continue;
    const steps = mid - u0; // columns before the centre that may jog
    const patterns: number[][] = [[]];
    for (let i = 0; i < steps; i++) patterns.splice(0, patterns.length, ...patterns.flatMap((p) => [0, 1, -1].map((d) => [...p, d])));
    for (const pattern of patterns) {
      if (pattern.some((d) => d !== 0) === straight) continue;
      const half: Cell[] = [];
      let v = v0;
      let ok = true;
      for (let i = 0; i < steps && ok; i++) {
        const u = u0 + i;
        half.push(cellAt(u, v));
        if (pattern[i] !== 0) {
          v += pattern[i]!;
          if (v < 1 || v > across - 2) ok = false;
          half.push(cellAt(u, v));
        }
      }
      if (!ok) continue;
      const centre = cellAt(mid, v);
      const path = [...half, centre, ...[...half].reverse().map((cell) => mapCell(parity, g, cell))];
      const end = mapCell(parity, g, j);
      if (!lineB.has(key(end))) continue;
      if (!crossFits(net, path, j, end)) continue;
      candidates.push({ item: path, weight: 1 + pattern.filter((d) => d !== 0).length });
    }
  }
  const pick = rng.weightedOrder(candidates)[0];
  if (!pick) return null;
  for (const cell of pick) net.add(cell.c, cell.r);
  la.commCells = pick;
  return pick.length;
}

/** A cross trench path fits when its cells are free, touch only their path neighbours and its two junctions, and form no 2x2 block. */
function crossFits(net: Network, path: Cell[], from: Cell, to: Cell): boolean {
  const keys = new Set(path.map(key));
  if (keys.size !== path.length) return false;
  for (let i = 0; i < path.length; i++) {
    const cell = path[i]!;
    if (!net.free(cell.c, cell.r) || isEdgeCell(net.grid, cell.c, cell.r)) return false;
    const allowed = new Set([...(i > 0 ? [key(path[i - 1]!)] : [key(from)]), ...(i < path.length - 1 ? [key(path[i + 1]!)] : [key(to)])]);
    for (const n of neighbours(net.grid, cell.c, cell.r)) {
      const k = cellKey(n.c, n.r);
      if ((net.has(n.c, n.r) || keys.has(k)) && !allowed.has(k)) return false;
    }
  }
  if (Math.abs(path[0]!.c - from.c) + Math.abs(path[0]!.r - from.r) !== 1) return false;
  const last = path[path.length - 1]!;
  if (Math.abs(last.c - to.c) + Math.abs(last.r - to.r) !== 1) return false;
  if (net.openingCount(from.c, from.r) >= 3 || net.openingCount(to.c, to.r) >= 3) return false;
  const added: Cell[] = [];
  let ok = true;
  for (const cell of path) {
    if (net.makes2x2(cell.c, cell.r)) {
      ok = false;
      break;
    }
    net.add(cell.c, cell.r);
    added.push(cell);
  }
  for (const cell of added) net.remove(cell.c, cell.r);
  return ok;
}

const interior = (net: Network, line: DeploymentLine): Cell[] => line.cells.filter((cell) => net.openingCount(cell.c, cell.r) === 2 && !net.exitsAt(cell.c, cell.r).length);

function layCrossPair(net: Network, rng: Rng, la: DeploymentLine, lb: DeploymentLine, ta: DeploymentTrack, parity: Parity, width: number, opts: TrenchOptions): number | null {
  const g = net.grid;
  const own = new Set(la.cells.map(key));
  for (const j of rng.shuffle(junctionsOf(la)).slice(0, 6)) {
    const tj = mapCell(parity, g, j);
    const targets = new Set(interior(net, lb).filter((t) => !(t.c === tj.c && t.r === tj.r)).map(key));
    const path = connect(net, rng, j, OPPOSITE[ta.side], own, width + 6, (t) => targets.has(key(t)), pathRules(opts));
    if (!path) continue;
    for (const cell of path) net.add(cell.c, cell.r);
    const last = path[path.length - 1]!;
    const t = net.trenchNeighbours(last.c, last.r).find((x) => targets.has(key(x)))!;
    const tt = mapCell(parity, g, t);
    const twin = path.map((cell) => mapCell(parity, g, cell));
    const allowed = new Set([...twin.map(key), key(tj), key(tt)]);
    let ok = twin.every((cell) => net.free(cell.c, cell.r) && !path.some((x) => Math.abs(x.c - cell.c) + Math.abs(x.r - cell.r) <= 1));
    ok &&= net.openingCount(tj.c, tj.r) < 3 && net.openingCount(tt.c, tt.r) === 2 && !(tt.c === j.c && tt.r === j.r);
    const added: Cell[] = [];
    if (ok) {
      for (const cell of twin) {
        if (net.makes2x2(cell.c, cell.r)) {
          ok = false;
          break;
        }
        net.add(cell.c, cell.r);
        added.push(cell);
      }
    }
    ok &&= twin.every((cell) => net.trenchNeighbours(cell.c, cell.r).every((x) => allowed.has(key(x))));
    ok &&= [j, tj, t, tt].every((cell) => net.openingCount(cell.c, cell.r) <= 3);
    if (ok) {
      la.commCells = path;
      lb.commCells = twin;
      return path.length;
    }
    for (const cell of added) net.remove(cell.c, cell.r);
    for (const cell of path) net.remove(cell.c, cell.r);
  }
  return null;
}

function layCrossSingle(net: Network, rng: Rng, la: DeploymentLine, lb: DeploymentLine, ta: DeploymentTrack, width: number, opts: TrenchOptions, parity: Parity | null = null, needTurn = true): number | null {
  const own = new Set(la.cells.map(key));
  const ends = (line: DeploymentLine) => (line.variant === "full" ? [] : junctionsOf(line));
  const needB = ends(lb);
  const targets = new Set((needB.length ? needB : interior(net, lb)).map(key));
  // Twin lines meet the cross trench at mirrored cells, so their junctions match as their cells do.
  const meets = (j: Cell): Set<string> => (parity && parity.kind !== "none" ? new Set([key(mapCell(parity, net.grid, j))].filter((k) => targets.has(k))) : targets);
  const junctions = rng.shuffle(junctionsOf(la)).filter((j) => meets(j).size > 0);
  for (const j of junctions.slice(0, 8)) {
    const wanted = meets(j);
    const path = connect(net, rng, j, OPPOSITE[ta.side], own, width + 6, (t) => wanted.has(key(t)), pathRules(opts, needTurn));
    if (!path) continue;
    for (const cell of path) net.add(cell.c, cell.r);
    la.commCells = path;
    return path.length;
  }
  return null;
}

// ---- branches -----------------------------------------------------------

type BranchEnd = { kind: "exit"; exit: EdgeOpening } | { kind: "loop" };

function branchStep(net: Network, rng: Rng, opts: TrenchOptions, path: Cell[], lastDir: Dir, search: Search, run = 1): BranchEnd | null {
  const cur = path[path.length - 1]!;
  if (path.length >= opts.branchMaxLen) return null;
  if (++search.expansions > search.budget) return null;
  const order = rng.weightedOrder([
    { item: lastDir, weight: 0.5 },
    { item: rotateDir(lastDir, -1), weight: 0.25 },
    { item: rotateDir(lastDir, 1), weight: 0.25 },
  ]);
  for (const dir of order) {
    const nextRun = dir === lastDir ? run + 1 : 1;
    if (nextRun > opts.maxStraightRun + 1) continue;
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
      const end = branchStep(net, rng, opts, path, dir, search, nextRun);
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
    const path = layMirrorSpine(net, rng, opts) ?? layMainPath(net, rng, opts);
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
  if (net.straightCross) warnings.push("the cross trench runs straight: no jog fits between the covers");
  return { axis, mode: opts.mode, cells, start, end, exits: [...net.exits], mainPathLength, branches, loops, deploymentLines: lines, straightCross: net.straightCross, warnings };
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
