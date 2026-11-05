import { cellKey, cellRect, cellsInRect, DELTA, DIRS, inGrid, Mask, rectContains, rectDistance, rectFromCentre, rectInside, rectPointDistance, type Cell, type Dir, type Grid, type Rect } from "./grid.js";
import { mapCell, mapDir, mapPoint, mapRotY, sideOf, type Parity } from "./parity.js";
import { pieceById, rotatedFootprint, STRUCTURAL_ROLES, type Palette, type PalettePiece, type Role } from "./palette.js";
import type { Rng } from "./rng.js";
import type { ObjectiveSpec, ZoneSpec } from "./scenario.js";
import type { Axis } from "./trench.js";

// Everything that is not the trench network, laid out as slots: a category
// (by footprint and silhouette), a position and a facing. Slots come in twin
// pairs under the board's parity, so each player's half holds the same
// categories in the same places; each twin gets its own pick from the
// category within the board's aesthetic, so the halves are fair but not
// identical. Terrain pieces keep the rulebook's spacing (3in apart, 1in from
// any trench, p67); scattered terrain (p64) only keeps a model-base gap.

export interface ArchetypeSpec {
  id: string;
  name: string;
  composition: { typeId: string; count?: string; required: boolean }[];
  density: "sparse" | "medium" | "dense";
}

/** Categories that count as each rulebook terrain type, in the order the minimums try them. */
export const CATEGORIES_BY_TYPE: Record<string, string[]> = {
  "corner-ruin": ["medium-corner", "large-L-ruin"],
  "ruined-building": ["large-block-ruin"],
  "dangerous-terrain": ["wire-line"],
  "difficult-terrain": ["rubble-patch", "crater"],
  landmark: ["landmark", "wreck", "tall-tower"],
  cover: ["wall-run", "crate-stack", "emplacement"],
};

export interface CompositionTarget {
  typeId: string;
  categories: string[];
  min: number;
  target: number;
  /** Not on the archetype's pick-list; added on Jonathan's direction. */
  house: boolean;
}

const DENSITY_BONUS = { sparse: 0, medium: 1, dense: 2 } as const;

/** Per terrain type, the rulebook minimum ("2+") and the count the density aims for, plus the house cover. */
export function compositionTargets(archetype: ArchetypeSpec, houseCover: number): CompositionTarget[] {
  const out: CompositionTarget[] = [];
  for (const entry of archetype.composition) {
    const categories = CATEGORIES_BY_TYPE[entry.typeId];
    if (!categories) continue;
    const parsed = Number.parseInt(entry.count ?? "", 10);
    const min = Number.isFinite(parsed) ? parsed : 2;
    out.push({ typeId: entry.typeId, categories, min, target: min + 2 * DENSITY_BONUS[archetype.density], house: false });
  }
  if (houseCover > 0) out.push({ typeId: "cover", categories: CATEGORIES_BY_TYPE.cover!, min: 0, target: houseCover, house: true });
  return out;
}

// ---- placeables -------------------------------------------------------------

export interface PlaceableMember {
  pieceId: string;
  /** Visual centre relative to the placeable's footprint centre, at the placeable's rotY 0. */
  at: [number, number];
  rotY: number;
}

export interface Placeable {
  key: string;
  role: Role;
  category: string;
  aesthetics: string[];
  scatter: boolean;
  footprintIn: [number, number];
  heightIn: number;
  members: PlaceableMember[];
  /** Cell-aligned ground pieces (the crater tile). */
  cells: [number, number] | null;
}

export function placeableOf(palette: Palette, piece: PalettePiece): Placeable {
  const category = piece.category ?? "";
  return {
    key: piece.id,
    role: piece.role,
    category,
    aesthetics: piece.aesthetics ?? ["any"],
    scatter: palette.categories[category]?.scatter ?? false,
    footprintIn: [...piece.footprintIn],
    heightIn: piece.heightIn,
    members: [{ pieceId: piece.id, at: [0, 0], rotY: 0 }],
    cells: piece.layer === "ground" ? piece.cells : null,
  };
}

const cache = new WeakMap<Palette, Map<string, Placeable[]>>();

/** Every enabled placeable in a category: single pieces, cell-aligned ground pieces and groups. */
export function placeablesIn(palette: Palette, category: string): Placeable[] {
  let byCategory = cache.get(palette);
  if (!byCategory) {
    byCategory = new Map();
    cache.set(palette, byCategory);
  }
  const hit = byCategory.get(category);
  if (hit) return hit;
  const singles = palette.pieces.filter((p) => p.enabled && p.category === category && !STRUCTURAL_ROLES.includes(p.role)).map((p) => placeableOf(palette, p));
  const groups = palette.groups
    .filter((g) => g.category === category && g.enabled !== false)
    .map((g): Placeable => {
      const boxes = g.members.map((m) => {
        const piece = pieceById(palette, m.piece);
        const [w, d] = rotatedFootprint(piece, m.rotY);
        return { m, piece, rect: rectFromCentre(m.at[0], m.at[1], w, d) };
      });
      const x0 = Math.min(...boxes.map((b) => b.rect.x0));
      const x1 = Math.max(...boxes.map((b) => b.rect.x1));
      const y0 = Math.min(...boxes.map((b) => b.rect.y0));
      const y1 = Math.max(...boxes.map((b) => b.rect.y1));
      const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
      return {
        key: g.id,
        role: g.role,
        category,
        aesthetics: g.aesthetics,
        scatter: palette.categories[category]?.scatter ?? false,
        footprintIn: [x1 - x0, y1 - y0],
        heightIn: Math.max(...boxes.map((b) => b.piece.heightIn)),
        members: boxes.map((b) => ({ pieceId: b.piece.id, at: [b.m.at[0] - cx, b.m.at[1] - cy], rotY: b.m.rotY })),
        cells: null,
      };
    });
  const all = [...singles, ...groups];
  byCategory.set(category, all);
  return all;
}

const area = (p: Placeable): number => p.footprintIn[0] * p.footprintIn[1];

export const TALL_MIN_HEIGHT_IN = 6;
const isTall = (p: Placeable): boolean => p.heightIn >= TALL_MIN_HEIGHT_IN;

// ---- placement state ------------------------------------------------------

export type SlotSide = "A" | "B" | "centre";

export interface SlotInfo {
  id: string;
  category: string;
  side: SlotSide;
  /** The twin slot on the other half; null for a centre slot. */
  twin: string | null;
  /** Slot centre in board inches. */
  at: [number, number];
  /** The placeable filling it. */
  fill: string;
  /** The raised feature whose face it dresses. */
  against: string | null;
}

export type PlacedKind = "cover" | "feature" | "tall" | "terrain" | "scatter" | "face" | "crater-tile";

export interface Placed {
  id: string;
  role: Role;
  kind: PlacedKind;
  /** Footprints used for spacing: one rect for pieces, one per cell for features. */
  rects: Rect[];
  placeable: Placeable | null;
  centre: [number, number];
  rotY: number;
  cells: Cell[] | null;
  objectiveId: string | null;
  /** What the piece stands on. */
  base: "ground" | "plateau" | "hill";
  typeId: string | null;
  slot: SlotInfo | null;
  scatter: boolean;
  /** Face dressing: the raised feature it stands against. */
  faceOf: string | null;
}

export interface Aesthetic {
  primary: string;
  secondary: string | null;
}

export interface PlacementContext {
  grid: Grid;
  rng: Rng;
  palette: Palette;
  parity: Parity;
  aesthetic: Aesthetic;
  trenchRects: Rect[];
  trenchMask: Mask;
  zones: { spec: ZoneSpec; mask: Mask }[];
  objectives: ObjectiveSpec[];
  objectiveMask: Mask;
  /** Cells whose ground layer is not a plain tile: trench, crater tiles. */
  occupiedGround: Mask;
  /** Plateau, ramp and hill cells; free pieces never overlap them unless placed on top. */
  featureMask: Mask;
  /** Plateau cells a piece may stand on (not ramps, not a raised trench). */
  plateauTop: Mask;
  /** Ground at the foot of each ramp, kept clear so the ramp can be reached. */
  keepClear: Mask;
  /** Cells along each deployment zone's edge where its trench line runs or could run. */
  trackMask: Mask;
  placed: Placed[];
  /** Slot fills per placeable key, for the repeat cap. */
  usage: Map<string, number>;
  repeatCap: number;
  spacingIn: number;
  scatterGapIn: number;
  trenchClearanceIn: number;
  edgeMarginIn: number;
  /** The axis the deployment zones face each other along; upright pieces turn across it. */
  sightAxis: Axis | null;
  nextId: number;
}

const boardRect = (g: Grid, margin = 0): Rect => ({ x0: margin, y0: margin, x1: g.boardIn - margin, y1: g.boardIn - margin });

/** Markers are up to 40mm across (p146): covers must hold one, scatter keeps clear of one. */
export const MARKER_IN = 1.6;


export interface AllowOptions {
  coverFor?: string | null;
  onPlateau?: boolean;
  scatter?: boolean;
  faceOf?: string | null;
}

/** The placement rules for one rectangle. */
export function rectAllowed(ctx: PlacementContext, rect: Rect, role: Role, opts: AllowOptions = {}): boolean {
  if (!rectInside(rect, boardRect(ctx.grid, ctx.edgeMarginIn))) return false;
  for (const t of ctx.trenchRects) if (rectDistance(rect, t) < ctx.trenchClearanceIn) return false;
  const cells = cellsInRect(ctx.grid, rect);
  if (opts.onPlateau) {
    if (!cells.every((cell) => ctx.plateauTop.get(cell.c, cell.r))) return false;
  } else if (cells.some((cell) => ctx.featureMask.get(cell.c, cell.r))) return false;
  if (cells.some((cell) => ctx.keepClear.get(cell.c, cell.r))) return false;
  for (const p of ctx.placed) {
    if (opts.onPlateau && p.kind === "feature" && p.id.startsWith("plateau")) continue;
    const gap = opts.faceOf === p.id ? 0 : opts.scatter || p.scatter ? ctx.scatterGapIn : ctx.spacingIn;
    for (const r of p.rects) if (rectDistance(rect, r) < gap) return false;
  }
  for (const o of ctx.objectives) {
    if (o.id !== opts.coverFor && rectContains(rect, o.position[0], o.position[1])) return false;
    if (opts.scatter && rectPointDistance(rect, o.position[0], o.position[1]) < MARKER_IN) return false;
    if (o.keepOutIn > 0 && rectPointDistance(rect, o.position[0], o.position[1]) < o.keepOutIn) return false;
  }
  for (const zone of ctx.zones) {
    if (!cells.some((cell) => zone.mask.get(cell.c, cell.r))) continue;
    if (zone.spec.noTerrain) return false;
    if (zone.spec.isDeployment && role === "landmark") return false;
  }
  return true;
}

const minTrenchDistance = (ctx: PlacementContext, rect: Rect): number => ctx.trenchRects.reduce((m, t) => Math.min(m, rectDistance(rect, t)), Number.POSITIVE_INFINITY);

const edgeDistance = (g: Grid, rect: Rect): number => Math.min(rect.x0, rect.y0, g.boardIn - rect.x1, g.boardIn - rect.y1);

