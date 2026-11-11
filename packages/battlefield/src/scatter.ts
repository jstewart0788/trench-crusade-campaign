import { cellCentre, DELTA, DIRS, inGrid, rectArea, rectDistance, rectFromCentre, rectInside, rectOverlapArea, rectPointDistance, type Cell, type Rect } from "./grid.js";
import { drawFacing, extendsRow, facingOf, facingYaw, HEAP_PREFIX, linesUp, looksOf, makePlaced, pickPlaceable, pickTwin, placeablesIn, rectAllowed, SCATTER_WEIGHTS, twinDraw, wallAxis, wallClear, type FacingDraw, type Hill, type Placeable, type PlaceableMember, type Placed, type PlacementContext, type Plateau } from "./dressing.js";
import { pieceById, turnedRect, type RotYSense } from "./palette.js";
import { mapPoint, mapRotY, sideOf } from "./parity.js";

// Scattered terrain (p64), placed the way a table is dressed by hand (Jonathan,
// live review of seed 4): in heaps of two to six pieces at any angle, touching
// or leaning on each other, at spots that mean something on the battlefield,
// never on a grid. Each heap keeps a model-base gap (1in) from every other heap
// and from terrain pieces, trenches and raised ground, so lanes stay walkable;
// inside a heap the pieces may touch. Heaps come in mirrored pairs: the twin
// stands at the mirrored spot in the mirrored arrangement, its pieces swapped
// for others of the same kind where that still fits.

export type ScatterRole = "cover" | "trench" | "objective" | "raised" | "lane" | "open";

/** Why a scatter heap stands where it does. */
export const SCATTER_ROLES: readonly ScatterRole[] = ["cover", "trench", "objective", "raised", "lane", "open"];

// What each role heaps up, weighted: low cover where a model would crouch or a lane needs breaking.
const ROLE_CATEGORIES: Record<ScatterRole, Record<string, number>> = {
  cover: { "scatter-sandbag": 3, "scatter-crate": 2, "scatter-barrel": 1 },
  trench: { "scatter-sandbag": 3, "scatter-crate": 2, "scatter-debris": 1 },
  objective: { "scatter-sandbag": 3, "scatter-crate": 2, "scatter-rubble": 1 },
  raised: { "scatter-sandbag": 2, "scatter-crate": 2, "scatter-rubble": 1, "scatter-barrel": 1 },
  lane: { "scatter-sandbag": 3, "scatter-crate": 2, "scatter-wire": 2 },
  open: SCATTER_WEIGHTS,
};

// Share of the scatter budget each role may take before the open ground gets the rest.
const ROLE_BUDGET: Record<Exclude<ScatterRole, "open">, number> = { cover: 0.25, trench: 0.2, objective: 0.15, raised: 0.1, lane: 0.15 };

const HEAP_MEMBER_MAX_IN = 2.8;
const HEAP_MAX_EXTENT_IN = 6;
/** Pieces in a heap may overlap by up to this share of the smaller one's footprint: they lean on each other. */
const HEAP_OVERLAP = 0.3;
/** A clear sight line longer than this between the deployment zones gets low cover partway down it. */
export const LANE_BREAK_IN = 18;

interface Member {
  piece: Placeable;
  yaw: number;
  at: [number, number];
  sense: RotYSense;
  /** Defensive cover: its seeded facing, turned to the threat where the heap finally stands. */
  draw?: FacingDraw;
}

const box = (m: Member): Rect => turnedRect(m.at[0], m.at[1], m.piece, m.yaw, m.sense);

const bounds = (rs: readonly Rect[]): Rect => ({ x0: Math.min(...rs.map((r) => r.x0)), y0: Math.min(...rs.map((r) => r.y0)), x1: Math.max(...rs.map((r) => r.x1)), y1: Math.max(...rs.map((r) => r.y1)) });

/** A heap's members may touch and lean but not swallow each other. */
function membersFit(members: readonly Member[]): boolean {
  const rects: Rect[] = [];
  for (const m of members) {
    const next = box(m);
    if (!joins(rects, next)) return false;
    rects.push(next);
  }
  return true;
}

