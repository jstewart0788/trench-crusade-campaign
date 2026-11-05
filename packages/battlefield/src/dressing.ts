import {
  cellKey,
  cellRect,
  cellsInRect,
  DELTA,
  DIRS,
  inGrid,
  Mask,
  OPPOSITE,
  rectContains,
  rectDistance,
  rectFromCentre,
  rectInside,
  rectPointDistance,
  type Cell,
  type Dir,
  type Grid,
  type Rect,
} from "./grid.js";
import { pieceById, piecesByRole, rotatedFootprint, type Palette, type PalettePiece, type Role } from "./palette.js";
import type { Rng } from "./rng.js";
import type { ObjectiveSpec, ZoneSpec } from "./scenario.js";
import type { Axis } from "./trench.js";

// Everything that is not the trench network: objective covers, the raised
// plateau and hills, tall pieces, crater tiles laid into the ground grid, the
// free-standing dressing, and the ground tiles under it all. The rulebook
// spacing (3in between pieces, 1in from any trench, p67) is measured between
// axis-aligned visual footprints in board inches.

export interface ArchetypeSpec {
  id: string;
  name: string;
  composition: { typeId: string; count?: string; required: boolean }[];
  density: "sparse" | "medium" | "dense";
}

export const ROLES_BY_TERRAIN_TYPE: Record<string, Role[]> = {
  "corner-ruin": ["ruin"],
  "ruined-building": ["building"],
  "dangerous-terrain": ["wire", "dangerous"],
  "difficult-terrain": ["crater", "difficult"],
  landmark: ["landmark", "tower"],
  cover: ["cover"],
};

export const TYPE_BY_ROLE: Partial<Record<Role, string>> = {
  ruin: "corner-ruin",
  building: "ruined-building",
  wire: "dangerous-terrain",
  dangerous: "dangerous-terrain",
  crater: "difficult-terrain",
  difficult: "difficult-terrain",
  landmark: "landmark",
  tower: "landmark",
  hill: "hill",
  cover: "cover",
};

export interface CompositionTarget {
  typeId: string;
  roles: Role[];
  min: number;
  target: number;
  required: boolean;
  /** Not on the archetype's pick-list; added on Jonathan's direction. */
  house: boolean;
}

const DENSITY_BONUS = { sparse: 0, medium: 1, dense: 2 } as const;

/** Per terrain type, the rulebook minimum ("2+") and the count the density aims for, plus house extras. */
export function compositionTargets(archetype: ArchetypeSpec, houseCover: number): CompositionTarget[] {
  const out: CompositionTarget[] = [];
  for (const entry of archetype.composition) {
    const roles = ROLES_BY_TERRAIN_TYPE[entry.typeId];
    if (!roles) continue;
    const parsed = Number.parseInt(entry.count ?? "", 10);
    const min = Number.isFinite(parsed) ? parsed : 2;
    out.push({ typeId: entry.typeId, roles, min, target: min + DENSITY_BONUS[archetype.density], required: entry.required, house: false });
  }
  if (houseCover > 0) out.push({ typeId: "cover", roles: ["cover"], min: 0, target: houseCover, required: false, house: true });
  return out;
}

// ---- placeables: single pieces and groups -----------------------------------

export interface PlaceableMember {
  pieceId: string;
  /** Visual centre relative to the placeable's footprint centre, at the placeable's rotY 0. */
  at: [number, number];
  rotY: number;
}

export interface Placeable {
  key: string;
  role: Role;
  footprintIn: [number, number];
  heightIn: number;
  members: PlaceableMember[];
}

export function placeableOf(piece: PalettePiece): Placeable {
  return { key: piece.id, role: piece.role, footprintIn: [...piece.footprintIn], heightIn: piece.heightIn, members: [{ pieceId: piece.id, at: [0, 0], rotY: 0 }] };
}

export function placeablesFor(palette: Palette, role: Role, singlesOnly = false): Placeable[] {
  const singles = piecesByRole(palette, role)
    .filter((p) => p.layer === "surface" && !p.cells)
    .map(placeableOf);
  if (singlesOnly) return singles;
  const groups = palette.groups
    .filter((g) => g.role === role && g.enabled !== false)
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
        footprintIn: [x1 - x0, y1 - y0],
        heightIn: Math.max(...boxes.map((b) => b.piece.heightIn)),
        members: boxes.map((b) => ({ pieceId: b.piece.id, at: [b.m.at[0] - cx, b.m.at[1] - cy], rotY: b.m.rotY })),
      };
    });
  return [...singles, ...groups];
}

const area = (p: Placeable): number => p.footprintIn[0] * p.footprintIn[1];

// ---- placement state ------------------------------------------------------

export type PlacedKind = "cover" | "feature" | "tall" | "dressing" | "crater-tile";

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
  onPlateau: boolean;
  typeId: string | null;
}

export interface PlacementContext {
  grid: Grid;
  rng: Rng;
  palette: Palette;
  trenchRects: Rect[];
  trenchMask: Mask;
  zones: { spec: ZoneSpec; mask: Mask }[];
  objectives: ObjectiveSpec[];
  objectiveMask: Mask;
  /** Cells whose ground layer is not a plain tile: trench, crater tiles. */
  occupiedGround: Mask;
  /** Plateau, ramp and hill cells; free pieces never overlap them unless placed on the plateau. */
  featureMask: Mask;
  /** Plateau cells a piece may stand on (not ramps, not the raised trench). */
  plateauTop: Mask;
  /** Cells along each deployment zone's edge where its trench line runs or could run. */
  trackMask: Mask;
  placed: Placed[];
  spacingIn: number;
  trenchClearanceIn: number;
  edgeMarginIn: number;
  /** The axis the deployment zones face each other along; upright pieces turn across it. */
  sightAxis: Axis | null;
}