const UPRIGHT_ROLES: readonly Role[] = ["cover", "ruin", "building", "tower", "wire", "dangerous", "landmark"];

const band = (ctx: PlacementContext, rect: Rect): [number, number] => (ctx.sightAxis === "y" ? [rect.x0, rect.x1] : [rect.y0, rect.y1]);

function bandOverlap(ctx: PlacementContext, rect: Rect): number {
  if (!ctx.sightAxis) return 0;
  const [a0, a1] = band(ctx, rect);
  let n = 0;
  for (const p of ctx.placed) {
    if (!p.placeable || p.scatter || !UPRIGHT_ROLES.includes(p.role)) continue;
    const [b0, b1] = band(ctx, p.rects[0]!);
    n += Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / Math.max(1, a1 - a0);
  }
  return n;
}

// Where the rulebook says each type wants to be (p67): ruins, cover and wire
// hug the trench and spread across the lines of fire, craters and rubble fill
// the gaps, landmarks go anywhere.
function score(ctx: PlacementContext, rect: Rect, category: string): number {
  switch (category) {
    case "wall-run":
    case "crate-stack":
    case "medium-corner":
    case "large-L-ruin":
    case "wire-line":
    case "emplacement":
    case "large-block-ruin":
      return -Math.abs(minTrenchDistance(ctx, rect) - 2) - 1.5 * bandOverlap(ctx, rect);
    case "tall-tower":
      return -Math.abs(minTrenchDistance(ctx, rect) - 1.5);
    case "rubble-patch":
    case "crater":
      return Math.min(edgeDistance(ctx.grid, rect), 6) - bandOverlap(ctx, rect);
    default:
      return ctx.rng.next() - bandOverlap(ctx, rect);
  }
}

const ROTATIONS = [0, 90, 180, 270] as const;

/** Rotations to try, turning elongated upright pieces across the line of fire more often than along it. */
function rotationOrder(ctx: PlacementContext, placeable: Placeable): number[] {
  const [w, d] = placeable.footprintIn;
  const elongated = Math.max(w, d) > 1.3 * Math.min(w, d);
  if (!ctx.sightAxis || !elongated || !UPRIGHT_ROLES.includes(placeable.role)) return ctx.rng.shuffle(ROTATIONS);
  return ctx.rng.weightedOrder(
    ROTATIONS.map((rotY) => {
      const [rw, rd] = rotatedFootprint(placeable, rotY);
      const across = ctx.sightAxis === "x" ? rd > rw : rw > rd;
      return { item: rotY, weight: across ? 3 : 1 };
    }),
  );
}

// ---- picking ----------------------------------------------------------------

const looksOf = (a: Aesthetic): Set<string> => new Set(["any", a.primary, ...(a.secondary ? [a.secondary] : [])]);

/**
 * A seeded pick from a category: pieces that suit the board's aesthetic and
 * are under the repeat cap first, then anything in the category under the
 * cap, and only when every variant is at the cap, the least used. Pieces in
 * `avoid` (the twin's pick) are skipped while there is a choice.
 */
export function pickPlaceable(ctx: PlacementContext, category: string, avoid: readonly string[] = [], filter: (p: Placeable) => boolean = () => true): Placeable | null {
  const all = placeablesIn(ctx.palette, category).filter(filter);
  if (!all.length) return null;
  const used = (p: Placeable) => ctx.usage.get(p.key) ?? 0;
  const looks = looksOf(ctx.aesthetic);
  const styled = all.filter((p) => p.aesthetics.some((a) => looks.has(a)));
  const under = (pool: Placeable[]) => pool.filter((p) => used(p) < ctx.repeatCap);
  let pool = under(styled);
  if (!pool.length) pool = under(all);
  if (!pool.length) {
    // Past the cap only once every variant of the category has reached it.
    if (placeablesIn(ctx.palette, category).some((p) => used(p) < ctx.repeatCap)) return null;
    const least = Math.min(...all.map(used));
    pool = all.filter((p) => used(p) === least);
  }
  const fresh = pool.filter((p) => !avoid.includes(p.key));
  if (fresh.length) pool = fresh;
  const weight = (p: Placeable) => (p.scatter ? (p.heightIn >= 0.7 && p.heightIn <= 2.4 ? 2 : 1) : UPRIGHT_ROLES.includes(p.role) ? Math.min(4, Math.max(0.6, p.heightIn)) : 1);
  return ctx.rng.weightedOrder(pool.map((p) => ({ item: p, weight: weight(p) })))[0] ?? null;
}

/**
 * The twin's piece: another variant of the category (within the same picking
 * rules), the one whose footprint is nearest the first's, so both halves keep
 * the same room around it; the first piece again when there is no other.
 */
export function pickTwin(ctx: PlacementContext, category: string, first: Placeable, filter: (p: Placeable) => boolean = () => true): Placeable | null {
  const all = placeablesIn(ctx.palette, category).filter((p) => p.key !== first.key && filter(p));
  const used = (p: Placeable) => ctx.usage.get(p.key) ?? 0;
  const looks = looksOf(ctx.aesthetic);
  const under = all.filter((p) => used(p) < ctx.repeatCap);
  const styled = under.filter((p) => p.aesthetics.some((a) => looks.has(a)));
  const pool = styled.length ? styled : under;
  // The first piece again only while the pair keeps it under the cap, or once its whole category is at the cap.
  const saturated = placeablesIn(ctx.palette, category).every((p) => p.key === first.key || used(p) >= ctx.repeatCap);
  if (!pool.length) return used(first) + 2 <= ctx.repeatCap || saturated ? first : null;
  const dims = (p: Placeable) => [...p.footprintIn].sort((x, y) => x - y);
  const [a0, a1] = dims(first);
  const misfit = (p: Placeable) => {
    const [b0, b1] = dims(p);
    return Math.abs(b0! - a0!) + Math.abs(b1! - a1!);
  };
  const best = Math.min(...pool.map(misfit));
  // Within half an inch of the nearest, any will do; when even that is far off, the first again while it stays under the cap.
  const near = pool.filter((p) => misfit(p) <= best + 0.5);
  const pick = ctx.rng.pick(near);
  return misfit(pick) > a0! + a1! && used(first) + 2 <= ctx.repeatCap ? first : pick;
}

/**
 * The twin's facing: the mirrored one, turned a quarter more when the twin
 * piece lies the other way round at that facing, so its long side runs as the
 * first piece's does.
 */
export function twinFacing(parity: Parity, first: Placeable, rotY: number, twin: Placeable): number {
  const trot = mapRotY(parity, rotY);
  const [w, d] = rotatedFootprint(first, rotY);
  const [tw, td] = rotatedFootprint(twin, trot);
  const lie = (a: number, b: number) => Math.sign(Math.round((a - b) * 100));
  return lie(w, d) !== 0 && lie(tw, td) !== 0 && lie(w, d) !== lie(tw, td) ? (trot + 90) % 360 : trot;
}

// ---- twin placement -----------------------------------------------------------