/** Whether one more piece can join a heap's pieces: overlapping none too far, the heap staying within its reach. */
function joins(rects: readonly Rect[], next: Rect): boolean {
  for (const r of rects) if (rectOverlapArea(r, next) > HEAP_OVERLAP * Math.min(rectArea(r), rectArea(next))) return false;
  const b = bounds([...rects, next]);
  return b.x1 - b.x0 <= HEAP_MAX_EXTENT_IN && b.y1 - b.y0 <= HEAP_MAX_EXTENT_IN;
}

/** A heap as a placeable: members at offsets from the centre of their bounds, each at its own yaw. */
function asPlaceable(members: readonly Member[], category: string): Placeable {
  const b = bounds(members.map(box));
  const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  const lead = members[0]!.piece;
  return {
    key: `${HEAP_PREFIX}${members.map((m) => m.piece.key).join("+")}`,
    role: "scatter",
    category,
    aesthetics: lead.aesthetics,
    scatter: true,
    footprintIn: [b.x1 - b.x0, b.y1 - b.y0],
    heightIn: Math.max(...members.map((m) => m.piece.heightIn)),
    members: members.map((m): PlaceableMember => ({ pieceId: m.piece.members[0]!.pieceId, at: [m.at[0] - cx, m.at[1] - cy], rotY: m.yaw })),
    cells: null,
  };
}

/**
 * One to six small pieces from the role's kinds at any yaw, each set beside one
 * already down at a distance this heap draws for itself (tight or loose), so no
 * two heaps read the same.
 */
const heapKinds = new WeakMap<(p: Placeable) => boolean, Map<ScatterRole, [string, number][]>>();

function organicHeap(ctx: PlacementContext, role: ScatterRole, fits: (p: Placeable) => boolean, count: number, at: readonly [number, number]): { members: Member[]; category: string } | null {
  const kinds = heapKinds.get(fits) ?? new Map<ScatterRole, [string, number][]>();
  heapKinds.set(fits, kinds);
  if (!kinds.has(role)) kinds.set(role, Object.entries(ROLE_CATEGORIES[role]).filter(([c]) => placeablesIn(ctx.palette, c).some((p) => fits(p) && Math.max(...p.footprintIn) <= HEAP_MEMBER_MAX_IN)));
  const weights = kinds.get(role)!;
  if (!weights.length) return null;
  const pick = () => ctx.rng.weightedOrder(weights.map(([item, weight]) => ({ item, weight })))[0]!;
  // A heap within reach of a ruin, building, tower or raised ground leaves its barricades out (palette.adjacency).
  const nearFace = besideFace(ctx, at);
  const small = (p: Placeable) => fits(p) && p.members.length === 1 && Math.max(...p.footprintIn) <= HEAP_MEMBER_MAX_IN && !(nearFace && pieceById(ctx.palette, p.members[0]!.pieceId).wall);
  const category = pick();
  const first = pickPlaceable(ctx, category, [], small);
  if (!first) return null;
  const sense = ctx.palette.rotation.rotYSense;
  // Sandbags and barricades face the threat from where the heap stands (turned again where it settles); the rest lie at any angle.
  const facingMember = (piece: Placeable, offset: [number, number]): Member => {
    const facing = facingOf(ctx.palette, piece);
    if (!facing) return { piece, yaw: ctx.rng.next() * 360, at: offset, sense };
    const draw = drawFacing(ctx.rng);
    return { piece, yaw: facingYaw(ctx, facing, Math.max(...piece.footprintIn), [at[0] + offset[0], at[1] + offset[1]], draw), at: offset, sense, draw };
  };
  const members: Member[] = [facingMember(first, [0, 0])];
  const rects = [box(members[0]!)];
  const tightness = 0.55 + ctx.rng.next() * 0.45;
  const radius = (p: Placeable) => (p.footprintIn[0] + p.footprintIn[1]) / 4;
  for (let tries = 0; members.length < count && tries < count * 8; tries++) {
    const piece = pickPlaceable(ctx, ctx.rng.chance(0.65) ? category : pick(), members.map((m) => m.piece.key), small);
    if (!piece) continue;
    const anchor = ctx.rng.pick(members);
    const angle = ctx.rng.next() * Math.PI * 2;
    const dist = (radius(anchor.piece) + radius(piece)) * tightness * (0.75 + ctx.rng.next() * 0.35);
    const next = facingMember(piece, [anchor.at[0] + Math.cos(angle) * dist, anchor.at[1] + Math.sin(angle) * dist]);
    const rect = box(next);
    if (!joins(rects, rect)) continue;
    members.push(next);
    rects.push(rect);
  }
  return { members, category };
}