const boardRect = (g: Grid, margin = 0): Rect => ({ x0: margin, y0: margin, x1: g.boardIn - margin, y1: g.boardIn - margin });

const isImpassable = (role: Role): boolean => role === "landmark";

export interface AllowOptions {
  coverFor?: string | null;
  onPlateau?: boolean;
}

/** The spacing rules for one free rectangle. */
export function rectAllowed(ctx: PlacementContext, rect: Rect, role: Role, opts: AllowOptions = {}): boolean {
  if (!rectInside(rect, boardRect(ctx.grid, ctx.edgeMarginIn))) return false;
  for (const t of ctx.trenchRects) if (rectDistance(rect, t) < ctx.trenchClearanceIn) return false;
  const cells = cellsInRect(ctx.grid, rect);
  if (opts.onPlateau) {
    if (!cells.every((cell) => ctx.plateauTop.get(cell.c, cell.r))) return false;
  } else if (cells.some((cell) => ctx.featureMask.get(cell.c, cell.r))) return false;
  for (const p of ctx.placed) {
    if (opts.onPlateau && p.kind === "feature" && p.role === "hill" && p.id.startsWith("plateau")) continue;
    for (const r of p.rects) if (rectDistance(rect, r) < ctx.spacingIn) return false;
  }
  for (const o of ctx.objectives) {
    if (o.id !== opts.coverFor && rectContains(rect, o.position[0], o.position[1])) return false;
    if (o.keepOutIn > 0 && rectPointDistance(rect, o.position[0], o.position[1]) < o.keepOutIn) return false;
  }
  for (const zone of ctx.zones) {
    if (!cells.some((cell) => zone.mask.get(cell.c, cell.r))) continue;
    if (zone.spec.noTerrain) return false;
    if (zone.spec.isDeployment && isImpassable(role)) return false;
  }
  return true;
}

const minTrenchDistance = (ctx: PlacementContext, rect: Rect): number => ctx.trenchRects.reduce((m, t) => Math.min(m, rectDistance(rect, t)), Number.POSITIVE_INFINITY);

const edgeDistance = (g: Grid, rect: Rect): number => Math.min(rect.x0, rect.y0, g.boardIn - rect.x1, g.boardIn - rect.y1);

const UPRIGHT_ROLES: readonly Role[] = ["cover", "ruin", "building", "tower", "wire", "dangerous", "landmark"];

// The span of a footprint across the sight axis: what it hides from fire
// running between the deployment zones.
const band = (ctx: PlacementContext, rect: Rect): [number, number] => (ctx.sightAxis === "y" ? [rect.x0, rect.x1] : [rect.y0, rect.y1]);

function bandOverlap(ctx: PlacementContext, rect: Rect): number {
  if (!ctx.sightAxis) return 0;
  const [a0, a1] = band(ctx, rect);
  let n = 0;
  for (const p of ctx.placed) {
    if (!p.placeable || !UPRIGHT_ROLES.includes(p.role)) continue;
    const [b0, b1] = band(ctx, p.rects[0]!);
    n += Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / Math.max(1, a1 - a0);
  }
  return n;
}