function makePlaced(ctx: PlacementContext, id: string, placeable: Placeable, rect: Rect, rotY: number, kind: PlacedKind, extra: Partial<Placed> = {}): Placed {
  return {
    id,
    role: placeable.role,
    kind,
    rects: [rect],
    placeable,
    centre: [(rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2],
    rotY,
    cells: null,
    objectiveId: null,
    base: "ground",
    typeId: ctx.palette.categories[placeable.category]?.type ?? null,
    slot: null,
    scatter: placeable.scatter,
    faceOf: null,
    ...extra,
  };
}

function commitPair(ctx: PlacementContext, kind: PlacedKind, a: { placeable: Placeable; rect: Rect; rotY: number }, b: { placeable: Placeable; rect: Rect; rotY: number } | null, extra: Partial<Placed> = {}): Placed[] {
  const prefix = kind === "scatter" || kind === "face" ? "x" : "d";
  const idA = `${prefix}-${ctx.nextId++}`;
  const idB = b ? `${prefix}-${ctx.nextId++}` : null;
  const at = (r: Rect): [number, number] => [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
  const single: SlotSide = ctx.parity.kind === "none" ? "A" : "centre";
  const sideA = b ? sideOf(ctx.parity, ...at(a.rect)) : single;
  const out = [makePlaced(ctx, idA, a.placeable, a.rect, a.rotY, kind, { ...extra, slot: { id: idA, category: a.placeable.category, side: sideA, twin: idB, at: at(a.rect), fill: a.placeable.key, against: extra.faceOf ?? null } })];
  if (b) out.push(makePlaced(ctx, idB!, b.placeable, b.rect, b.rotY, kind, { ...extra, slot: { id: idB!, category: b.placeable.category, side: sideOf(ctx.parity, ...at(b.rect)), twin: idA, at: at(b.rect), fill: b.placeable.key, against: extra.faceOf ?? null } }));
  for (const p of out) {
    ctx.placed.push(p);
    const keys = p.placeable!.key.startsWith(CLUSTER_PREFIX) ? p.placeable!.members.map((m) => m.pieceId) : [p.placeable!.key];
    for (const key of keys) ctx.usage.set(key, (ctx.usage.get(key) ?? 0) + 1);
  }
  return out;
}

interface PairOptions {
  kind: PlacedKind;
  samples?: number;
  keep?: number;
  /** Extra test on side A's rect. */
  where?: (rect: Rect) => boolean;
  filter?: (p: Placeable) => boolean;
}

/**
 * Places a slot of the category and its twin: side A's centre is sampled in
 * A's half (then scanned on a 1in lattice when sampling finds too few), the
 * twin goes at the mirrored centre with the mirrored facing, and both must
 * pass the rules with each other in place. Returns the placed pair, or [].
 */
export function placePair(ctx: PlacementContext, category: string, opts: PairOptions): Placed[] {
  const a = pickPlaceable(ctx, category, [], opts.filter);
  if (!a) return [];
  const twinned = ctx.parity.kind !== "none";
  const b = twinned ? pickTwin(ctx, category, a, opts.filter) : null;
  if (twinned && !b) return [];
  const again = (ctx.usage.get(a.key) ?? 0) + 2 <= ctx.repeatCap;
  const tries: [Placeable, Placeable | null][] = b && b !== a ? [[a, b], ...(again ? ([[a, a]] as [Placeable, Placeable][]) : [])] : [[a, b]];
  const scatter = a.scatter;
  const allow = { scatter };
  for (const [pa, pb] of tries) {
    const candidates: { a: { placeable: Placeable; rect: Rect; rotY: number }; b: { placeable: Placeable; rect: Rect; rotY: number } | null; score: number }[] = [];
    const keep = opts.keep ?? (scatter ? 1 : 8);
    const margin = ctx.edgeMarginIn;
    const span = ctx.grid.boardIn - 2 * margin;
    const consider = (rotY: number, cx: number, cy: number) => {
      if (twinned && sideOf(ctx.parity, cx, cy) !== "A") return;
      const [w, d] = rotatedFootprint(pa, rotY);
      const rect = rectFromCentre(cx, cy, w, d);
      if (opts.where && !opts.where(rect)) return;
      if (!rectAllowed(ctx, rect, pa.role, allow)) return;
      let twin: { placeable: Placeable; rect: Rect; rotY: number } | null = null;
      if (pb) {
        const [tx, ty] = mapPoint(ctx.parity, cx, cy);
        const trot = twinFacing(ctx.parity, pa, rotY, pb);
        const [tw, td] = rotatedFootprint(pb, trot);
        const trect = rectFromCentre(tx, ty, tw, td);
        const gap = scatter ? ctx.scatterGapIn : ctx.spacingIn;
        if (rectDistance(rect, trect) < gap) return;
        if (!rectAllowed(ctx, trect, pb.role, allow)) return;
        twin = { placeable: pb, rect: trect, rotY: trot };
      }
      candidates.push({ a: { placeable: pa, rect, rotY }, b: twin, score: scatter ? 0 : score(ctx, rect, category) });
    };
    if (Math.max(...pa.footprintIn) > span) continue;
    const rotations = rotationOrder(ctx, pa);
    const samples = opts.samples ?? (scatter ? 40 : 120);
    for (let i = 0; i < samples && candidates.length < keep; i++) {
      const rotY = rotations[i % rotations.length]!;
      const [w, d] = rotatedFootprint(pa, rotY);
      const cx = margin + w / 2 + ctx.rng.int(Math.floor((span - w) * 2) + 1) / 2;
      const cy = margin + d / 2 + ctx.rng.int(Math.floor((span - d) * 2) + 1) / 2;
      consider(rotY, cx, cy);
    }
    if (candidates.length < keep && !scatter) {
      for (const rotY of rotations.filter((r, i) => rotations.findIndex((o) => o % 180 === r % 180) === i)) {
        const [w, d] = rotatedFootprint(pa, rotY);
        const spots: [number, number][] = [];
        for (let cx = margin + w / 2; cx <= ctx.grid.boardIn - margin - w / 2; cx += 1) for (let cy = margin + d / 2; cy <= ctx.grid.boardIn - margin - d / 2; cy += 1) if (!twinned || sideOf(ctx.parity, cx, cy) === "A") spots.push([cx, cy]);
        const start = spots.length ? ctx.rng.int(spots.length) : 0;
        for (let i = 0; i < spots.length && candidates.length < keep; i++) consider(rotY, ...spots[(start + i) % spots.length]!);
      }
    }
    if (!candidates.length) continue;
    const best = candidates.reduce((x, y) => (y.score > x.score ? y : x));
    return commitPair(ctx, opts.kind, best.a, best.b);
  }
  return [];
}

/**
 * A single piece centred on the line the halves mirror across (or on the
 * centre point, under point symmetry) is its own twin: it stands as far from
 * one player as from the other. Used when no twin pair fits.
 */
export function placeOnMirrorLine(ctx: PlacementContext, placeable: Placeable, category: string, opts: PairOptions): Placed[] {
  if (ctx.parity.kind === "none") return [];
  const mid = ctx.grid.boardIn / 2;
  const margin = ctx.edgeMarginIn;
  const best: { rect: Rect; rotY: number; score: number }[] = [];
  for (const rotY of rotationOrder(ctx, placeable)) {
    const [w, d] = rotatedFootprint(placeable, rotY);
    const centres: [number, number][] = [];
    if (ctx.parity.kind === "point") centres.push([mid, mid]);
    else for (let t = margin + (ctx.parity.kind === "mirror-x" ? d : w) / 2; t <= ctx.grid.boardIn - margin - (ctx.parity.kind === "mirror-x" ? d : w) / 2 + 1e-9; t += 0.5) centres.push(ctx.parity.kind === "mirror-x" ? [mid, t] : [t, mid]);
    for (const [cx, cy] of centres) {
      const rect = rectFromCentre(cx, cy, w, d);
      if (opts.where && !opts.where(rect)) continue;
      if (!rectAllowed(ctx, rect, placeable.role)) continue;
      best.push({ rect, rotY, score: score(ctx, rect, category) });
    }
  }
  if (!best.length) return [];
  const pick = best.reduce((x, y) => (y.score > x.score ? y : x));
  return commitPair(ctx, opts.kind, { placeable, rect: pick.rect, rotY: pick.rotY }, null);
}

/** Lays a cell-aligned ground piece (the crater tile) and its twin on free blocks clear of trenches, features and pieces. */
export function placeGroundBlockPair(ctx: PlacementContext, placeable: Placeable): Placed[] {
  if (!placeable.cells) return [];
  const [w, d] = placeable.cells;
  const twinned = ctx.parity.kind !== "none";
  const anchors: Cell[] = [];
  for (let c = 0; c + w <= ctx.grid.cols; c++) for (let r = 0; r + d <= ctx.grid.rows; r++) anchors.push({ c, r });
  const blockOf = (anchor: Cell): Cell[] => {
    const cells: Cell[] = [];
    for (let dc = 0; dc < w; dc++) for (let dr = 0; dr < d; dr++) cells.push({ c: anchor.c + dc, r: anchor.r + dr });
    return cells;
  };
  const rectOf = (cells: Cell[]): Rect => {
    const rs = cells.map((cell) => cellRect(ctx.grid, cell.c, cell.r));
    return { x0: Math.min(...rs.map((r) => r.x0)), y0: Math.min(...rs.map((r) => r.y0)), x1: Math.max(...rs.map((r) => r.x1)), y1: Math.max(...rs.map((r) => r.y1)) };
  };
  const free = (cells: Cell[]) => cells.every((cell) => !ctx.occupiedGround.get(cell.c, cell.r) && !ctx.objectiveMask.get(cell.c, cell.r) && !ctx.featureMask.get(cell.c, cell.r) && !ctx.trackMask.get(cell.c, cell.r));
  const saved = ctx.edgeMarginIn;
  ctx.edgeMarginIn = 0;
  try {
    for (const anchor of ctx.rng.shuffle(anchors)) {
      const cellsA = blockOf(anchor);
      const rectA = rectOf(cellsA);
      if (twinned && sideOf(ctx.parity, (rectA.x0 + rectA.x1) / 2, (rectA.y0 + rectA.y1) / 2) !== "A") continue;
      if (!free(cellsA) || !rectAllowed(ctx, rectA, placeable.role)) continue;
      let cellsB: Cell[] | null = null;
      if (twinned) {
        cellsB = cellsA.map((cell) => mapCell(ctx.parity, ctx.grid, cell));
        const rectB = rectOf(cellsB);
        if (!free(cellsB) || rectDistance(rectA, rectB) < ctx.spacingIn || !rectAllowed(ctx, rectB, placeable.role)) continue;
      }
      const placed = commitPair(ctx, "crater-tile", { placeable, rect: rectA, rotY: 0 }, cellsB ? { placeable, rect: rectOf(cellsB), rotY: 0 } : null);
      placed[0]!.cells = cellsA;
      if (placed[1]) placed[1].cells = cellsB;
      for (const p of placed) for (const cell of p.cells!) ctx.occupiedGround.set(cell.c, cell.r);
      return placed;
    }
  } finally {
    ctx.edgeMarginIn = saved;
  }
  return [];
}

// ---- objective covers ---------------------------------------------------------

export interface CoverChoice {
  objectiveId: string;
  placeable: Placeable;
  rotY: number;
  rect: Rect;
  /** Standing on an objective hill or the centre plateau rather than the ground. */
  base: "ground" | "plateau" | "hill";
}

export interface CoverRules {
  grid: Grid;
  parity: Parity;
  /** Largest footprint side for a cover, so the covers still leave the trench a way through. */
  maxCoverSideIn: number;
  edgeMarginIn: number;
  spacingIn: number;
  trenchClearanceIn: number;
  /** Rects the covers keep the trench clearance from (the deployment trench tracks). */
  avoid: Rect[];
  /** Footprints already fixed (raised features), which covers keep the piece spacing from. */
  pieces: Rect[];
  /** The axis the deployment zones face each other along, or null. */
  sightAxis: Axis | null;
  repeatCap: number;
}

/** The objective a point maps onto under the parity, or null. */
export function twinObjective(parity: Parity, objectives: readonly ObjectiveSpec[], o: ObjectiveSpec): ObjectiveSpec | null {
  if (parity.kind === "none") return null;
  const [x, y] = mapPoint(parity, o.position[0], o.position[1]);
  return objectives.find((t) => Math.abs(t.position[0] - x) < 1e-6 && Math.abs(t.position[1] - y) < 1e-6) ?? null;
}

const coverFits = (rect: Rect, point: readonly [number, number]): boolean => rectPointDistance({ x0: rect.x0 + 0.5, y0: rect.y0 + 0.5, x1: rect.x1 - 0.5, y1: rect.y1 - 0.5 }, point[0], point[1]) === 0;

/**
 * Picks a covering piece per objective that needs one, twin objectives
 * together: the second gets a different piece of the same category at the
 * mirrored spot. The scenario only asks that the piece covers the marker, so it
 * may sit off-centre. Each level shrinks the choice: 0 draws from the preferred
 * role (small ones more often), 1 takes that role's smallest pieces first, 2 the
 * smallest across all roles.
 */
export function chooseObjectiveCovers(palette: Palette, rng: Rng, objectives: readonly ObjectiveSpec[], fixed: readonly CoverChoice[], levels: Map<string, number>, rules: CoverRules): CoverChoice[] {
  const out: CoverChoice[] = [];
  const board = boardRect(rules.grid, rules.edgeMarginIn);
  const done = new Set(fixed.map((c) => c.objectiveId));
  const taken = () => [...fixed, ...out];
  // The repeat cap holds for covers too: a piece already on the board three times waits until its pool runs dry.
  const uses = (p: Placeable) => taken().filter((c) => c.placeable.key === p.key).length;
  const capped = (pool: Placeable[]) => {
    const fresh = pool.filter((p) => uses(p) < rules.repeatCap);
    return fresh.length ? fresh : pool;
  };
  for (const o of objectives) {
    if (!o.requiresCover || done.has(o.id)) continue;
    const twin = twinObjective(rules.parity, objectives, o);
    const pairWith = twin && twin.id !== o.id && twin.requiresCover && !done.has(twin.id) ? twin : null;
    const roles = o.preferredRoles;
    const pools = roles.map((role) => capped(coverPool(palette, role, rules))).filter((pool) => pool.length);
    if (!pools.length) continue;
    let chosen: CoverChoice[] = [];
    for (let level = levels.get(o.id) ?? 0; level <= 2 && !chosen.length; level++) {
      const candidates =
        level === 0
          ? rng.weightedOrder(pools[0]!.map((p) => ({ item: p, weight: 1 / (area(p) * area(p)) })))
          : level === 1
            ? [...pools[0]!].sort((a, b) => area(a) - area(b))
            : pools.flat().sort((a, b) => area(a) - area(b));
      chosen = placeCover(o, pairWith, candidates.slice(0, 6), capped(pools.flat()), (p) => rules.repeatCap - uses(p), level, objectives, taken(), rng, rules, board);
    }
    for (const c of chosen) {
      out.push(c);
      done.add(c.objectiveId);
    }
  }
  return out;
}

function coverPool(palette: Palette, role: Role, rules: CoverRules): Placeable[] {
  const seen = new Set<string>();
  const out: Placeable[] = [];
  for (const category of Object.keys(palette.categories)) {
    if (palette.categories[category]!.scatter) continue;
    for (const p of placeablesIn(palette, category)) {
      if (p.role !== role || p.cells || p.members.length > 1 || seen.has(p.key)) continue;
      if (Math.max(...p.footprintIn) > rules.maxCoverSideIn || Math.min(...p.footprintIn) < MARKER_IN) continue;
      seen.add(p.key);
      out.push(p);
    }
  }
  return out;
}

function placeCover(o: ObjectiveSpec, twin: ObjectiveSpec | null, candidates: Placeable[], twinPool: Placeable[], room: (p: Placeable) => number, level: number, objectives: readonly ObjectiveSpec[], chosenSoFar: readonly CoverChoice[], rng: Rng, rules: CoverRules, board: Rect): CoverChoice[] {
  const [px, py] = o.position;
  const ok = (rect: Rect, point: readonly [number, number], self: string[], others: readonly CoverChoice[]) =>
    rectInside(rect, board) &&
    coverFits(rect, point) &&
    !rules.avoid.some((a) => rectDistance(rect, a) < rules.trenchClearanceIn) &&
    !rules.pieces.some((a) => rectDistance(rect, a) < rules.spacingIn) &&
    !others.some((c) => rectDistance(rect, c.rect) < rules.spacingIn) &&
    !objectives.some((other) => !self.includes(other.id) && rectContains(rect, other.position[0], other.position[1]));
  // Thin across the line between the deployment zones, so the band each row of objectives leaves open stays deep.
  const across = (p: Placeable, rotY: number) => rotatedFootprint(p, rotY)[rules.sightAxis === "y" ? 0 : 1];
  for (const placeable of candidates) {
    for (const rotY of rng.shuffle(ROTATIONS).sort((a, b) => (rules.sightAxis ? across(placeable, a) - across(placeable, b) : 0))) {
      const [w, d] = rotatedFootprint(placeable, rotY);
      // The twin is another piece of the category with the nearest footprint, so both halves keep the same room around it.
      const misfit = (p: Placeable) => {
        const [tw, td] = rotatedFootprint(p, rotY);
        return Math.abs(tw - w) + Math.abs(td - d);
      };
      const others = rng.shuffle(twinPool.filter((p) => p.key !== placeable.key && p.category === placeable.category && room(p) > 0)).sort((a, b) => misfit(a) - misfit(b));
      // The same piece twice only while that keeps it under the repeat cap.
      const twinOrder = twin ? [...others, ...(room(placeable) >= 2 ? [placeable] : [])] : [];
      const slackX = Math.max(0, w / 2 - 0.5);
      const slackY = Math.max(0, d / 2 - 0.5);
      // Half-inch steps plus the extremes, where the marker sits just inside the cover's edge.
      const steps = (slack: number) => [...new Set([-slack, ...Array.from({ length: Math.floor(slack * 2) * 2 + 1 }, (_, i) => -Math.floor(slack * 2) / 2 + i / 2), slack].map((v) => Math.round(v * 1000) / 1000))].filter((v) => Math.abs(v) <= slack + 1e-9);
      const offsets: [number, number][] = [];
      for (const ox of steps(slackX)) for (const oy of steps(slackY)) offsets.push([ox, oy]);
      // Covers lean toward the board edge beside them and in from the
      // deployment zones, opening a lane along each zone and a band between
      // the objectives for the archetype's pieces.
      const mid = rules.grid.boardIn / 2;
      const away: [number, number] = [Math.sign(px - mid), Math.sign(py - mid)];
      const sense: [number, number] = rules.sightAxis === "x" ? [-1, 1] : rules.sightAxis === "y" ? [1, -1] : [1, 1];
      const lean = (o: [number, number]) => o[0] * away[0] * sense[0] + o[1] * away[1] * sense[1];
      const ordered = rng.shuffle(offsets).sort((a, b) => lean(b) - lean(a));
      for (const [ox, oy] of ordered) {
        const rect = rectFromCentre(px + ox, py + oy, w, d);
        if (!ok(rect, o.position, [o.id], chosenSoFar)) continue;
        const first: CoverChoice = { objectiveId: o.id, placeable, rotY, rect, base: "ground" };
        if (!twin) return [first];
        const [tx, ty] = mapPoint(rules.parity, px + ox, py + oy);
        const trot = mapRotY(rules.parity, rotY);
        for (const other of twinOrder) {
          const [tw, td] = rotatedFootprint(other, trot);
          const trect = rectFromCentre(tx, ty, tw, td);
          if (ok(trect, twin.position, [twin.id], [...chosenSoFar, first])) return [first, { objectiveId: twin.id, placeable: other, rotY: trot, rect: trect, base: "ground" }];
        }
      }
    }
  }
  return [];
}

/** Cells the trench may not use because a cover piece needs its clearance. */
export function coverKeepOut(grid: Grid, covers: readonly CoverChoice[], clearanceIn: number): Mask {
  const mask = new Mask(grid);
  for (const cover of covers) {
    for (let c = 0; c < grid.cols; c++) {
      for (let r = 0; r < grid.rows; r++) {
        if (rectDistance(cellRect(grid, c, r), cover.rect) < clearanceIn) mask.set(c, r);
      }
    }
  }
  return mask;
}

export function registerCovers(ctx: PlacementContext, covers: readonly CoverChoice[]): { placed: Placed[]; warnings: string[] } {
  const placed: Placed[] = [];
  const warnings: string[] = [];
  const idOf = (c: CoverChoice) => `o-${c.objectiveId}`;
  for (const cover of covers) {
    if (cover.base === "ground" && !rectAllowed(ctx, cover.rect, cover.placeable.role, { coverFor: cover.objectiveId })) warnings.push(`cover ${cover.placeable.key} on ${cover.objectiveId} breaks a spacing rule`);
    const o = ctx.objectives.find((x) => x.id === cover.objectiveId)!;
    const twin = twinObjective(ctx.parity, ctx.objectives, o);
    const twinCover = twin && twin.id !== o.id ? covers.find((c) => c.objectiveId === twin.id) : undefined;
    const at: [number, number] = [(cover.rect.x0 + cover.rect.x1) / 2, (cover.rect.y0 + cover.rect.y1) / 2];
    const side: SlotSide = ctx.parity.kind === "none" ? "A" : twinCover ? sideOf(ctx.parity, ...o.position) : "centre";
    const entry = makePlaced(ctx, idOf(cover), cover.placeable, cover.rect, cover.rotY, "cover", {
      objectiveId: cover.objectiveId,
      base: cover.base,
      slot: { id: idOf(cover), category: cover.placeable.category, side, twin: twinCover ? idOf(twinCover) : null, at, fill: cover.placeable.key, against: null },
    });
    ctx.placed.push(entry);
    ctx.usage.set(cover.placeable.key, (ctx.usage.get(cover.placeable.key) ?? 0) + 1);
    placed.push(entry);
  }
  return { placed, warnings };
}

// ---- raised ground: plateaus and hills ----------------------------------------

export interface Ramp {
  cell: Cell;
  /** The side the ramp climbs toward: the plateau cell it leads onto. */
  up: Dir;
}

export interface Plateau {
  id: string;
  cells: Cell[];
  ramps: Ramp[];
  raisedTrench: { cell: Cell; openings: Dir[] } | null;
}

export interface Hill {
  id: string;
  cells: Cell[];
  /** Cells carrying a second H4x4 on top (Armoured Train's stepped hills). */
  stepped: Cell[];
}

export interface RaisedPlan {
  plateaus: Plateau[];
  hills: Hill[];
  covers: CoverChoice[];
  /** Cells the trench may not use: raised cells, ramps and the ground at each ramp's foot. A trench may run along a foot. */
  keepOut: Mask;
}

interface PlanInputs {
  grid: Grid;
  rng: Rng;
  palette: Palette;
  parity: Parity;
  objectives: readonly ObjectiveSpec[];
  blocked: Mask;
  reserved: Mask;
  noTerrain: Mask;
  edgeMarginIn: number;
  trenchClearanceIn: number;
}

const rampFoot = (r: Ramp): Cell => ({ c: r.cell.c - DELTA[r.up][0], r: r.cell.r - DELTA[r.up][1] });

function usableFor(p: PlanInputs, homes: readonly Cell[], keepOtherObjectivesClear: readonly ObjectiveSpec[]) {
  return (c: number, r: number) =>
    inGrid(p.grid, c, r) &&
    !p.reserved.get(c, r) &&
    !p.noTerrain.get(c, r) &&
    (!p.blocked.get(c, r) || homes.some((home) => c === home.c && r === home.r)) &&
    !keepOtherObjectivesClear.some((o) => rectPointDistance(cellRect(p.grid, c, r), o.position[0], o.position[1]) < 4);
}

function tallCoverPool(palette: Palette): Placeable[] {
  return [...placeablesIn(palette, "large-block-ruin"), ...placeablesIn(palette, "tall-tower")].filter((p) => p.members.length === 1 && Math.min(...p.footprintIn) >= MARKER_IN);
}

const COVER_TOP_OFFSETS: [number, number][] = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2].flatMap((ox) => [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2].map((oy): [number, number] => [ox, oy]));

/**
 * A cover standing on raised cells: fits inside them, holds the marker, and
 * passes `clear` (on a one-cell-wide line, a side left a trench's clearance
 * from the edge, so the trench can still run beside it).
 */
function coverOnTop(p: PlanInputs, o: ObjectiveSpec, union: (rect: Rect) => boolean, pool: Placeable[], avoid: string[] = [], clear: (rect: Rect) => boolean = () => true): CoverChoice | null {
  const rank = (x: Placeable) => Number(avoid.includes(x.key)) * 2 + Number(!o.preferredRoles.includes(x.role));
  const offsets = p.rng.shuffle(COVER_TOP_OFFSETS).sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  for (const placeable of p.rng.shuffle(pool).sort((a, b) => rank(a) - rank(b))) {
    for (const rotY of p.rng.shuffle(ROTATIONS)) {
      const [w, d] = rotatedFootprint(placeable, rotY);
      for (const [ox, oy] of offsets) {
        const rect = rectFromCentre(o.position[0] + ox, o.position[1] + oy, w, d);
        if (!union(rect) || !coverFits(rect, o.position) || !rectInside(rect, boardRect(p.grid, p.edgeMarginIn)) || !clear(rect)) continue;
        return { objectiveId: o.id, placeable, rotY, rect, base: "plateau" };
      }
    }
  }
  return null;
}

/** On a one-cell-wide line of raised cells, a cover leaves at least one long side clear by `clearanceIn`. */
function lineSideClear(grid: Grid, cells: readonly Cell[], clearanceIn: number): (rect: Rect) => boolean {
  const rows = new Set(cells.map((c) => c.r));
  const cols = new Set(cells.map((c) => c.c));
  if (rows.size === 1 && cols.size > 1) {
    const r = cells[0]!.r;
    return (rect) => rect.y0 - r * grid.cellIn >= clearanceIn - 1e-9 || (r + 1) * grid.cellIn - rect.y1 >= clearanceIn - 1e-9;
  }
  if (cols.size === 1 && rows.size > 1) {
    const c = cells[0]!.c;
    return (rect) => rect.x0 - c * grid.cellIn >= clearanceIn - 1e-9 || (c + 1) * grid.cellIn - rect.x1 >= clearanceIn - 1e-9;
  }
  return () => true;
}

/** Ground cells within the trench clearance of a raised cover: the trench keeps off them as it does around a ground cover. */
function raisedCoverKeepOut(grid: Grid, covers: readonly CoverChoice[], raised: readonly Cell[], clearanceIn: number): Cell[] {
  const out: Cell[] = [];
  for (let c = 0; c < grid.cols; c++) {
    for (let r = 0; r < grid.rows; r++) {
      if (raised.some((x) => x.c === c && x.r === r)) continue;
      if (covers.some((cover) => rectDistance(cellRect(grid, c, r), cover.rect) < clearanceIn)) out.push({ c, r });
    }
  }
  return out;
}

/** A rect lies inside a set of cells when every cell it overlaps is one of them. */
const insideCells = (grid: Grid, cells: readonly Cell[]) => (rect: Rect) => cellsInRect(grid, rect).every((cell) => cells.some((x) => x.c === cell.c && x.r === cell.r));

/**
 * Plateaus on the centre cell that are their own twin (a three-cell line
 * either way, or a plus) with twin ramps at opposite arm ends. When an
 * objective sits at the centre, a ruined building or tower stands on top
 * covering it, a trench's clearance in from one long side of a line.
 */
export function planCentrePlateaus(p: PlanInputs, sightAxis: Axis | null = null): RaisedPlan[] {
  const g = p.grid;
  if (p.parity.kind === "none" || g.cols % 2 === 0 || g.rows % 2 === 0) return [];
  const centre = { c: (g.cols - 1) / 2, r: (g.rows - 1) / 2 };
  const [mx, my] = [g.boardIn / 2, g.boardIn / 2];
  const objective = p.objectives.find((o) => Math.abs(o.position[0] - mx) < 1e-6 && Math.abs(o.position[1] - my) < 1e-6 && o.requiresCover) ?? null;
  const others = p.objectives.filter((o) => o !== objective);
  const usable = usableFor(p, objective ? [centre] : [], others);
  const at = (dc: number, dr: number): Cell => ({ c: centre.c + dc, r: centre.r + dr });
  const shapes: { cells: Cell[]; rampSets: Ramp[][] }[] = [
    { cells: [at(-1, 0), at(0, 0), at(1, 0)], rampSets: [[{ cell: at(-2, 0), up: "E" }, { cell: at(2, 0), up: "W" }], [{ cell: at(-1, 1), up: "S" }, { cell: at(1, -1), up: "N" }]] },
    { cells: [at(0, -1), at(0, 0), at(0, 1)], rampSets: [[{ cell: at(0, -2), up: "N" }, { cell: at(0, 2), up: "S" }], [{ cell: at(1, -1), up: "W" }, { cell: at(-1, 1), up: "E" }]] },
    {
      cells: [at(0, 0), at(-1, 0), at(1, 0), at(0, -1), at(0, 1)],
      rampSets: [
        [{ cell: at(-2, 0), up: "E" }, { cell: at(2, 0), up: "W" }],
        [{ cell: at(0, -2), up: "N" }, { cell: at(0, 2), up: "S" }],
      ],
    },
  ];
  const plans: RaisedPlan[] = [];
  const pool = tallCoverPool(p.palette);
  // A shape lying across the line between the deployment zones would cut every
  // trench crossing no man's land, so the line along that axis comes first and
  // the plus last.
  const order = sightAxis === "x" ? [shapes[0]!, shapes[1]!, shapes[2]!] : sightAxis === "y" ? [shapes[1]!, shapes[0]!, shapes[2]!] : p.rng.shuffle(shapes);
  for (const shape of order) {
    if (!shape.cells.every((cell) => usable(cell.c, cell.r))) continue;
    const inShape = (c: number, r: number) => shape.cells.some((x) => x.c === c && x.r === r);
    // Ramps at the ends of a line lie along it and close no crossing; ramps on its sides come second.
    for (const ramps of shape.rampSets) {
      const twinOk = ramps.every((r) => {
        const twin = { cell: mapCell(p.parity, g, r.cell), up: mapDir(p.parity, r.up) };
        return ramps.some((x) => x.cell.c === twin.cell.c && x.cell.r === twin.cell.r && x.up === twin.up);
      });
      if (!twinOk) continue;
      if (!ramps.every((r) => inShape(r.cell.c + DELTA[r.up][0], r.cell.r + DELTA[r.up][1]) && usable(r.cell.c, r.cell.r) && !p.blocked.get(r.cell.c, r.cell.r))) continue;
      if (!ramps.every((r) => inGrid(g, rampFoot(r).c, rampFoot(r).r) && !p.reserved.get(rampFoot(r).c, rampFoot(r).r) && !inShape(rampFoot(r).c, rampFoot(r).r))) continue;
      let covers: CoverChoice[] = [];
      if (objective) {
        const cover = coverOnTop(p, objective, insideCells(g, shape.cells), pool, [], lineSideClear(g, shape.cells, p.trenchClearanceIn));
        if (!cover) continue;
        covers = [cover];
      }
      const keepOut = new Mask(g);
      const raisedCells = [...shape.cells, ...ramps.map((r) => r.cell)];
      for (const cell of [...raisedCells, ...ramps.map(rampFoot), ...raisedCoverKeepOut(g, covers, raisedCells, p.trenchClearanceIn)]) keepOut.set(cell.c, cell.r);
      plans.push({ plateaus: [{ id: "plateau", cells: shape.cells, ramps, raisedTrench: null }], hills: [], covers, keepOut });
    }
  }
  return plans;
}

/**
 * A hill of H4x4 blocks on the centre (Armoured Train's pattern), as a line
 * along the axis between the deployment zones or a single block: climbable on
 * every side, so it needs no ramps. The midpoint's ruin stands on top when an
 * objective sits there; blocks it leaves bare may carry a second H4x4 step.
 */
export function planCentreHills(p: PlanInputs, sightAxis: Axis | null, stepChance: number): RaisedPlan[] {
  const g = p.grid;
  if (p.parity.kind === "none" || g.cols % 2 === 0 || g.rows % 2 === 0) return [];
  const centre = { c: (g.cols - 1) / 2, r: (g.rows - 1) / 2 };
  const [mx, my] = [g.boardIn / 2, g.boardIn / 2];
  const objective = p.objectives.find((o) => Math.abs(o.position[0] - mx) < 1e-6 && Math.abs(o.position[1] - my) < 1e-6 && o.requiresCover) ?? null;
  const usable = usableFor(p, objective ? [centre] : [], p.objectives.filter((o) => o !== objective));
  const at = (dc: number, dr: number): Cell => ({ c: centre.c + dc, r: centre.r + dr });
  const along = sightAxis === "y" ? [at(0, -1), at(0, 0), at(0, 1)] : [at(-1, 0), at(0, 0), at(1, 0)];
  const plans: RaisedPlan[] = [];
  const pool = tallCoverPool(p.palette);
  for (const cells of [along, [at(0, 0)]]) {
    if (!cells.every((cell) => usable(cell.c, cell.r))) continue;
    let covers: CoverChoice[] = [];
    if (objective) {
      const cover = coverOnTop(p, objective, insideCells(g, cells), pool, [], lineSideClear(g, cells, p.trenchClearanceIn));
      if (!cover) continue;
      covers = [{ ...cover, base: "hill" }];
    }
    // A step goes on a bare block and its twin together, never under the ruin.
    const under = new Set(covers.flatMap((c) => cellsInRect(g, c.rect).map((cell) => cellKey(cell.c, cell.r))));
    const stepped: Cell[] = [];
    for (const cell of cells) {
      const twin = mapCell(p.parity, g, cell);
      if (under.has(cellKey(cell.c, cell.r)) || under.has(cellKey(twin.c, twin.r)) || stepped.some((x) => x.c === cell.c && x.r === cell.r)) continue;
      if (p.rng.chance(stepChance)) stepped.push(...(twin.c === cell.c && twin.r === cell.r ? [cell] : [cell, twin]));
    }
    plans.push({ plateaus: [], hills: [{ id: "hill-c", cells, stepped }], covers, keepOut: Mask.fromCells(g, [...cells, ...raisedCoverKeepOut(g, covers, cells, p.trenchClearanceIn)]) });
  }
  return plans;
}

/**
 * Twin objectives raised on 2x2 hills of H4x4 blocks (Armoured Train's
 * pattern), each with its ruined building or tower on top covering the marker,
 * the twin a different piece of the same category.
 */
export function planObjectiveHills(p: PlanInputs, avoid: Mask, sightAxis: Axis | null = null): RaisedPlan[] {
  const g = p.grid;
  const plans: RaisedPlan[] = [];
  const pairs: [ObjectiveSpec, ObjectiveSpec][] = [];
  for (const o of p.objectives) {
    const t = twinObjective(p.parity, p.objectives, o);
    if (!o.requiresCover || !t || t.id === o.id || !t.requiresCover) continue;
    if (pairs.some(([a, b]) => b.id === o.id || a.id === o.id)) continue;
    if (sideOf(p.parity, ...o.position) !== "A") continue;
    pairs.push([o, t]);
  }
  const pool = tallCoverPool(p.palette);
  for (const [o, t] of p.rng.shuffle(pairs)) {
    const home = { c: Math.min(g.cols - 1, Math.floor(o.position[0] / g.cellIn)), r: Math.min(g.rows - 1, Math.floor(o.position[1] / g.cellIn)) };
    const others = p.objectives.filter((x) => x.id !== o.id && x.id !== t.id);
    // A marker on a cell boundary sits in the cell above it, so the twin's own cell may not be the mirror of this one.
    const ownCell = (x: ObjectiveSpec): Cell => ({ c: Math.min(g.cols - 1, Math.floor(x.position[0] / g.cellIn)), r: Math.min(g.rows - 1, Math.floor(x.position[1] / g.cellIn)) });
    const usableA = usableFor(p, [home], others);
    const usableB = usableFor(p, [mapCell(p.parity, g, home), ownCell(t)], others);
    // Like a ground cover, the hill leans to the board edge beside it and in from the deployment zone.
    const mid = g.boardIn / 2;
    const away: [number, number] = [Math.sign(o.position[0] - mid), Math.sign(o.position[1] - mid)];
    const sense: [number, number] = sightAxis === "x" ? [-1, 1] : sightAxis === "y" ? [1, -1] : [1, 1];
    const lean = ([dc, dr]: [number, number]) => (dc + 0.5) * away[0] * sense[0] + (dr + 0.5) * away[1] * sense[1];
    const blocks = p.rng.shuffle([[0, 0], [-1, 0], [0, -1], [-1, -1]] as [number, number][]).sort((a, b) => lean(b) - lean(a));
    for (const [dc, dr] of blocks) {
      const cellsA: Cell[] = [
        { c: home.c + dc, r: home.r + dr },
        { c: home.c + dc + 1, r: home.r + dr },
        { c: home.c + dc, r: home.r + dr + 1 },
        { c: home.c + dc + 1, r: home.r + dr + 1 },
      ];
      const cellsB = cellsA.map((cell) => mapCell(p.parity, g, cell));
      if (!cellsA.every((cell) => usableA(cell.c, cell.r) && !avoid.get(cell.c, cell.r))) continue;
      if (!cellsB.every((cell) => usableB(cell.c, cell.r) && !avoid.get(cell.c, cell.r))) continue;
      if (cellsA.some((a) => cellsB.some((b) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r) <= 1))) continue;
      const coverA = coverOnTop(p, o, insideCells(g, cellsA), pool);
      if (!coverA) continue;
      const coverB = twinCoverOnTop(p, t, coverA, cellsB, pool);
      if (!coverB) continue;
      const keepOut = Mask.fromCells(g, [...cellsA, ...cellsB, ...raisedCoverKeepOut(g, [coverA, coverB], [...cellsA, ...cellsB], p.trenchClearanceIn)]);
      plans.push({ plateaus: [], hills: [{ id: "hill-a", cells: cellsA, stepped: [] }, { id: "hill-b", cells: cellsB, stepped: [] }], covers: [{ ...coverA, base: "hill" }, { ...coverB, base: "hill" }], keepOut });
      break;
    }
  }
  return plans;
}