/**
 * The twin heap: the mirrored arrangement, each piece swapped for another of
 * its kind with the nearest footprint where the heap still holds together.
 */
function twinHeap(ctx: PlacementContext, members: readonly Member[], fits: (p: Placeable) => boolean): Member[] {
  const origin = mapPoint(ctx.parity, 0, 0);
  const mirrored = members.map((m): Member => {
    const [x, y] = mapPoint(ctx.parity, m.at[0], m.at[1]);
    return { ...m, yaw: mapRotY(ctx.parity, m.yaw), at: [x - origin[0], y - origin[1]] };
  });
  const out = [...mirrored];
  // A swapped piece whose line runs the other way at rotY 0 turns a quarter, so it faces as the mirrored one does.
  const lineAxis = (p: Placeable) => wallAxis(ctx.palette, pieceById(ctx.palette, p.members[0]!.pieceId), 0);
  for (let i = 0; i < out.length; i++) {
    const swap = pickTwin(ctx, out[i]!.piece.category, out[i]!.piece, (p) => fits(p) && p.members.length === 1 && Math.max(...p.footprintIn) <= HEAP_MEMBER_MAX_IN);
    if (!swap || swap === out[i]!.piece) continue;
    const turn = facingOf(ctx.palette, swap) && lineAxis(swap) !== lineAxis(out[i]!.piece) ? 90 : 0;
    const trial = out.map((m, k) => (k === i ? { ...m, piece: swap, yaw: (m.yaw + turn) % 360 } : m));
    if (membersFit(trial)) out[i] = trial[i]!;
  }
  return out;
}

const shifted = (members: readonly Member[], centre: readonly [number, number]): Rect[] => members.map((m) => box({ ...m, at: [m.at[0] + centre[0], m.at[1] + centre[1]] }));

interface PlaceContext {
  ctx: PlacementContext;
  fits: (p: Placeable) => boolean;
  twinned: boolean;
  out: Placed[];
}

/** Whether a heap's member boxes, set about `centre`, keep every scatter rule. */
function heapAllowed(ctx: PlacementContext, rects: readonly Rect[]): boolean {
  const board: Rect = { x0: ctx.edgeMarginIn, y0: ctx.edgeMarginIn, x1: ctx.grid.boardIn - ctx.edgeMarginIn, y1: ctx.grid.boardIn - ctx.edgeMarginIn };
  return rects.every((r) => rectInside(r, board) && rectAllowed(ctx, r, "scatter", { scatter: true }));
}

/**
 * Lays a heap of the role's kind with its centre at `centre` (on side A when
 * the board is twinned) and its twin at the mirrored spot. The heap's size is
 * drawn by the caller. Returns the placed heaps, or [] when they do not fit.
 */
function placeHeapAt(pc: PlaceContext, role: ScatterRole, spot: Spot, fewest = 1): Placed[] {
  const { ctx } = pc;
  // A heap that does not fit is drawn again, then shrinks a piece at a time.
  for (let count = spot.count; count >= fewest; count--) {
    for (let draw = 0; draw < (count > 1 ? 3 : 4); draw++) {
      const drawn = organicHeap(ctx, role, pc.fits, count, spot.at);
      if (!drawn) return [];
      // A heap that could not gather its pieces comes back smaller.
      if (drawn.members.length < fewest) continue;
      const heap = { ...drawn, members: centred(drawn.members) };
      const twinMembers = pc.twinned ? twinHeap(ctx, heap.members, pc.fits) : [];
      // The heap settles near its spot: backed off along `away` (out from a wall or a trench lip) or nudged about it.
      for (let k = 0; k < (role === "open" ? 3 : 6); k++) {
        const shift: [number, number] = spot.away ? [spot.away[0] * 0.35 * k, spot.away[1] * 0.35 * k] : k === 0 ? [0, 0] : [(ctx.rng.next() - 0.5) * 0.6 * k, (ctx.rng.next() - 0.5) * 0.6 * k];
        const centre: [number, number] = [spot.at[0] + shift[0], spot.at[1] + shift[1]];
        if (pc.twinned && !onSideA(ctx, ...centre)) continue;
        const members = faced(ctx, heap.members, centre, false);
        if (members !== heap.members && !membersFit(members)) continue;
        const rects = shifted(members, centre);
        if (!heapAllowed(ctx, rects)) continue;
        let twin: Rect[] | null = null;
        const tcentre = mapPoint(ctx.parity, centre[0], centre[1]);
        const twinFaced = pc.twinned ? faced(ctx, twinMembers, tcentre, true) : [];
        if (pc.twinned && twinFaced !== twinMembers && !membersFit(twinFaced)) continue;
        if (pc.twinned) {
          const trects = shifted(twinFaced, tcentre);
          if (rects.some((a) => trects.some((b) => rectDistance(a, b) < ctx.scatterGapIn))) continue;
          if (!heapAllowed(ctx, trects)) continue;
          twin = trects;
        }
        if (heap.members.length === 1 && (extendsRow(ctx, centreOf(rects)) || (twin && extendsRow(ctx, centreOf(twin), centreOf(rects))))) continue;
        if (linesUp(ctx, [{ at: centreOf(rects), scatter: true }, ...(twin ? [{ at: centreOf(twin), scatter: true }] : [])])) continue;
        if (!wallsClear(ctx, members, rects, twin ? twinFaced : [], twin ?? [])) continue;
        return commitHeaps(ctx, role, { members, rects, category: heap.category }, twin ? { members: twinFaced, rects: twin, category: heap.category } : null);
      }
    }
  }
  return [];
}