// Where the rulebook says each type wants to be (p67): ruins, cover and wire
// hug the trench and spread across the lines of fire, craters and rubble fill
// the gaps, landmarks go anywhere.
function score(ctx: PlacementContext, rect: Rect, role: Role): number {
  switch (role) {
    case "ruin":
    case "cover":
    case "wire":
    case "dangerous":
    case "building":
      return -Math.abs(minTrenchDistance(ctx, rect) - 2) - 1.5 * bandOverlap(ctx, rect);
    case "tower":
      return -Math.abs(minTrenchDistance(ctx, rect) - 1.5);
    case "crater":
    case "difficult":
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

interface Candidate {
  rect: Rect;
  rotY: number;
  score: number;
}

function makePlaced(id: string, placeable: Placeable, rect: Rect, rotY: number, kind: PlacedKind, extra: Partial<Placed> = {}): Placed {
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
    onPlateau: false,
    typeId: TYPE_BY_ROLE[placeable.role] ?? null,
    ...extra,
  };
}

/**
 * Tries seeded positions on a half-inch lattice and keeps the best-scoring
 * valid one. When sampling finds too few spots the whole one-inch lattice is
 * scanned, so a piece is only skipped when nowhere on the board is legal.
 */
export function placeFree(ctx: PlacementContext, placeable: Placeable, id: string, kind: PlacedKind = "dressing", samples = 120, keep = 10): Placed | null {
  const candidates: Candidate[] = [];
  const margin = ctx.edgeMarginIn;
  const span = ctx.grid.boardIn - 2 * margin;
  const consider = (rotY: number, cx: number, cy: number) => {
    const [w, d] = rotatedFootprint(placeable, rotY);
    const rect = rectFromCentre(cx, cy, w, d);
    if (!rectAllowed(ctx, rect, placeable.role)) return;
    candidates.push({ rect, rotY, score: score(ctx, rect, placeable.role) });
  };
  if (Math.max(...placeable.footprintIn) > span) return null;
  const rotations = rotationOrder(ctx, placeable);
  for (let i = 0; i < samples && candidates.length < keep; i++) {
    const rotY = rotations[i % rotations.length]!;
    const [w, d] = rotatedFootprint(placeable, rotY);
    const cx = margin + w / 2 + ctx.rng.int(Math.floor((span - w) * 2) + 1) / 2;
    const cy = margin + d / 2 + ctx.rng.int(Math.floor((span - d) * 2) + 1) / 2;
    consider(rotY, cx, cy);
  }
  if (candidates.length < keep) {
    // 0/180 and 90/270 give the same footprint, so the scan covers two of them, from a seeded start.
    for (const rotY of rotations.filter((r, i) => rotations.findIndex((o) => o % 180 === r % 180) === i)) {
      const [w, d] = rotatedFootprint(placeable, rotY);
      const spots: [number, number][] = [];
      for (let cx = margin + w / 2; cx <= ctx.grid.boardIn - margin - w / 2; cx += 1) for (let cy = margin + d / 2; cy <= ctx.grid.boardIn - margin - d / 2; cy += 1) spots.push([cx, cy]);
      const start = spots.length ? ctx.rng.int(spots.length) : 0;
      for (let i = 0; i < spots.length && candidates.length < keep; i++) {
        const [cx, cy] = spots[(start + i) % spots.length]!;
        consider(rotY, cx, cy);
      }
    }
  }
  if (!candidates.length) return null;
  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
  const placed = makePlaced(id, placeable, best.rect, best.rotY, kind);
  ctx.placed.push(placed);
  return placed;
}

/** Picks placeables for a role, upright ones (or, when space is short, small ones) more often, and not the one just used. */
export function placeableOrder(ctx: PlacementContext, role: Role, avoidKey: string | null, filter: (p: Placeable) => boolean = () => true, preferSmall = false): Placeable[] {
  const options = placeablesFor(ctx.palette, role).filter(filter);
  const weight = (p: Placeable) => (preferSmall ? 1 / area(p) : UPRIGHT_ROLES.includes(role) ? Math.min(4, Math.max(0.6, p.heightIn)) : 1);
  return ctx.rng.weightedOrder(options.map((p) => ({ item: p, weight: weight(p) * (p.key === avoidKey ? 0.2 : 1) })));
}

/** Lays a cell-aligned ground piece (the crater tile) on a free block clear of trenches, features and dressing. */
export function placeGroundBlock(ctx: PlacementContext, piece: PalettePiece, id: string): Placed | null {
  if (!piece.cells) return null;
  const [w, d] = piece.cells;
  const anchors: Cell[] = [];
  for (let c = 0; c + w <= ctx.grid.cols; c++) for (let r = 0; r + d <= ctx.grid.rows; r++) anchors.push({ c, r });
  for (const anchor of ctx.rng.shuffle(anchors)) {
    const cells: Cell[] = [];
    for (let dc = 0; dc < w; dc++) for (let dr = 0; dr < d; dr++) cells.push({ c: anchor.c + dc, r: anchor.r + dr });
    if (cells.some((cell) => ctx.occupiedGround.get(cell.c, cell.r) || ctx.objectiveMask.get(cell.c, cell.r) || ctx.featureMask.get(cell.c, cell.r))) continue;
    const rect: Rect = { x0: anchor.c * ctx.grid.cellIn, y0: anchor.r * ctx.grid.cellIn, x1: (anchor.c + w) * ctx.grid.cellIn, y1: (anchor.r + d) * ctx.grid.cellIn };
    const saved = ctx.edgeMarginIn;
    ctx.edgeMarginIn = 0;
    const ok = rectAllowed(ctx, rect, piece.role);
    ctx.edgeMarginIn = saved;
    if (!ok) continue;
    for (const cell of cells) ctx.occupiedGround.set(cell.c, cell.r);
    const placed = makePlaced(id, placeableOf(piece), rect, 0, "crater-tile", { cells });
    ctx.placed.push(placed);
    return placed;
  }
  return null;
}

// ---- objective covers ---------------------------------------------------------

/** Markers are up to 40mm across (p146); a cover must be able to hold one. */
export const MARKER_IN = 1.6;

export interface CoverChoice {
  objectiveId: string;
  placeable: Placeable;
  rotY: number;
  rect: Rect;
}

export interface CoverRules {
  boardIn: number;
  /** Largest footprint side for a cover, so five covers still leave the trench a way through. */
  maxCoverSideIn: number;
  edgeMarginIn: number;
  spacingIn: number;
  trenchClearanceIn: number;
  /** Rects the covers keep the trench clearance from (the deployment trench tracks). */
  avoid: Rect[];
  /** Footprints already fixed (an objective's plateau), which covers keep the piece spacing from. */
  pieces: Rect[];
}

/**
 * Picks a covering piece per objective that needs one. The scenario only asks
 * that the piece covers the marker, so it may sit off-centre; each level
 * shrinks the choice: 0 draws from the preferred role, 1 takes that role's
 * smallest pieces first, 2 the smallest across all roles.
 */
export function chooseObjectiveCovers(palette: Palette, rng: Rng, objectives: readonly ObjectiveSpec[], levels: Map<string, number>, rules: CoverRules): CoverChoice[] {
  const out: CoverChoice[] = [];
  const board = { x0: rules.edgeMarginIn, y0: rules.edgeMarginIn, x1: rules.boardIn - rules.edgeMarginIn, y1: rules.boardIn - rules.edgeMarginIn };
  for (const o of objectives) {
    if (!o.requiresCover) continue;
    const pools = o.preferredRoles
      .map((role) => placeablesFor(palette, role, true).filter((p) => Math.max(...p.footprintIn) <= rules.maxCoverSideIn && Math.min(...p.footprintIn) >= MARKER_IN))
      .filter((pool) => pool.length);
    if (!pools.length) continue;
    let chosen: CoverChoice | null = null;
    // A level that finds no legal spot falls through to the next, smaller one.
    for (let level = levels.get(o.id) ?? 0; level <= 2 && !chosen; level++) {
      // Smaller pieces of the preferred role are drawn more often, leaving the board room for its other terrain.
      const candidates =
        level === 0
          ? rng.weightedOrder(pools[0]!.map((p) => ({ item: p, weight: 1 / (area(p) * area(p)) })))
          : level === 1
            ? [...pools[0]!].sort((a, b) => area(a) - area(b))
            : pools.flat().sort((a, b) => area(a) - area(b));
      chosen = placeCover(o, candidates.slice(0, 6), level, objectives, out, rng, rules, board);
    }
    if (chosen) out.push(chosen);
  }
  return out;
}

function placeCover(o: ObjectiveSpec, candidates: Placeable[], level: number, objectives: readonly ObjectiveSpec[], chosenSoFar: readonly CoverChoice[], rng: Rng, rules: CoverRules, board: Rect): CoverChoice | null {
  const [px, py] = o.position;
  for (const placeable of candidates) {
    for (const rotY of rng.shuffle(ROTATIONS)) {
      const [w, d] = rotatedFootprint(placeable, rotY);
      const slackX = Math.max(0, w / 2 - 0.5);
      const slackY = Math.max(0, d / 2 - 0.5);
      // Every half-inch offset that keeps the marker covered, shuffled; centred first from level 1.
      const offsets: [number, number][] = [];
      for (let ox = -Math.floor(slackX * 2) / 2; ox <= slackX + 1e-9; ox += 0.5) for (let oy = -Math.floor(slackY * 2) / 2; oy <= slackY + 1e-9; oy += 0.5) offsets.push([ox, oy]);
      const ordered = level === 0 ? rng.shuffle(offsets) : [[0, 0] as [number, number], ...rng.shuffle(offsets)];
      for (const [ox, oy] of ordered) {
        const rect = rectFromCentre(px + ox, py + oy, w, d);
        if (!rectInside(rect, board)) continue;
        if (rectPointDistance({ x0: rect.x0 + 0.5, y0: rect.y0 + 0.5, x1: rect.x1 - 0.5, y1: rect.y1 - 0.5 }, px, py) > 0) continue;
        if (rules.avoid.some((a) => rectDistance(rect, a) < rules.trenchClearanceIn)) continue;
        if (rules.pieces.some((a) => rectDistance(rect, a) < rules.spacingIn)) continue;
        if (chosenSoFar.some((c) => rectDistance(rect, c.rect) < rules.spacingIn)) continue;
        if (objectives.some((other) => other.id !== o.id && rectContains(rect, other.position[0], other.position[1]))) continue;
        return { objectiveId: o.id, placeable, rotY, rect };
      }
    }
  }
  return null;
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
  for (const cover of covers) {
    if (!rectAllowed(ctx, cover.rect, cover.placeable.role, { coverFor: cover.objectiveId })) warnings.push(`cover ${cover.placeable.key} on ${cover.objectiveId} breaks a spacing rule`);
    const entry = makePlaced(`o-${cover.objectiveId}`, cover.placeable, cover.rect, cover.rotY, "cover", { objectiveId: cover.objectiveId });
    ctx.placed.push(entry);
    placed.push(entry);
  }
  return { placed, warnings };
}

// ---- raised ground: plateau and hills -----------------------------------------

export interface Ramp {
  cell: Cell;
  /** The side the ramp climbs toward: the plateau cell it leads onto. */
  up: Dir;
}

export interface Plateau {
  cells: Cell[];
  ramps: Ramp[];
  raisedTrench: { cell: Cell; openings: Dir[] } | null;
}

/**
 * A cell the raised ground may use: open ground, 1in clear of every trench (so
 * no trench in its 8-neighbourhood), clear of covers, objectives, the
 * deployment trench tracks and zones that ban terrain. A plateau inside a
 * deployment zone is a raised firing position its owner deploys onto.
 */
function raisableCell(ctx: PlacementContext, c: number, r: number): boolean {
  if (!inGrid(ctx.grid, c, r)) return false;
  if (ctx.occupiedGround.get(c, r) || ctx.objectiveMask.get(c, r) || ctx.featureMask.get(c, r)) return false;
  for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (ctx.trenchMask.get(c + dc, r + dr)) return false;
  if (ctx.zones.some((z) => z.spec.noTerrain && z.mask.get(c, r))) return false;
  if (ctx.trackMask.get(c, r)) return false;
  const rect = cellRect(ctx.grid, c, r);
  for (const p of ctx.placed) for (const pr of p.rects) if (rectDistance(rect, pr) < ctx.spacingIn) return false;
  for (const o of ctx.objectives) if (rectContains(rect, o.position[0], o.position[1]) || (o.keepOutIn > 0 && rectPointDistance(rect, o.position[0], o.position[1]) < o.keepOutIn)) return false;
  return true;
}

function registerFeature(ctx: PlacementContext, id: string, role: Role, cells: Cell[], typeId: string): Placed {
  const rects = cells.map((cell) => cellRect(ctx.grid, cell.c, cell.r));
  const x0 = Math.min(...rects.map((r) => r.x0));
  const x1 = Math.max(...rects.map((r) => r.x1));
  const y0 = Math.min(...rects.map((r) => r.y0));
  const y1 = Math.max(...rects.map((r) => r.y1));
  for (const cell of cells) ctx.featureMask.set(cell.c, cell.r);
  const placed: Placed = { id, role, kind: "feature", rects, placeable: null, centre: [(x0 + x1) / 2, (y0 + y1) / 2], rotY: 0, cells, objectiveId: null, onPlateau: false, typeId };
  ctx.placed.push(placed);
  return placed;
}

/**
 * Grows a plateau of `size` cells of stacked Landscape tiles (Trenches Square
 * Off's second ground layer) from a seeded cell, keeping it compact, and gives
 * it one or two Hill Ramps on open ground beside it. With a straight run of
 * three cells, the middle one may carry a trench piece instead of a stacked
 * tile: Square Off's trench dug into raised ground.
 */
export function placePlateau(ctx: PlacementContext, size: number, raisedTrenchChance: number): Plateau | null {
  const all: Cell[] = [];
  for (let r = 0; r < ctx.grid.rows; r++) for (let c = 0; c < ctx.grid.cols; c++) all.push({ c, r });
  const seeds = ctx.rng.shuffle(all.filter((cell) => raisableCell(ctx, cell.c, cell.r)));
  for (const seed of seeds.slice(0, 24)) {
    const cells: Cell[] = [seed];
    const inPlateau = (c: number, r: number) => cells.some((x) => x.c === c && x.r === r);
    while (cells.length < size) {
      const frontier: { item: Cell; weight: number }[] = [];
      for (const cell of cells) {
        for (const dir of DIRS) {
          const [dc, dr] = DELTA[dir];
          const next = { c: cell.c + dc, r: cell.r + dr };
          if (inPlateau(next.c, next.r) || frontier.some((f) => f.item.c === next.c && f.item.r === next.r) || !raisableCell(ctx, next.c, next.r)) continue;
          const touching = DIRS.filter((d) => inPlateau(next.c + DELTA[d][0], next.r + DELTA[d][1])).length;
          frontier.push({ item: next, weight: touching * touching });
        }
      }
      if (!frontier.length) break;
      cells.push(ctx.rng.weightedOrder(frontier)[0]!);
    }
    if (cells.length < 2) continue;
    const rampOptions: Ramp[] = [];
    for (const cell of cells) {
      for (const dir of DIRS) {
        const [dc, dr] = DELTA[dir];
        const rc = { c: cell.c - dc, r: cell.r - dr };
        const below = { c: rc.c - dc, r: rc.r - dr };
        if (inPlateau(rc.c, rc.r) || !raisableCell(ctx, rc.c, rc.r)) continue;
        if (!inGrid(ctx.grid, below.c, below.r) || inPlateau(below.c, below.r)) continue;
        rampOptions.push({ cell: rc, up: dir });
      }
    }
    if (!rampOptions.length) continue;
    const order = ctx.rng.shuffle(rampOptions);
    const ramps: Ramp[] = [order[0]!];
    const second = order.find((r) => r.up !== ramps[0]!.up && !(r.cell.c === ramps[0]!.cell.c && r.cell.r === ramps[0]!.cell.r));
    if (second && ctx.rng.chance(0.5)) ramps.push(second);
    let raisedTrench: Plateau["raisedTrench"] = null;
    if (ctx.rng.chance(raisedTrenchChance)) {
      for (const cell of ctx.rng.shuffle(cells)) {
        const axis = (["N", "E"] as const).find((d) => inPlateau(cell.c + DELTA[d][0], cell.r + DELTA[d][1]) && inPlateau(cell.c - DELTA[d][0], cell.r - DELTA[d][1]));
        if (!axis) continue;
        if (ramps.some((rp) => rp.cell.c + DELTA[rp.up][0] === cell.c && rp.cell.r + DELTA[rp.up][1] === cell.r)) continue;
        raisedTrench = { cell, openings: [axis, OPPOSITE[axis]].sort((a, b) => DIRS.indexOf(a) - DIRS.indexOf(b)) };
        break;
      }
    }
    const plateau = { cells, ramps, raisedTrench };
    registerPlateau(ctx, plateau);
    return plateau;
  }
  return null;
}

export interface ObjectivePlateau {
  plateau: Plateau;
  objectiveId: string;
  cover: CoverChoice;
  /** Cells the trench may not use: the plateau, its ramps and the ground at the foot of each ramp. A trench may run along the plateau's foot. */
  keepOut: Mask;
}

/**
 * Ways to raise an objective on a 2x2 plateau with one or two ramps and a
 * ruined building or tower on top covering the marker, so the board's high
 * point is an objective players fight over. Nearest the centre first, then
 * the next objectives out; for each, every 2x2 block round its marker that
 * fits. Planned before the trench, like the other covers.
 */
export function planObjectivePlateaus(grid: Grid, rng: Rng, palette: Palette, objectives: readonly ObjectiveSpec[], blocked: Mask, reserved: Mask, noTerrain: Mask, edgeMarginIn: number, maxObjectives = 3): ObjectivePlateau[] {
  const centre = grid.boardIn / 2;
  const targets = [...objectives]
    .filter((o) => o.requiresCover)
    .sort((a, b) => Math.hypot(a.position[0] - centre, a.position[1] - centre) - Math.hypot(b.position[0] - centre, b.position[1] - centre))
    .slice(0, maxObjectives);
  return targets.flatMap((target) => plansFor(grid, rng, palette, objectives, target, blocked, reserved, noTerrain, edgeMarginIn));
}

function plansFor(grid: Grid, rng: Rng, palette: Palette, objectives: readonly ObjectiveSpec[], target: ObjectiveSpec, blocked: Mask, reserved: Mask, noTerrain: Mask, edgeMarginIn: number): ObjectivePlateau[] {
  const plans: ObjectivePlateau[] = [];
  const home = cellAtPoint(grid, target.position);
  const otherObjectives = objectives.filter((o) => o.id !== target.id);
  // Other markers keep 4in of open ground, enough for a cover piece and its spacing.
  const usable = (c: number, r: number) =>
    inGrid(grid, c, r) &&
    !reserved.get(c, r) &&
    !noTerrain.get(c, r) &&
    (!blocked.get(c, r) || (c === home.c && r === home.r)) &&
    !otherObjectives.some((o) => rectPointDistance(cellRect(grid, c, r), o.position[0], o.position[1]) < 4);
  const pool = [...placeablesFor(palette, "building", true), ...placeablesFor(palette, "tower", true)].filter((p) => Math.min(...p.footprintIn) >= MARKER_IN);
  for (const [dc, dr] of rng.shuffle([
    [0, 0],
    [-1, 0],
    [0, -1],
    [-1, -1],
  ] as const)) {
    const cells: Cell[] = [
      { c: home.c + dc, r: home.r + dr },
      { c: home.c + dc + 1, r: home.r + dr },
      { c: home.c + dc, r: home.r + dr + 1 },
      { c: home.c + dc + 1, r: home.r + dr + 1 },
    ];
    if (!cells.every((cell) => usable(cell.c, cell.r))) continue;
    const block: Rect = { x0: cells[0]!.c * grid.cellIn, y0: cells[0]!.r * grid.cellIn, x1: (cells[0]!.c + 2) * grid.cellIn, y1: (cells[0]!.r + 2) * grid.cellIn };
    const inPlateau = (c: number, r: number) => cells.some((x) => x.c === c && x.r === r);
    const rampOptions: Ramp[] = [];
    for (const cell of cells) {
      for (const dir of DIRS) {
        const rc = { c: cell.c - DELTA[dir][0], r: cell.r - DELTA[dir][1] };
        const below = { c: rc.c - DELTA[dir][0], r: rc.r - DELTA[dir][1] };
        if (inPlateau(rc.c, rc.r) || !usable(rc.c, rc.r) || blocked.get(rc.c, rc.r)) continue;
        if (!inGrid(grid, below.c, below.r) || inPlateau(below.c, below.r) || reserved.get(below.c, below.r)) continue;
        rampOptions.push({ cell: rc, up: dir });
      }
    }
    if (!rampOptions.length) continue;
    const order = rng.shuffle(rampOptions);
    const ramps: Ramp[] = [order[0]!];
    const second = order.find((r) => r.up !== ramps[0]!.up && !(r.cell.c === ramps[0]!.cell.c && r.cell.r === ramps[0]!.cell.r));
    if (second && rng.chance(0.4)) ramps.push(second);
    let cover: CoverChoice | null = null;
    for (const placeable of rng.shuffle(pool)) {
      for (const rotY of rng.shuffle(ROTATIONS)) {
        const [w, d] = rotatedFootprint(placeable, rotY);
        const rect = rectFromCentre((block.x0 + block.x1) / 2, (block.y0 + block.y1) / 2, w, d);
        const inner = { x0: block.x0 + 0.25, y0: block.y0 + 0.25, x1: block.x1 - 0.25, y1: block.y1 - 0.25 };
        if (!rectInside(rect, inner) || !rectInside(rect, boardRect(grid, edgeMarginIn))) continue;
        if (rectPointDistance({ x0: rect.x0 + 0.5, y0: rect.y0 + 0.5, x1: rect.x1 - 0.5, y1: rect.y1 - 0.5 }, target.position[0], target.position[1]) > 0) continue;
        cover = { objectiveId: target.id, placeable, rotY, rect };
        break;
      }
      if (cover) break;
    }
    if (!cover) continue;
    const keepOut = new Mask(grid);
    for (const cell of [...cells, ...ramps.map((r) => r.cell), ...ramps.map((r) => ({ c: r.cell.c - DELTA[r.up][0], r: r.cell.r - DELTA[r.up][1] }))]) keepOut.set(cell.c, cell.r);
    plans.push({ plateau: { cells, ramps, raisedTrench: null }, objectiveId: target.id, cover, keepOut });
  }
  return plans;
}

/** Records a plateau planned before the trench (the objective's) in the placement context. */
export function registerPlateau(ctx: PlacementContext, plateau: Plateau): void {
  registerFeature(ctx, "plateau", "hill", [...plateau.cells, ...plateau.ramps.map((r) => r.cell)], "hill");
  for (const cell of plateau.cells) if (!(plateau.raisedTrench && plateau.raisedTrench.cell.c === cell.c && plateau.raisedTrench.cell.r === cell.r)) ctx.plateauTop.set(cell.c, cell.r);
}

const cellAtPoint = (grid: Grid, p: readonly [number, number]): Cell => ({ c: Math.min(grid.cols - 1, Math.floor(p[0] / grid.cellIn)), r: Math.min(grid.rows - 1, Math.floor(p[1] / grid.cellIn)) });

export interface Hill {
  id: string;
  cells: Cell[];
  /** Cells carrying a second H4x4 on top (Armoured Train's stepped hills). */
  stepped: Cell[];
}

/** A one- or two-cell hill of H4x4 blocks, sometimes stepped. */
export function placeHill(ctx: PlacementContext, id: string, cellsWanted: number, stepChance: number): Hill | null {
  const all: Cell[] = [];
  for (let r = 0; r < ctx.grid.rows; r++) for (let c = 0; c < ctx.grid.cols; c++) all.push({ c, r });
  for (const seed of ctx.rng.shuffle(all.filter((cell) => raisableCell(ctx, cell.c, cell.r))).slice(0, 24)) {
    const cells = [seed];
    if (cellsWanted > 1) {
      const next = ctx.rng.shuffle(DIRS).map((d) => ({ c: seed.c + DELTA[d][0], r: seed.r + DELTA[d][1] })).find((n) => raisableCell(ctx, n.c, n.r));
      if (next) cells.push(next);
    }
    const stepped = ctx.rng.chance(stepChance) ? [ctx.rng.pick(cells)] : [];
    registerFeature(ctx, id, "hill", cells, "hill");
    return { id, cells, stepped };
  }
  return null;
}

// ---- tall pieces ------------------------------------------------------------

export const TALL_MIN_HEIGHT_IN = 6;

const isTall = (p: Placeable): boolean => p.heightIn >= TALL_MIN_HEIGHT_IN;

/** Puts a tower or multi-storey ruin on the plateau if one fits its top, centred on a block of plateau cells. */
export function placeTallOnPlateau(ctx: PlacementContext, plateau: Plateau, id: string): Placed | null {
  const pool = ctx.rng.shuffle([...placeablesFor(ctx.palette, "tower", true), ...placeablesFor(ctx.palette, "building", true)].filter(isTall));
  const tops = plateau.cells.filter((cell) => ctx.plateauTop.get(cell.c, cell.r));
  const blocks: Rect[] = [];
  for (const cell of tops) {
    const base = cellRect(ctx.grid, cell.c, cell.r);
    blocks.push(base);
    for (const [dc, dr] of [
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const shape = dc === 1 && dr === 1 ? [{ c: cell.c + 1, r: cell.r }, { c: cell.c, r: cell.r + 1 }, { c: cell.c + 1, r: cell.r + 1 }] : [{ c: cell.c + dc, r: cell.r + dr }];
      if (shape.every((s) => ctx.plateauTop.get(s.c, s.r))) blocks.push({ ...base, x1: base.x1 + dc * ctx.grid.cellIn, y1: base.y1 + dr * ctx.grid.cellIn });
    }
  }
  for (const placeable of pool) {
    for (const block of ctx.rng.shuffle(blocks)) {
      for (const rotY of ctx.rng.shuffle(ROTATIONS)) {
        const [w, d] = rotatedFootprint(placeable, rotY);
        const rect = rectFromCentre((block.x0 + block.x1) / 2, (block.y0 + block.y1) / 2, w, d);
        if (!rectInside(rect, block)) continue;
        if (!rectAllowed(ctx, rect, placeable.role, { onPlateau: true })) continue;
        const placed = makePlaced(id, placeable, rect, rotY, "tall", { onPlateau: true });
        ctx.placed.push(placed);
        return placed;
      }
    }
  }
  return null;
}

/** Puts a tall piece beside the network: on open ground, close to a trench but at least the clearance away. */
export function placeTallBeside(ctx: PlacementContext, id: string): Placed | null {
  const pool = ctx.rng.shuffle([...placeablesFor(ctx.palette, "tower", true), ...placeablesFor(ctx.palette, "building", true)].filter(isTall));
  for (const placeable of pool.slice(0, 6)) {
    const placed = placeFree(ctx, placeable, id, "tall");
    if (placed) return placed;
  }
  return null;
}

// ---- dressing ---------------------------------------------------------------

export interface DressingResult {
  placed: Placed[];
  shortfalls: { typeId: string; min: number; target: number; placed: number }[];
}

// Landmarks are the most constrained type (impassable, so barred from the
// deployment zones) and go down first; house extras go last.
const placementOrder = (targets: readonly CompositionTarget[]): CompositionTarget[] =>
  [...targets].sort((a, b) => Number(b.typeId === "landmark") - Number(a.typeId === "landmark") || Number(a.house) - Number(b.house));

/**
 * Places the archetype's extras up to the density target, one piece of each
 * type per round so no type starves the ones after it, cycling each type's roles.
 */
export function placeDressing(ctx: PlacementContext, targets: readonly CompositionTarget[], alreadyByType: Map<string, number>, idPrefix = "d", preferSmall = false): DressingResult {
  const placed: Placed[] = [];
  let n = 0;
  const order = placementOrder(targets);
  const counts = new Map(order.map((t) => [t.typeId, alreadyByType.get(t.typeId) ?? 0]));
  const stuck = new Set<string>();
  const lastByRole = new Map<Role, string>();
  const turns = new Map<string, number>();
  for (let progress = true; progress; ) {
    progress = false;
    for (const target of order) {
      if (stuck.has(target.typeId) || counts.get(target.typeId)! >= target.target) continue;
      const i = turns.get(target.typeId) ?? 0;
      turns.set(target.typeId, i + 1);
      const roles = [...target.roles.slice(i % target.roles.length), ...target.roles.slice(0, i % target.roles.length)];
      let done: Placed | null = null;
      for (const role of roles) {
        const groundBlocks = piecesByRole(ctx.palette, role).filter((p) => p.layer === "ground" && p.cells);
        if (groundBlocks.length && !preferSmall && ctx.rng.chance(0.5)) {
          done = placeGroundBlock(ctx, ctx.rng.pick(groundBlocks), `${idPrefix}-${n}`);
          if (done) break;
        }
        // The minimums try every piece of the role; filling to the density target tries a handful.
        const tries = placeableOrder(ctx, role, lastByRole.get(role) ?? null, (p) => !isTall(p) || role !== "tower", preferSmall);
        for (const placeable of preferSmall ? tries : tries.slice(0, 6)) {
          done = placeFree(ctx, placeable, `${idPrefix}-${n}`);
          if (done) break;
        }
        if (done) {
          lastByRole.set(role, done.placeable?.key ?? "");
          break;
        }
      }
      if (!done) {
        stuck.add(target.typeId);
        continue;
      }
      n++;
      counts.set(target.typeId, counts.get(target.typeId)! + 1);
      placed.push(done);
      progress = true;
    }
  }
  const shortfalls = order.filter((t) => counts.get(t.typeId)! < t.target).map((t) => ({ typeId: t.typeId, min: t.min, target: t.target, placed: counts.get(t.typeId)! }));
  return { placed, shortfalls };
}

// ---- ground tiles -------------------------------------------------------------

export interface GroundTile {
  paletteId: string;
  rotY: number;
  cells: Cell[];
  rect: Rect;
}

/**
 * Fills cells with Landscape tiles, packing 2x2 and 1x2 tiles where they fit.
 * Cells in `noQuads` take only 1x1 and 1x2 tiles, whose tops are level, so
 * anything stacked on them sits flat.
 */
export function tileCells(grid: Grid, cells: readonly Cell[], palette: Palette, rng: Rng, noQuads: Mask | null = null): GroundTile[] {
  const ground = piecesByRole(palette, "ground").filter((p) => p.layer === "ground" && p.cells);
  const single = ground.find((p) => p.cells![0] === 1 && p.cells![1] === 1);
  const double = ground.find((p) => p.cells![0] === 1 && p.cells![1] === 2);
  const quad = ground.find((p) => p.cells![0] === 2 && p.cells![1] === 2);
  if (!single) throw new Error("palette needs an enabled 1x1 ground tile");
  const todo = new Set(cells.map((cell) => cellKey(cell.c, cell.r)));
  const free = (c: number, r: number): boolean => todo.has(cellKey(c, r));
  const tiles: GroundTile[] = [];
  const lay = (piece: PalettePiece, rotY: number, laid: Cell[]) => {
    for (const cell of laid) todo.delete(cellKey(cell.c, cell.r));
    const cs = laid.map((x) => x.c);
    const rs = laid.map((x) => x.r);
    const rect: Rect = { x0: Math.min(...cs) * grid.cellIn, y0: Math.min(...rs) * grid.cellIn, x1: (Math.max(...cs) + 1) * grid.cellIn, y1: (Math.max(...rs) + 1) * grid.cellIn };
    tiles.push({ paletteId: piece.id, rotY, cells: laid, rect });
  };
  for (const { c, r } of rng.shuffle(cells)) {
    if (!free(c, r)) continue;
    const block = [
      { c, r },
      { c: c + 1, r },
      { c, r: r + 1 },
      { c: c + 1, r: r + 1 },
    ];
    if (quad && rng.chance(0.6) && block.every((b) => free(b.c, b.r) && !noQuads?.get(b.c, b.r))) {
      lay(quad, 0, block);
      continue;
    }
    if (double && rng.chance(0.85)) {
      const along = rng.pick(["N", "E"] as const);
      if (along === "N" && free(c, r + 1)) {
        lay(double, 0, [
          { c, r },
          { c, r: r + 1 },
        ]);
        continue;
      }
      if (along === "E" && free(c + 1, r)) {
        lay(double, 90, [
          { c, r },
          { c: c + 1, r },
        ]);
        continue;
      }
    }
    lay(single, 0, [{ c, r }]);
  }
  return tiles.sort((a, b) => a.rect.y0 - b.rect.y0 || a.rect.x0 - b.rect.x0);
}

/** Fills every cell not in `occupied` with ground tiles. */
export function tileGround(grid: Grid, occupied: Mask, palette: Palette, rng: Rng, noQuads: Mask | null = null): GroundTile[] {
  const cells: Cell[] = [];
  for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) if (!occupied.get(c, r)) cells.push({ c, r });
  return tileCells(grid, cells, palette, rng, noQuads);
}