function twinCoverOnTop(p: PlanInputs, t: ObjectiveSpec, a: CoverChoice, cells: Cell[], pool: Placeable[]): CoverChoice | null {
  const fits = insideCells(p.grid, cells);
  const [cx, cy] = mapPoint(p.parity, (a.rect.x0 + a.rect.x1) / 2, (a.rect.y0 + a.rect.y1) / 2);
  const rotY = mapRotY(p.parity, a.rotY);
  for (const placeable of [...p.rng.shuffle(pool.filter((x) => x.key !== a.placeable.key && x.category === a.placeable.category)), a.placeable]) {
    const [w, d] = rotatedFootprint(placeable, rotY);
    const rect = rectFromCentre(cx, cy, w, d);
    if (fits(rect) && coverFits(rect, t.position) && rectInside(rect, boardRect(p.grid, p.edgeMarginIn))) return { objectiveId: t.id, placeable, rotY, rect, base: "hill" };
  }
  return null;
}

export function mergePlans(grid: Grid, plans: RaisedPlan[]): RaisedPlan {
  const keepOut = new Mask(grid);
  for (const plan of plans) for (const cell of plan.keepOut.cells()) keepOut.set(cell.c, cell.r);
  return { plateaus: plans.flatMap((x) => x.plateaus), hills: plans.flatMap((x) => x.hills), covers: plans.flatMap((x) => x.covers), keepOut };
}