/** A heap's defensive cover turned to face the threat from where each piece stands, the twin's with the mirrored lean; the same members when none faces. */
function faced(ctx: PlacementContext, members: readonly Member[], centre: readonly [number, number], twin: boolean): readonly Member[] {
  if (!members.some((m) => m.draw)) return members;
  return members.map((m) => {
    const facing = m.draw ? facingOf(ctx.palette, m.piece) : null;
    if (!facing) return m;
    const draw = twin ? twinDraw(ctx.parity, m.draw!) : m.draw!;
    return { ...m, yaw: facingYaw(ctx, facing, Math.max(...m.piece.footprintIn), [centre[0] + m.at[0], centre[1] + m.at[1]], draw) };
  });
}

/** Whether a point lies within reach of a face a barricade keeps clear of: a heap there could not hold one. */
function besideFace(ctx: PlacementContext, at: readonly [number, number]): boolean {
  const adj = ctx.palette.adjacency;
  const reach = adj.clearIn + HEAP_MAX_EXTENT_IN / 2;
  return ctx.placed.some((p) => (p.kind === "feature" ? adj.keepFrom.includes("raised") : p.placeable !== null && !p.scatter && adj.keepFrom.includes(p.role)) && p.rects.some((r) => rectPointDistance(r, at[0], at[1]) < reach));
}

/** Barricades in a heap keep the walls' adjacency rule; the twin heap's against the first's as well. */
function wallsClear(ctx: PlacementContext, members: readonly Member[], rects: readonly Rect[], twinMembers: readonly Member[], twinRects: readonly Rect[]): boolean {
  const walls = (ms: readonly Member[], rs: readonly Rect[]) => ms.map((m, i) => ({ piece: pieceById(ctx.palette, m.piece.members[0]!.pieceId), rect: rs[i]!, yaw: m.yaw })).filter((w) => w.piece.wall);
  const first = walls(members, rects);
  if (!first.every((w) => wallClear(ctx, w.piece, w.rect, w.yaw))) return false;
  const also = first.map((w) => ({ rect: w.rect, axis: wallAxis(ctx.palette, w.piece, w.yaw) }));
  return walls(twinMembers, twinRects).every((w) => wallClear(ctx, w.piece, w.rect, w.yaw, also));
}

/** Members moved so the centre of their bounds sits at the origin. */
function centred(members: readonly Member[]): Member[] {
  const b = bounds(members.map(box));
  const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  return members.map((m) => ({ ...m, at: [m.at[0] - cx, m.at[1] - cy] }));
}