/**
 * A cell the raised ground may use after the trench: open ground, 1in clear of
 * every trench (so no trench in its 8-neighbourhood), clear of covers,
 * objectives, the deployment trench tracks and zones that ban terrain.
 */
function raisableCell(ctx: PlacementContext, c: number, r: number): boolean {
  if (!inGrid(ctx.grid, c, r)) return false;
  if (ctx.occupiedGround.get(c, r) || ctx.objectiveMask.get(c, r) || ctx.featureMask.get(c, r) || ctx.keepClear.get(c, r)) return false;
  for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (ctx.trenchMask.get(c + dc, r + dr)) return false;
  if (ctx.zones.some((z) => z.spec.noTerrain && z.mask.get(c, r))) return false;
  if (ctx.trackMask.get(c, r)) return false;
  const rect = cellRect(ctx.grid, c, r);
  for (const p of ctx.placed) for (const pr of p.rects) if (rectDistance(rect, pr) < ctx.spacingIn) return false;
  for (const o of ctx.objectives) if (rectContains(rect, o.position[0], o.position[1]) || (o.keepOutIn > 0 && rectPointDistance(rect, o.position[0], o.position[1]) < o.keepOutIn)) return false;
  return true;
}

export function registerFeature(ctx: PlacementContext, id: string, cells: Cell[], typeId: string, keepClear: Cell[] = []): Placed {
  const rects = cells.map((cell) => cellRect(ctx.grid, cell.c, cell.r));
  const x0 = Math.min(...rects.map((r) => r.x0));
  const x1 = Math.max(...rects.map((r) => r.x1));
  const y0 = Math.min(...rects.map((r) => r.y0));
  const y1 = Math.max(...rects.map((r) => r.y1));
  for (const cell of cells) ctx.featureMask.set(cell.c, cell.r);
  for (const cell of keepClear) if (inGrid(ctx.grid, cell.c, cell.r)) ctx.keepClear.set(cell.c, cell.r);
  const placed: Placed = { id, role: "hill", kind: "feature", rects, placeable: null, centre: [(x0 + x1) / 2, (y0 + y1) / 2], rotY: 0, cells, objectiveId: null, base: "ground", typeId, slot: null, scatter: false, faceOf: null };
  ctx.placed.push(placed);
  return placed;
}