function commitHeaps(ctx: PlacementContext, role: ScatterRole, a: { members: readonly Member[]; rects: Rect[]; category: string }, b: { members: readonly Member[]; rects: Rect[]; category: string } | null): Placed[] {
  const make = (h: { members: readonly Member[]; rects: Rect[]; category: string }, id: string, twin: string | null, side: "A" | "B" | "centre"): Placed => {
    const placeable = asPlaceable(h.members, h.category);
    const bb = bounds(h.rects);
    const at: [number, number] = [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2];
    const p = makePlaced(ctx, id, placeable, bb, 0, "scatter", { placement: role, slot: { id, category: h.category, side, twin, at, fill: placeable.key, against: null, placement: role } });
    p.rects = h.rects;
    return p;
  };
  const idA = `x-${ctx.nextId++}`;
  const idB = b ? `x-${ctx.nextId++}` : null;
  const single = ctx.parity.kind === "none" ? "A" : "centre";
  const sideA = b ? sideOf(ctx.parity, ...centreOf(a.rects)) : single;
  const out = [make(a, idA, idB, sideA === "centre" ? single : sideA)];
  // The twin holds the other half, wherever a swapped piece shifts the middle of its bounds.
  if (b && idB) out.push(make(b, idB, idA, sideA === "B" ? "A" : "B"));
  for (const p of out) {
    ctx.placed.push(p);
    for (const m of p.placeable!.members) ctx.usage.set(m.pieceId, (ctx.usage.get(m.pieceId) ?? 0) + 1);
  }
  return out;
}

const centreOf = (rects: readonly Rect[]): [number, number] => {
  const b = bounds(rects);
  return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
};

// ---- where heaps go ---------------------------------------------------------

interface Spot {
  at: [number, number];
  count: number;
  /** Unit direction away from what the heap backs onto. */
  away?: [number, number];
}

const onSideA = (ctx: PlacementContext, x: number, y: number): boolean => ctx.parity.kind === "none" || sideOf(ctx.parity, x, y) === "A";
const centreOfCell = (ctx: PlacementContext, cell: Cell): [number, number] => cellCentre(ctx.grid, cell.c, cell.r);

/**
 * Spots on the enemy-facing side of buildings, walls and other upright
 * pieces: where a model crouches to shoot. Side A looks along the sight axis
 * toward B; without parity each piece looks toward the far half.
 */
function coverSpots(ctx: PlacementContext): Spot[] {
  const alongX = ctx.sightAxis !== "y";
  const mid = ctx.grid.boardIn / 2;
  const out: Spot[] = [];
  for (const p of ctx.placed) {
    if (p.scatter || !p.placeable || p.kind === "feature" || p.base !== "ground") continue;
    if (!["building", "ruin", "cover", "tower", "landmark"].includes(p.role)) continue;
    const r = bounds(p.rects);
    const own = alongX ? p.centre[0] : p.centre[1];
    const ahead = ctx.parity.kind !== "none" || own < mid ? 1 : -1;
    for (let k = 0; k < 3; k++) {
      const depth = 1.4 + ctx.rng.next() * 0.9;
      // Along the face, the corners a little more often than the middle.
      const t = ctx.rng.chance(0.5) ? (ctx.rng.chance(0.5) ? 0.05 : 0.95) + (ctx.rng.next() - 0.5) * 0.2 : ctx.rng.next();
      const at: [number, number] = alongX
        ? [ahead > 0 ? r.x1 + 1 + depth : r.x0 - 1 - depth, r.y0 + t * (r.y1 - r.y0)]
        : [r.x0 + t * (r.x1 - r.x0), ahead > 0 ? r.y1 + 1 + depth : r.y0 - 1 - depth];
      if (onSideA(ctx, ...at)) out.push({ at, count: ctx.rng.intBetween(2, 5), away: alongX ? [ahead, 0] : [0, ahead] });
    }
  }
  return ctx.rng.shuffle(out);
}

/** Spots along trench lips facing open ground, junctions and bends more often. */
function trenchSpots(ctx: PlacementContext): Spot[] {
  const g = ctx.grid;
  const cells = ctx.trenchRects.map((r): Cell => ({ c: Math.round((r.x0 + r.x1) / 2 / g.cellIn - 0.5), r: Math.round((r.y0 + r.y1) / 2 / g.cellIn - 0.5) }));
  const isTrench = (c: number, r: number) => ctx.trenchMask.get(c, r);
  const out: { item: Spot; weight: number }[] = [];
  for (const cell of cells) {
    const open = DIRS.filter((d) => !isTrench(cell.c + DELTA[d][0], cell.r + DELTA[d][1]));
    const bend = 4 - open.length !== 2 || !(isTrench(cell.c + 1, cell.r) && isTrench(cell.c - 1, cell.r)) && !(isTrench(cell.c, cell.r + 1) && isTrench(cell.c, cell.r - 1));
    for (const dir of open) {
      const n = { c: cell.c + DELTA[dir][0], r: cell.r + DELTA[dir][1] };
      if (!inGrid(g, n.c, n.r)) continue;
      const [cx, cy] = centreOfCell(ctx, cell);
      const out1 = g.cellIn / 2 + 1.6 + ctx.rng.next() * 0.8;
      const lateral = (ctx.rng.next() - 0.5) * (g.cellIn - 1);
      const at: [number, number] = DELTA[dir][0] ? [cx + DELTA[dir][0] * out1, cy + lateral] : [cx + lateral, cy + DELTA[dir][1] * out1];
      if (onSideA(ctx, ...at)) out.push({ item: { at, count: ctx.rng.intBetween(2, 4), away: [DELTA[dir][0], DELTA[dir][1]] }, weight: bend ? 3 : 1 });
    }
  }
  return ctx.rng.weightedOrder(out);
}

/** A broken ring of low cover around each objective marker. */
function objectiveSpots(ctx: PlacementContext): Spot[] {
  const out: Spot[] = [];
  for (const o of ctx.objectives) {
    const cover = ctx.placed.find((p) => p.objectiveId === o.id);
    // Outside the cover over the marker, wherever the marker sits under it.
    const reach = cover ? Math.max(...[[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => { const r = bounds(cover.rects); return Math.hypot((i ? r.x1 : r.x0) - o.position[0], (j ? r.y1 : r.y0) - o.position[1]); })) : 1.6;
    const n = ctx.rng.intBetween(3, 4);
    const start = ctx.rng.next() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      // Gaps between the heaps: each takes a slice of the circle with room either side.
      const angle = start + (i * Math.PI * 2) / n + (ctx.rng.next() - 0.5) * 0.5;
      const r = reach + 1.8 + ctx.rng.next() * 1.2;
      const at: [number, number] = [o.position[0] + Math.cos(angle) * r, o.position[1] + Math.sin(angle) * r];
      if (onSideA(ctx, ...at)) out.push({ at, count: ctx.rng.intBetween(2, 3), away: [Math.cos(angle), Math.sin(angle)] });
    }
  }
  return ctx.rng.shuffle(out);
}

/** At the foot of raised ground and beside the feet of its ramps. */
function raisedSpots(ctx: PlacementContext, raised: readonly (Plateau | Hill)[]): Spot[] {
  const g = ctx.grid;
  const out: Spot[] = [];
  for (const group of raised) {
    const own = new Set([...group.cells, ...group.ramps.map((r) => r.cell)].map((c) => `${c.c},${c.r}`));
    for (const cell of group.cells) {
      for (const dir of DIRS) {
        const n = { c: cell.c + DELTA[dir][0], r: cell.r + DELTA[dir][1] };
        if (!inGrid(g, n.c, n.r) || own.has(`${n.c},${n.r}`) || ctx.trenchMask.get(n.c, n.r)) continue;
        const [cx, cy] = centreOfCell(ctx, cell);
        const off = g.cellIn / 2 + 1.5 + ctx.rng.next() * 0.8;
        const lateral = (ctx.rng.next() - 0.5) * (g.cellIn - 1);
        const at: [number, number] = DELTA[dir][0] ? [cx + DELTA[dir][0] * off, cy + lateral] : [cx + lateral, cy + DELTA[dir][1] * off];
        if (onSideA(ctx, ...at)) out.push({ at, count: ctx.rng.intBetween(2, 4), away: [DELTA[dir][0], DELTA[dir][1]] });
      }
    }
    for (const ramp of group.ramps) {
      const foot = { c: ramp.cell.c - DELTA[ramp.up][0], r: ramp.cell.r - DELTA[ramp.up][1] };
      const [fx, fy] = centreOfCell(ctx, foot);
      for (const side of [-1, 1]) {
        // Off the cell's centre line, so the flanks of ramps side by side do not line up along an edge.
        const off = g.cellIn / 2 + 1.2 + ctx.rng.next() * 0.8;
        const along = (ctx.rng.next() - 0.5) * 2;
        const at: [number, number] = DELTA[ramp.up][0] ? [fx + along, fy + side * off] : [fx + side * off, fy + along];
        if (onSideA(ctx, ...at)) out.push({ at, count: ctx.rng.intBetween(1, 3), away: DELTA[ramp.up][0] ? [0, side] : [side, 0] });
      }
    }
  }
  return ctx.rng.shuffle(out);
}