export function registerPlateau(ctx: PlacementContext, plateau: Plateau): void {
  registerFeature(ctx, plateau.id, [...plateau.cells, ...plateau.ramps.map((r) => r.cell)], "hill", plateau.ramps.map(rampFoot));
  for (const cell of plateau.cells) if (!(plateau.raisedTrench && plateau.raisedTrench.cell.c === cell.c && plateau.raisedTrench.cell.r === cell.r)) ctx.plateauTop.set(cell.c, cell.r);
}

/**
 * Twin plateaus of two or three stacked cells with a ramp each (a second where
 * there is room), for boards whose centre could not be raised.
 */
export function placeTwinPlateaus(ctx: PlacementContext, size: number, raisedTrenchChance: number): Plateau[] {
  const g = ctx.grid;
  const twinned = ctx.parity.kind !== "none";
  const ok = (cell: Cell) => raisableCell(ctx, cell.c, cell.r) && (!twinned || sideOf(ctx.parity, ...cellCentre(g, cell)) === "A");
  const all: Cell[] = [];
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) all.push({ c, r });
  for (const seed of ctx.rng.shuffle(all.filter(ok)).slice(0, 24)) {
    const cells: Cell[] = [seed];
    const has = (list: Cell[], c: number, r: number) => list.some((x) => x.c === c && x.r === r);
    while (cells.length < size) {
      const frontier = cells.flatMap((cell) => DIRS.map((d) => ({ c: cell.c + DELTA[d][0], r: cell.r + DELTA[d][1] }))).filter((n) => !has(cells, n.c, n.r) && ok(n));
      if (!frontier.length) break;
      cells.push(ctx.rng.pick(frontier));
    }
    if (cells.length < 2) continue;
    const twinCells = twinned ? cells.map((cell) => mapCell(ctx.parity, g, cell)) : [];
    if (twinCells.some((t) => !raisableCell(ctx, t.c, t.r) || cells.some((a) => Math.abs(a.c - t.c) <= 1 && Math.abs(a.r - t.r) <= 1))) continue;
    const rampOptions: Ramp[] = [];
    for (const cell of cells) {
      for (const dir of DIRS) {
        const rc = { c: cell.c - DELTA[dir][0], r: cell.r - DELTA[dir][1] };
        const ramp = { cell: rc, up: dir };
        const foot = rampFoot(ramp);
        if (has(cells, rc.c, rc.r) || !ok(rc) || !inGrid(g, foot.c, foot.r) || has(cells, foot.c, foot.r) || ctx.trenchMask.get(foot.c, foot.r)) continue;
        if (twinned) {
          const tr = { cell: mapCell(ctx.parity, g, rc), up: mapDir(ctx.parity, dir) };
          const tf = rampFoot(tr);
          if (!raisableCell(ctx, tr.cell.c, tr.cell.r) || has(twinCells, tr.cell.c, tr.cell.r) || !inGrid(g, tf.c, tf.r) || ctx.trenchMask.get(tf.c, tf.r) || has(twinCells, tf.c, tf.r)) continue;
        }
        rampOptions.push(ramp);
      }
    }
    if (!rampOptions.length) continue;
    const order = ctx.rng.shuffle(rampOptions);
    const ramps: Ramp[] = [order[0]!];
    const second = order.find((r) => r.up !== ramps[0]!.up && !(r.cell.c === ramps[0]!.cell.c && r.cell.r === ramps[0]!.cell.r));
    if (second) ramps.push(second);
    let raisedTrench: Plateau["raisedTrench"] = null;
    if (ctx.rng.chance(raisedTrenchChance)) {
      for (const cell of ctx.rng.shuffle(cells)) {
        const axis = (["N", "E"] as const).find((d) => has(cells, cell.c + DELTA[d][0], cell.r + DELTA[d][1]) && has(cells, cell.c - DELTA[d][0], cell.r - DELTA[d][1]));
        if (!axis || ramps.some((rp) => rp.cell.c + DELTA[rp.up][0] === cell.c && rp.cell.r + DELTA[rp.up][1] === cell.r)) continue;
        raisedTrench = { cell, openings: [axis, axis === "N" ? "S" : "W"].sort((a, b) => DIRS.indexOf(a as Dir) - DIRS.indexOf(b as Dir)) as Dir[] };
        break;
      }
    }
    const a: Plateau = { id: "plateau-a", cells, ramps, raisedTrench };
    registerPlateau(ctx, a);
    if (!twinned) return [a];
    const b: Plateau = {
      id: "plateau-b",
      cells: twinCells,
      ramps: ramps.map((r) => ({ cell: mapCell(ctx.parity, g, r.cell), up: mapDir(ctx.parity, r.up) })),
      raisedTrench: raisedTrench ? { cell: mapCell(ctx.parity, g, raisedTrench.cell), openings: raisedTrench.openings.map((d) => mapDir(ctx.parity, d)).sort((x, y) => DIRS.indexOf(x) - DIRS.indexOf(y)) } : null,
    };
    registerPlateau(ctx, b);
    return [a, b];
  }
  return [];
}

const cellCentre = (g: Grid, cell: Cell): [number, number] => [cell.c * g.cellIn + g.cellIn / 2, cell.r * g.cellIn + g.cellIn / 2];

/** Twin hills of one or two H4x4 blocks, near the objectives where there are any, stepped in pairs. */
export function placeTwinHills(ctx: PlacementContext, cellsWanted: number, stepChance: number): Hill[] {
  const g = ctx.grid;
  const twinned = ctx.parity.kind !== "none";
  const all: Cell[] = [];
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) all.push({ c, r });
  const near = (cell: Cell) => (ctx.objectives.length ? Math.min(...ctx.objectives.map((o) => Math.hypot(cellCentre(g, cell)[0] - o.position[0], cellCentre(g, cell)[1] - o.position[1]))) : Math.abs(cellCentre(g, cell)[0] - g.boardIn / 2));
  const ok = (cell: Cell) => raisableCell(ctx, cell.c, cell.r) && (!twinned || sideOf(ctx.parity, ...cellCentre(g, cell)) === "A");
  const seeds = ctx.rng.weightedOrder(all.filter(ok).map((cell) => ({ item: cell, weight: 1 / (1 + near(cell)) })));
  for (const seed of seeds.slice(0, 30)) {
    const cells = [seed];
    if (cellsWanted > 1) {
      const next = ctx.rng.shuffle(DIRS).map((d) => ({ c: seed.c + DELTA[d][0], r: seed.r + DELTA[d][1] })).find(ok);
      if (next) cells.push(next);
    }
    const twinCells = twinned ? cells.map((cell) => mapCell(ctx.parity, g, cell)) : [];
    if (twinCells.some((t) => !raisableCell(ctx, t.c, t.r) || cells.some((a) => rectDistance(cellRect(g, a.c, a.r), cellRect(g, t.c, t.r)) < ctx.spacingIn))) continue;
    const stepped = ctx.rng.chance(stepChance) ? [ctx.rng.pick(cells)] : [];
    const a: Hill = { id: "hill-a", cells, stepped };
    registerFeature(ctx, a.id, a.cells, "hill");
    if (!twinned) return [a];
    const b: Hill = { id: "hill-b", cells: twinCells, stepped: stepped.map((cell) => mapCell(ctx.parity, g, cell)) };
    registerFeature(ctx, b.id, b.cells, "hill");
    return [a, b];
  }
  return [];
}