/**
 * Open ground: every point of a jittered one-inch grid over the half, in
 * seeded order, so the filler finds every gap without lining anything up (the
 * jitter is continuous and each heap settles about its point).
 */
function openSpots(ctx: PlacementContext): Spot[] {
  const out: Spot[] = [];
  const b = ctx.grid.boardIn;
  for (let x = ctx.edgeMarginIn + 0.25; x < b - ctx.edgeMarginIn; x += 0.5) {
    for (let y = ctx.edgeMarginIn + 0.25; y < b - ctx.edgeMarginIn; y += 0.5) {
      const at: [number, number] = [x + (ctx.rng.next() - 0.5) * 0.5, y + (ctx.rng.next() - 0.5) * 0.5];
      if (onSideA(ctx, ...at) && open(ctx, at)) out.push({ at, count: ctx.rng.intBetween(2, 5) });
    }
  }
  return ctx.rng.shuffle(out);
}

/** Whether the smallest piece could still stand at a point. */
const open = (ctx: PlacementContext, at: readonly [number, number]): boolean => rectAllowed(ctx, rectFromCentre(at[0], at[1], 0.4, 0.4), "scatter", { scatter: true });

// ---- sight lanes -------------------------------------------------------------

/** Rects that block a line of sight: standing terrain, raised ground and scatter already down. */
function sightBlockers(ctx: PlacementContext): Rect[] {
  return ctx.placed.filter((p) => p.kind === "feature" || p.scatter || (p.placeable && !["difficult", "crater", "dangerous", "wire"].includes(p.role))).flatMap((p) => p.rects);
}

/**
 * The longest clear stretch of each sight line from the near edge of A's
 * deployment zone to B's, at a few angles across the board; the stretch is
 * clear where no blocker stands within half an inch of the line.
 */
export function clearLanes(ctx: PlacementContext, blockers: readonly Rect[]): { from: [number, number]; to: [number, number]; length: number }[] {
  const zones = ctx.zones.filter((z) => z.spec.isDeployment);
  if (zones.length !== 2 || !ctx.sightAxis) return [];
  const b = ctx.grid.boardIn;
  const alongX = ctx.sightAxis === "x";
  const extent = (z: (typeof zones)[number]) => z.spec.polygon.map(([x, y]) => (alongX ? x : y));
  const [lowZone, highZone] = [...zones].sort((p, q) => Math.min(...extent(p)) - Math.min(...extent(q)));
  const u0 = Math.max(...extent(lowZone!));
  const u1 = Math.min(...extent(highZone!));
  const out: { from: [number, number]; to: [number, number]; length: number }[] = [];
  const pt = (u: number, v: number): [number, number] => (alongX ? [u, v] : [v, u]);
  for (let v = 1.5; v <= b - 1.5; v += 1.5) {
    for (const dv of [-12, -6, 0, 6, 12]) {
      const v1 = v + dv;
      if (v1 < 0.5 || v1 > b - 0.5) continue;
      const len = Math.hypot(u1 - u0, dv);
      const steps = Math.ceil(len / 0.5);
      // Only blockers near the line's own box can touch it.
      const [ax, ay] = pt(u0, v);
      const [bx, by] = pt(u1, v1);
      const near = blockers.filter((r) => r.x1 > Math.min(ax, bx) - 0.5 && r.x0 < Math.max(ax, bx) + 0.5 && r.y1 > Math.min(ay, by) - 0.5 && r.y0 < Math.max(ay, by) + 0.5);
      let runStart: number | null = null;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const [x, y] = pt(u0 + (u1 - u0) * t, v + dv * t);
        const blocked = near.some((r) => rectPointDistance(r, x, y) < 0.5);
        if (!blocked && runStart === null) runStart = t;
        if ((blocked || i === steps) && runStart !== null) {
          const tEnd = blocked ? t : 1;
          const length = (tEnd - runStart) * len;
          if (length > LANE_BREAK_IN) out.push({ from: pt(u0 + (u1 - u0) * runStart, v + dv * runStart), to: pt(u0 + (u1 - u0) * tEnd, v + dv * tEnd), length });
          runStart = null;
        }
      }
    }
  }
  return out.sort((p, q) => q.length - p.length);
}