// ---- face dressing -------------------------------------------------------------

const FACE_CATEGORIES = ["scatter-sandbag", "scatter-crate", "scatter-rubble"];

/**
 * Dresses the tile faces a plateau shows to open ground (dark from across the
 * table) with sandbags, crates or rubble against them, twin faces together.
 */
export function dressFaces(ctx: PlacementContext, plateaus: readonly Plateau[], chance: number): Placed[] {
  const g = ctx.grid;
  const out: Placed[] = [];
  const raisedCells = new Set(plateaus.flatMap((p) => [...p.cells, ...p.ramps.map((r) => r.cell)].map((c) => cellKey(c.c, c.r))));
  const faces: { plateau: Plateau; cell: Cell; dir: Dir }[] = [];
  for (const plateau of plateaus) {
    for (const cell of plateau.cells) {
      for (const dir of DIRS) {
        const n = { c: cell.c + DELTA[dir][0], r: cell.r + DELTA[dir][1] };
        if (!inGrid(g, n.c, n.r) || raisedCells.has(cellKey(n.c, n.r)) || ctx.trenchMask.get(n.c, n.r) || ctx.keepClear.get(n.c, n.r)) continue;
        faces.push({ plateau, cell, dir });
      }
    }
  }
  const twinned = ctx.parity.kind !== "none";
  const done = new Set<string>();
  const key = (f: { cell: Cell; dir: Dir }) => `${f.cell.c},${f.cell.r},${f.dir}`;
  const fits = (p: Placeable) => Math.max(...p.footprintIn) <= g.cellIn && Math.min(...p.footprintIn) <= 1.7 && p.members.length === 1;
  for (const face of faces) {
    if (done.has(key(face))) continue;
    const twin = twinned ? faces.find((f) => f.cell.c === mapCell(ctx.parity, g, face.cell).c && f.cell.r === mapCell(ctx.parity, g, face.cell).r && f.dir === mapDir(ctx.parity, face.dir)) : undefined;
    done.add(key(face));
    if (twin) done.add(key(twin));
    if (!ctx.rng.chance(chance)) continue;
    const category = ctx.rng.pick(FACE_CATEGORIES);
    const a = pickPlaceable(ctx, category, [], fits);
    if (!a) continue;
    const b = twin && twin !== face ? (pickPlaceable(ctx, category, [a.key], fits) ?? a) : null;
    const place = (f: { plateau: Plateau; cell: Cell; dir: Dir }, piece: Placeable) => {
      const alongX = f.dir === "N" || f.dir === "S";
      const rotY = (alongX ? piece.footprintIn[0] >= piece.footprintIn[1] : piece.footprintIn[1] >= piece.footprintIn[0]) ? 0 : 90;
      const [w, d] = rotatedFootprint(piece, rotY);
      const [cx, cy] = cellCentre(g, f.cell);
      const half = g.cellIn / 2 + 0.05;
      const [dx, dy] = DELTA[f.dir];
      const centre: [number, number] = [cx + dx * (half + w / 2), cy + dy * (half + d / 2)];
      if (alongX) centre[0] = cx;
      else centre[1] = cy;
      return { placeable: piece, rect: rectFromCentre(centre[0], centre[1], w, d), rotY };
    };
    const pa = place(face, a);
    if (!rectAllowed(ctx, pa.rect, a.role, { scatter: true, faceOf: face.plateau.id })) continue;
    let pb: ReturnType<typeof place> | null = null;
    if (b && twin) {
      pb = place(twin, b);
      if (!rectAllowed(ctx, pb.rect, b.role, { scatter: true, faceOf: twin.plateau.id }) || rectDistance(pa.rect, pb.rect) < ctx.scatterGapIn) continue;
    }
    const pair = commitPair(ctx, "face", pa, pb, { faceOf: face.plateau.id });
    // A face slot stands at the middle of the face it dresses, so twins mirror exactly whatever their depth.
    const anchor = (f: { cell: Cell; dir: Dir }): [number, number] => {
      const [cx, cy] = cellCentre(g, f.cell);
      return [cx + (DELTA[f.dir][0] * g.cellIn) / 2, cy + (DELTA[f.dir][1] * g.cellIn) / 2];
    };
    pair[0]!.slot!.at = anchor(face);
    if (pair[1] && twin) {
      pair[1].slot!.at = anchor(twin);
      pair[1].faceOf = twin.plateau.id;
      pair[1].slot!.against = twin.plateau.id;
    }
    out.push(...pair);
  }
  return out;
}

// ---- terrain slots and scatter -------------------------------------------------

export interface SlotResult {
  placed: Placed[];
  shortfalls: { typeId: string; min: number; target: number; placed: number }[];
}

const typeCounts = (ctx: PlacementContext): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const p of ctx.placed) if (p.typeId && p.kind !== "scatter" && p.kind !== "face") counts.set(p.typeId, (counts.get(p.typeId) ?? 0) + 1);
  return counts;
};

/**
 * Fills terrain slots in twin pairs: the archetype's minimum of each listed
 * type first (small pieces first, so they fit), then up to the density
 * targets one pair per type per round.
 */
export function placeTerrainSlots(ctx: PlacementContext, targets: readonly CompositionTarget[], phase: "minimum" | "fill"): SlotResult {
  if (phase === "fill") return fillSlots(ctx, targets, phase, Number.POSITIVE_INFINITY);
  // The minimum goes down with each type's natural picks first; when a type
  // finds no room, the whole minimum is laid again with smaller pieces.
  const snapshot = { placed: ctx.placed.length, usage: new Map(ctx.usage), nextId: ctx.nextId };
  let best: SlotResult | null = null;
  let bestState: { placed: Placed[]; usage: Map<string, number>; nextId: number } | null = null;
  const missing = (r: SlotResult) => r.shortfalls.reduce((n, sf) => n + Math.max(0, sf.min - sf.placed), 0);
  for (const sizeCap of [Number.POSITIVE_INFINITY, 0.5, 0]) {
    ctx.placed.length = snapshot.placed;
    ctx.usage = new Map(snapshot.usage);
    ctx.nextId = snapshot.nextId;
    if (bestState) ctx.placed.length = snapshot.placed;
    const result = fillSlots(ctx, targets, phase, sizeCap);
    if (!best || missing(result) < missing(best)) {
      best = result;
      bestState = { placed: [...ctx.placed], usage: new Map(ctx.usage), nextId: ctx.nextId };
    }
    if (!missing(best)) break;
  }
  ctx.placed.length = 0;
  ctx.placed.push(...bestState!.placed);
  ctx.usage = bestState!.usage;
  ctx.nextId = bestState!.nextId;
  return best!;
}

/**
 * One pass over the targets. `sizeCap` limits a type's pieces by area rank:
 * infinity takes any, a fraction keeps the smaller part of each category, 0
 * tries the smallest first.
 */
function fillSlots(ctx: PlacementContext, targets: readonly CompositionTarget[], phase: "minimum" | "fill", sizeCap: number): SlotResult {
  const placed: Placed[] = [];
  // The type whose smallest piece is largest goes first, while the open bands are still whole.
  const smallest = (t: CompositionTarget) => Math.min(...t.categories.flatMap((c) => placeablesIn(ctx.palette, c).filter((p) => !p.cells && Math.max(...p.footprintIn) <= 5).map(area)), Number.POSITIVE_INFINITY);
  const order = [...targets].sort((a, b) => Number(a.house) - Number(b.house) || (Number.isFinite(smallest(b)) ? smallest(b) : 0) - (Number.isFinite(smallest(a)) ? smallest(a) : 0));
  const goal = (t: CompositionTarget) => (phase === "minimum" ? t.min : t.target);
  const stuck = new Set<string>();
  const turns = new Map<string, number>();
  for (let progress = true; progress; ) {
    progress = false;
    for (const target of order) {
      const have = typeCounts(ctx).get(target.typeId) ?? 0;
      if (stuck.has(target.typeId) || have >= goal(target)) continue;
      const i = turns.get(target.typeId) ?? 0;
      turns.set(target.typeId, i + 1);
      const categories = [...target.categories.slice(i % target.categories.length), ...target.categories.slice(0, i % target.categories.length)];
      let done: Placed[] = [];
      for (const category of categories) {
        if (category === "tall-tower") continue;
        const pool = placeablesIn(ctx.palette, category);
        if (!pool.length) continue;
        const blocks = pool.filter((p) => p.cells);
        if (blocks.length && phase === "fill" && ctx.rng.chance(0.4)) done = placeGroundBlockPair(ctx, ctx.rng.pick(blocks));
        if (!done.length) {
          // A failed pick steps down to pieces smaller than it, so a crowded board still finds its minimum.
          const fits = (p: Placeable) => !p.cells && (phase === "fill" || Math.max(...p.footprintIn) <= 5);
          const all = [...new Set(pool.filter(fits).map(area))].sort((x, y) => y - x);
          const areas = sizeCap === 0 ? [...all].reverse() : Number.isFinite(sizeCap) ? all.slice(Math.floor(all.length * (1 - sizeCap))) : all;
          const steps = phase === "minimum" ? areas : areas.slice(0, 1);
          for (const limit of steps) {
            const within = (p: Placeable) => fits(p) && (sizeCap === 0 ? area(p) === limit : area(p) <= limit);
            for (let attempt = 0; attempt < (phase === "minimum" ? 1 : 3) && !done.length; attempt++) done = placePair(ctx, category, { kind: "terrain", filter: within });
            if (done.length) break;
          }
          // No twin pair fits: one piece on the mirror line is its own twin.
          for (const placeable of [...pool.filter(fits)].sort((x, y) => area(x) - area(y))) {
            if (done.length) break;
            if ((ctx.usage.get(placeable.key) ?? 0) >= ctx.repeatCap) continue;
            done = placeOnMirrorLine(ctx, placeable, category, { kind: "terrain" });
          }
        }
        if (done.length) break;
      }
      if (!done.length) {
        stuck.add(target.typeId);
        continue;
      }
      placed.push(...done);
      progress = true;
    }
  }
  const counts = typeCounts(ctx);
  const shortfalls = order.filter((t) => (counts.get(t.typeId) ?? 0) < goal(t)).map((t) => ({ typeId: t.typeId, min: t.min, target: goal(t), placed: counts.get(t.typeId) ?? 0 }));
  return { placed, shortfalls };
}

/** Tall pieces (towers, multi-storey ruins) as a twin pair beside the network. */
export function placeTallPair(ctx: PlacementContext): Placed[] {
  for (const category of ctx.rng.shuffle(["tall-tower", "large-block-ruin"])) {
    const placed = placePair(ctx, category, { kind: "tall", filter: (p) => isTall(p) && p.members.length === 1 });
    if (placed.length) return placed;
  }
  return [];
}