/** Low cover partway down every sight line longer than LANE_BREAK_IN, longest first, without walling it off. */
function breakLanes(pc: PlaceContext, budget: number): Placed[] {
  const { ctx } = pc;
  const placed: Placed[] = [];
  const skipped = new Set<string>();
  for (let round = 0; round < 16 && placed.reduce((n, p) => n + p.placeable!.members.length, 0) < budget; round++) {
    const lanes = clearLanes(ctx, sightBlockers(ctx)).filter((l) => !skipped.has(l.from.map((v) => v.toFixed(1)).join(",") + l.to.map((v) => v.toFixed(1)).join(",")));
    const lane = lanes[0];
    if (!lane) break;
    let done: Placed[] = [];
    for (let attempt = 0; attempt < 6 && !done.length; attempt++) {
      const t = 0.3 + ctx.rng.next() * 0.4;
      let at: [number, number] = [lane.from[0] + (lane.to[0] - lane.from[0]) * t, lane.from[1] + (lane.to[1] - lane.from[1]) * t];
      if (!onSideA(ctx, ...at)) at = mapPoint(ctx.parity, ...at);
      done = placeHeapAt(pc, "lane", { at, count: ctx.rng.intBetween(2, 4) });
    }
    if (!done.length) skipped.add(lane.from.map((v) => v.toFixed(1)).join(",") + lane.to.map((v) => v.toFixed(1)).join(","));
    placed.push(...done);
  }
  return placed;
}

/**
 * Scattered terrain up to `pieces` objects, by role: cover on the enemy side of
 * standing pieces, along trench lips and at bends and junctions, a broken ring
 * round each objective, at the foot of raised ground and its ramps, low cover
 * partway down long sight lines, and the open ground in what is left. Heaps at
 * any angle, never on a grid; each role takes a share of the budget so none
 * crowds the others out.
 */
export function placeScatter(ctx: PlacementContext, pieces: number, raised: readonly (Plateau | Hill)[]): Placed[] {
  const looks = looksOf(ctx.aesthetic);
  // Scatter keeps to the board's look: only pieces that suit it, or suit any.
  const fits = (p: Placeable) => p.aesthetics.some((a) => looks.has(a)) && pieceById(ctx.palette, p.members[0]!.pieceId).enabled !== false;
  const pc: PlaceContext = { ctx, fits, twinned: ctx.parity.kind !== "none", out: [] };
  const objects = () => pc.out.reduce((n, p) => n + p.placeable!.members.length, 0);
  const fill = (role: Exclude<ScatterRole, "open" | "lane">, spots: Spot[], share: number) => {
    const cap = Math.min(pieces, objects() + Math.round(pieces * share));
    for (const spot of spots) {
      if (objects() >= cap) break;
      pc.out.push(...placeHeapAt(pc, role, spot));
    }
  };
  fill("cover", coverSpots(ctx), ROLE_BUDGET.cover);
  fill("objective", objectiveSpots(ctx), ROLE_BUDGET.objective);
  fill("trench", trenchSpots(ctx), ROLE_BUDGET.trench);
  fill("raised", raisedSpots(ctx, raised), ROLE_BUDGET.raised);
  pc.out.push(...breakLanes(pc, Math.round(pieces * ROLE_BUDGET.lane)));
  // Heaps take the open ground first; single pieces then go into the gaps they leave. No heap runs past the budget.
  const spots = openSpots(ctx);
  const room = () => Math.floor((pieces - objects()) / (pc.twinned ? 2 : 1));
  for (const spot of spots) {
    if (room() < 2) break;
    if (open(ctx, spot.at)) pc.out.push(...placeHeapAt(pc, "open", { ...spot, count: Math.min(spot.count, room()) }, 2));
  }
  for (const spot of spots) {
    if (room() < 1) break;
    if (open(ctx, spot.at)) pc.out.push(...placeHeapAt(pc, "open", { ...spot, count: 1 }));
  }
  return pc.out;
}

/** Scatter objects by placement role, for the board's stats. */
export function scatterByRole(placed: readonly Placed[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of placed) if (p.scatter && p.placement) out[p.placement] = (out[p.placement] ?? 0) + (p.placeable?.members.length ?? 1);
  return out;
}