/** A tower standing on a plateau's top (a centre plateau with no objective on it). */
export function placeTallOnPlateau(ctx: PlacementContext, plateau: Plateau): Placed | null {
  const pool = ctx.rng.shuffle(placeablesIn(ctx.palette, "tall-tower").filter((p) => isTall(p) && p.members.length === 1));
  const tops = plateau.cells.filter((cell) => ctx.plateauTop.get(cell.c, cell.r));
  // A single piece on the centre is its own twin only on the cell that maps onto itself.
  const own = tops.filter((cell) => {
    const t = mapCell(ctx.parity, ctx.grid, cell);
    return t.c === cell.c && t.r === cell.r;
  });
  for (const placeable of pool) {
    for (const cell of ctx.parity.kind === "none" ? ctx.rng.shuffle(tops) : own) {
      for (const rotY of ctx.rng.shuffle(ROTATIONS)) {
        const [w, d] = rotatedFootprint(placeable, rotY);
        const [cx, cy] = cellCentre(ctx.grid, cell);
        const rect = rectFromCentre(cx, cy, w, d);
        if (!rectAllowed(ctx, rect, placeable.role, { onPlateau: true })) continue;
        return commitPair(ctx, "tall", { placeable, rect, rotY }, null, { base: "plateau" })[0]!;
      }
    }
  }
  return null;
}

export const SCATTER_WEIGHTS: Record<string, number> = {
  "scatter-crate": 3,
  "scatter-sandbag": 3,
  "scatter-barrel": 2,
  "scatter-rubble": 2,
  "scatter-debris": 2,
  "scatter-decor": 1,
  "scatter-wire": 1,
  "scatter-foliage": 1,
};

// Scatter that belongs together sits together: a heap of crates with a barrel
// or two, sandbags end to end, rubble with debris. A heap is one piece of
// scattered terrain; the model-base gap is kept around it, not inside it.
const CLUSTER_PREFIX = "heap:";
const HEAP_COMPANIONS: Record<string, string[]> = {
  "scatter-crate": ["scatter-crate", "scatter-crate", "scatter-barrel"],
  "scatter-barrel": ["scatter-barrel", "scatter-barrel", "scatter-crate"],
  "scatter-sandbag": ["scatter-sandbag"],
  "scatter-rubble": ["scatter-rubble", "scatter-debris"],
  "scatter-debris": ["scatter-debris", "scatter-rubble"],
};
const HEAP_GAP_IN = 0.15;
const HEAP_MEMBER_MAX_IN = 2.8;

/** Two to four small scatter pieces packed edge to edge around a first one, as one placeable at rotY 0. */
function buildHeap(ctx: PlacementContext, category: string): Placeable | null {
  const looks = looksOf(ctx.aesthetic);
  const small = (p: Placeable) => Math.max(...p.footprintIn) <= HEAP_MEMBER_MAX_IN && p.members.length === 1 && p.aesthetics.some((a) => looks.has(a));
  const first = pickPlaceable(ctx, category, [], small);
  if (!first) return null;
  const boxes: { piece: Placeable; rotY: number; rect: Rect }[] = [];
  const firstRot = ctx.rng.pick(ROTATIONS);
  const [fw, fd] = rotatedFootprint(first, firstRot);
  boxes.push({ piece: first, rotY: firstRot, rect: rectFromCentre(0, 0, fw, fd) });
  const want = ctx.rng.intBetween(2, 4);
  const companions = HEAP_COMPANIONS[category] ?? [category];
  for (let tries = 0; boxes.length < want && tries < 8; tries++) {
    const piece = pickPlaceable(ctx, ctx.rng.pick(companions), boxes.map((b) => b.piece.key), small);
    if (!piece) continue;
    const rotY = ctx.rng.pick(ROTATIONS);
    const [w, d] = rotatedFootprint(piece, rotY);
    const bx = { x0: Math.min(...boxes.map((b) => b.rect.x0)), y0: Math.min(...boxes.map((b) => b.rect.y0)), x1: Math.max(...boxes.map((b) => b.rect.x1)), y1: Math.max(...boxes.map((b) => b.rect.y1)) };
    for (const side of ctx.rng.shuffle(DIRS)) {
      const along = side === "N" || side === "S" ? [bx.x0 + w / 2, bx.x1 - w / 2] : [bx.y0 + d / 2, bx.y1 - d / 2];
      const t = along[0]! <= along[1]! ? along[0]! + ctx.rng.next() * (along[1]! - along[0]!) : (along[0]! + along[1]!) / 2;
      const centre: [number, number] =
        side === "N" ? [t, bx.y1 + HEAP_GAP_IN + d / 2] : side === "S" ? [t, bx.y0 - HEAP_GAP_IN - d / 2] : side === "E" ? [bx.x1 + HEAP_GAP_IN + w / 2, t] : [bx.x0 - HEAP_GAP_IN - w / 2, t];
      const rect = rectFromCentre(centre[0], centre[1], w, d);
      if (boxes.some((b) => rectDistance(b.rect, rect) < HEAP_GAP_IN - 1e-9)) continue;
      // Keep the heap compact: no side longer than three of its members' widths.
      const next = { x0: Math.min(bx.x0, rect.x0), y0: Math.min(bx.y0, rect.y0), x1: Math.max(bx.x1, rect.x1), y1: Math.max(bx.y1, rect.y1) };
      if (Math.max(next.x1 - next.x0, next.y1 - next.y0) > 5) continue;
      boxes.push({ piece, rotY, rect });
      break;
    }
  }
  if (boxes.length < 2) return null;
  const x0 = Math.min(...boxes.map((b) => b.rect.x0));
  const y0 = Math.min(...boxes.map((b) => b.rect.y0));
  const x1 = Math.max(...boxes.map((b) => b.rect.x1));
  const y1 = Math.max(...boxes.map((b) => b.rect.y1));
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  return {
    key: `${CLUSTER_PREFIX}${boxes.map((b) => b.piece.key).join("+")}`,
    role: "scatter",
    category,
    aesthetics: first.aesthetics,
    scatter: true,
    footprintIn: [x1 - x0, y1 - y0],
    heightIn: Math.max(...boxes.map((b) => b.piece.heightIn)),
    members: boxes.map((b) => ({ pieceId: b.piece.members[0]!.pieceId, at: [(b.rect.x0 + b.rect.x1) / 2 - cx, (b.rect.y0 + b.rect.y1) / 2 - cy] as [number, number], rotY: b.rotY })),
    cells: null,
  };
}

/** A heap as the other half sees it: each member at its mirrored offset and facing. */
function mirrorHeap(ctx: PlacementContext, heap: Placeable): Placeable {
  const mid = ctx.grid.boardIn / 2;
  return {
    ...heap,
    members: heap.members.map((m) => {
      const [x, y] = mapPoint(ctx.parity, mid + m.at[0], mid + m.at[1]);
      return { ...m, at: [x - mid, y - mid] as [number, number], rotY: mapRotY(ctx.parity, m.rotY) };
    }),
  };
}

/**
 * Scattered terrain in twin pairs up to `pieces` objects: crates, sandbags,
 * barrels, rubble and debris at model height between the terrain pieces, single
 * or heaped, each keeping a model-base gap from everything so lanes stay
 * walkable. Spots are walked on a jittered lattice over one half, those beside
 * standing pieces and trench lips first, so the clutter gathers where there is
 * cover to gather at; each twin lands at the mirrored spot. Ecclesiastic boards
 * lean on graves and candles, industrial ones on barrels and crates.
 */
export function placeScatter(ctx: PlacementContext, pieces: number, heapChance = 0.6): Placed[] {
  const out: Placed[] = [];
  const looks = looksOf(ctx.aesthetic);
  // Scatter keeps to the board's look: a category of pieces from other looks only
  // (graves and candles on an industrial board) is left out, and within a category
  // only pieces that suit the look, or suit any, are drawn.
  const fits = (p: Placeable) => p.aesthetics.some((a) => looks.has(a));
  const weights = Object.entries(SCATTER_WEIGHTS)
    .filter(([category]) => placeablesIn(ctx.palette, category).some(fits))
    .map(([category, w]) => {
      const suited = placeablesIn(ctx.palette, category).some((p) => p.aesthetics.some((a) => a !== "any" && looks.has(a)));
      return { item: category, weight: w * (suited ? 2 : 1) };
    });
  const g = ctx.grid;
  const twinned = ctx.parity.kind !== "none";
  const margin = ctx.edgeMarginIn;
  const objects = () => out.reduce((n, p) => n + p.placeable!.members.length, 0);
  const solid = [...ctx.trenchRects, ...ctx.placed.filter((p) => !p.scatter).flatMap((p) => p.rects)];
  const spots: { item: [number, number]; weight: number }[] = [];
  for (let x = margin + 0.5; x <= g.boardIn - margin - 0.5; x += 1) {
    for (let y = margin + 0.5; y <= g.boardIn - margin - 0.5; y += 1) {
      const at: [number, number] = [x + (ctx.rng.next() - 0.5), y + (ctx.rng.next() - 0.5)];
      if (twinned && sideOf(ctx.parity, ...at) !== "A") continue;
      const near = Math.min(...solid.map((r) => rectPointDistance(r, at[0], at[1])), Number.POSITIVE_INFINITY);
      spots.push({ item: at, weight: near < 2.5 ? 4 : near < 5 ? 2 : 1 });
    }
  }
  for (const [x, y] of ctx.rng.weightedOrder(spots)) {
    if (objects() >= pieces) break;
    let placedHere = false;
    for (const category of ctx.rng.weightedOrder(weights)) {
      if (placedHere) break;
      // A heap that does not fit gives way to a single piece of its kind.
      const heaped = HEAP_COMPANIONS[category] && ctx.rng.chance(heapChance) ? buildHeap(ctx, category) : null;
      for (const heap of heaped ? [heaped, null] : [null]) {
        const a = heap ?? pickPlaceable(ctx, category, [], fits);
        if (!a) continue;
        const rotY = heap ? 0 : ctx.rng.pick(ROTATIONS);
        const [w, d] = rotatedFootprint(a, rotY);
        const rect = rectFromCentre(x, y, w, d);
        if (!rectAllowed(ctx, rect, a.role, { scatter: true })) continue;
        let twin: { placeable: Placeable; rect: Rect; rotY: number } | null = null;
        if (twinned) {
          const [tx, ty] = mapPoint(ctx.parity, x, y);
          const options = heap ? [{ piece: mirrorHeap(ctx, heap), rotY: 0 }] : [...new Set([pickTwin(ctx, category, a, fits) ?? a, a])].map((piece) => ({ piece, rotY: twinFacing(ctx.parity, a, rotY, piece) }));
          for (const { piece, rotY: trot } of options) {
            const [tw, td] = rotatedFootprint(piece, trot);
            const trect = rectFromCentre(tx, ty, tw, td);
            if (rectDistance(rect, trect) >= ctx.scatterGapIn && rectAllowed(ctx, trect, piece.role, { scatter: true })) {
              twin = { placeable: piece, rect: trect, rotY: trot };
              break;
            }
          }
          if (!twin) continue;
        }
        out.push(...commitPair(ctx, "scatter", { placeable: a, rect, rotY }, twin));
        placedHere = true;
        break;
      }
    }
  }
  return out;
}
