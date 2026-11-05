import { cellRect, cellsInRect, Mask, rectContains, rectDistance, rectFromCentre, rectInside, rectPointDistance, type Cell, type Grid, type Rect } from "./grid.js";
import { piecesByRole, rotatedFootprint, type Palette, type PalettePiece, type Role } from "./palette.js";
import type { Rng } from "./rng.js";
import type { ObjectiveSpec, ZoneSpec } from "./scenario.js";

// Everything that is not the trench network: objective covers, crater tiles
// laid into the ground grid, and the free-floating dressing. The rulebook
// spacing (3in between pieces, 1in from any trench, p67) is measured between
// axis-aligned footprint rectangles in board inches.

export interface ArchetypeSpec {
  id: string;
  name: string;
  composition: { typeId: string; count?: string; required: boolean }[];
  density: "sparse" | "medium" | "dense";
}

export const ROLES_BY_TERRAIN_TYPE: Record<string, Role[]> = {
  "corner-ruin": ["ruin"],
  "ruined-building": ["ruin"],
  "dangerous-terrain": ["wire", "dangerous"],
  "difficult-terrain": ["crater", "difficult"],
  landmark: ["landmark"],
  hill: ["hill"],
};

export interface CompositionTarget {
  typeId: string;
  roles: Role[];
  min: number;
  target: number;
  required: boolean;
}

const DENSITY_BONUS = { sparse: 0, medium: 1, dense: 2 } as const;

/** Per terrain type, the rulebook minimum ("2+") and the count the density aims for. */
export function compositionTargets(archetype: ArchetypeSpec): CompositionTarget[] {
  const out: CompositionTarget[] = [];
  for (const entry of archetype.composition) {
    const roles = ROLES_BY_TERRAIN_TYPE[entry.typeId];
    if (!roles) continue;
    const parsed = Number.parseInt(entry.count ?? "", 10);
    const min = Number.isFinite(parsed) ? parsed : 2;
    out.push({ typeId: entry.typeId, roles, min, target: min + DENSITY_BONUS[archetype.density], required: entry.required });
  }
  return out;
}

export type PlacedKind = "cover" | "crater-tile" | "dressing";

export interface Placed {
  id: string;
  role: Role;
  paletteId: string;
  kind: PlacedKind;
  rect: Rect;
  position: [number, number];
  rotY: number;
  footprintIn: [number, number];
  /** Cells for ground-layer pieces; null for free pieces. */
  cells: Cell[] | null;
  objectiveId: string | null;
}

export interface PlacementContext {
  grid: Grid;
  rng: Rng;
  palette: Palette;
  trenchRects: Rect[];
  zones: { spec: ZoneSpec; mask: Mask }[];
  objectives: ObjectiveSpec[];
  objectiveMask: Mask;
  /** Trench cells plus ground-layer dressing already laid. */
  occupiedGround: Mask;
  placed: Placed[];
  spacingIn: number;
  trenchClearanceIn: number;
}

const boardRect = (g: Grid): Rect => ({ x0: 0, y0: 0, x1: g.boardIn, y1: g.boardIn });

const isImpassable = (role: Role): boolean => role === "landmark";

/** The spacing rules for one free rectangle; `coverFor` names the objective it is allowed to sit on. */
export function rectAllowed(ctx: PlacementContext, rect: Rect, role: Role, coverFor: string | null): boolean {
  if (!rectInside(rect, boardRect(ctx.grid))) return false;
  for (const t of ctx.trenchRects) if (rectDistance(rect, t) < ctx.trenchClearanceIn) return false;
  for (const p of ctx.placed) if (rectDistance(rect, p.rect) < ctx.spacingIn) return false;
  for (const o of ctx.objectives) {
    if (o.id !== coverFor && rectContains(rect, o.position[0], o.position[1])) return false;
    if (o.keepOutIn > 0 && rectPointDistance(rect, o.position[0], o.position[1]) < o.keepOutIn) return false;
  }
  const cells = cellsInRect(ctx.grid, rect);
  for (const zone of ctx.zones) {
    const inZone = cells.some((cell) => zone.mask.get(cell.c, cell.r));
    if (!inZone) continue;
    if (zone.spec.noTerrain) return false;
    if (zone.spec.isDeployment && isImpassable(role)) return false;
  }
  return true;
}

const minTrenchDistance = (ctx: PlacementContext, rect: Rect): number => ctx.trenchRects.reduce((m, t) => Math.min(m, rectDistance(rect, t)), Number.POSITIVE_INFINITY);

const edgeDistance = (g: Grid, rect: Rect): number => Math.min(rect.x0, rect.y0, g.boardIn - rect.x1, g.boardIn - rect.y1);

// Where the rulebook says each type wants to be (p67): ruins and wire hug the
// trench, craters and rubble fill the gaps, landmarks go anywhere.
function score(ctx: PlacementContext, rect: Rect, role: Role): number {
  switch (role) {
    case "ruin":
    case "wire":
    case "dangerous":
      return -Math.abs(minTrenchDistance(ctx, rect) - 2);
    case "crater":
    case "difficult":
      return Math.min(edgeDistance(ctx.grid, rect), 6);
    default:
      return ctx.rng.next();
  }
}

const surfacePieces = (palette: Palette, role: Role): PalettePiece[] => piecesByRole(palette, role).filter((p) => p.layer === "surface");

export function pickPiece(ctx: PlacementContext, role: Role, avoidPaletteId: string | null): PalettePiece | null {
  const options = piecesByRole(ctx.palette, role);
  if (!options.length) return null;
  const fresh = options.filter((p) => p.id !== avoidPaletteId);
  return ctx.rng.pick(fresh.length ? fresh : options);
}

interface Candidate {
  rect: Rect;
  rotY: number;
  footprint: [number, number];
  score: number;
}

const ROTATIONS = [0, 90, 180, 270] as const;

/**
 * Tries seeded positions on a half-inch lattice and keeps the best-scoring
 * valid one. When sampling finds too few spots the whole one-inch lattice is
 * scanned, so a piece is only skipped when nowhere on the board is legal.
 */
export function placeFree(ctx: PlacementContext, piece: PalettePiece, role: Role, id: string, samples = 120, keep = 10): Placed | null {
  const candidates: Candidate[] = [];
  const consider = (rotY: number, cx: number, cy: number) => {
    const footprint = rotatedFootprint(piece, rotY);
    const rect = rectFromCentre(cx, cy, footprint[0], footprint[1]);
    if (!rectAllowed(ctx, rect, role, null)) return;
    candidates.push({ rect, rotY, footprint, score: score(ctx, rect, role) });
  };
  if (piece.footprintIn[0] > ctx.grid.boardIn || piece.footprintIn[1] > ctx.grid.boardIn) return null;
  for (let i = 0; i < samples && candidates.length < keep; i++) {
    const rotY = ctx.rng.pick(ROTATIONS);
    const [w, d] = rotatedFootprint(piece, rotY);
    const cx = w / 2 + ctx.rng.int(Math.floor((ctx.grid.boardIn - w) * 2) + 1) / 2;
    const cy = d / 2 + ctx.rng.int(Math.floor((ctx.grid.boardIn - d) * 2) + 1) / 2;
    consider(rotY, cx, cy);
  }
  if (candidates.length < keep) {
    for (const rotY of ctx.rng.shuffle(ROTATIONS)) {
      const [w, d] = rotatedFootprint(piece, rotY);
      for (let cx = w / 2; cx <= ctx.grid.boardIn - w / 2; cx += 1) for (let cy = d / 2; cy <= ctx.grid.boardIn - d / 2; cy += 1) consider(rotY, cx, cy);
    }
  }
  if (!candidates.length) return null;
  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
  const placed: Placed = {
    id,
    role,
    paletteId: piece.id,
    kind: "dressing",
    rect: best.rect,
    position: [(best.rect.x0 + best.rect.x1) / 2, (best.rect.y0 + best.rect.y1) / 2],
    rotY: best.rotY,
    footprintIn: best.footprint,
    cells: null,
    objectiveId: null,
  };
  ctx.placed.push(placed);
  return placed;
}

/** Lays a cell-aligned ground piece (the crater tile) on a free block clear of trenches and dressing. */
export function placeGroundBlock(ctx: PlacementContext, piece: PalettePiece, role: Role, id: string): Placed | null {
  if (!piece.cells) return null;
  const [w, d] = piece.cells;
  const anchors: Cell[] = [];
  for (let c = 0; c + w <= ctx.grid.cols; c++) for (let r = 0; r + d <= ctx.grid.rows; r++) anchors.push({ c, r });
  for (const anchor of ctx.rng.shuffle(anchors)) {
    const cells: Cell[] = [];
    for (let dc = 0; dc < w; dc++) for (let dr = 0; dr < d; dr++) cells.push({ c: anchor.c + dc, r: anchor.r + dr });
    if (cells.some((cell) => ctx.occupiedGround.get(cell.c, cell.r) || ctx.objectiveMask.get(cell.c, cell.r))) continue;
    const rect: Rect = { x0: anchor.c * ctx.grid.cellIn, y0: anchor.r * ctx.grid.cellIn, x1: (anchor.c + w) * ctx.grid.cellIn, y1: (anchor.r + d) * ctx.grid.cellIn };
    if (!rectAllowed(ctx, rect, role, null)) continue;
    for (const cell of cells) ctx.occupiedGround.set(cell.c, cell.r);
    const placed: Placed = {
      id,
      role,
      paletteId: piece.id,
      kind: "crater-tile",
      rect,
      position: [(rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2],
      rotY: 0,
      footprintIn: [rect.x1 - rect.x0, rect.y1 - rect.y0],
      cells,
      objectiveId: null,
    };
    ctx.placed.push(placed);
    return placed;
  }
  return null;
}

export interface CoverChoice {
  objectiveId: string;
  piece: PalettePiece;
  rotY: number;
  rect: Rect;
}

/**
 * Picks a covering piece per objective that needs one. Level 0 draws from the
 * objective's preferred role; level 1 takes the smallest candidate across its
 * roles, which is what the generator falls back to when big covers leave the
 * trench no way through.
 */
export function chooseObjectiveCovers(palette: Palette, rng: Rng, objectives: ObjectiveSpec[], levels: Map<string, number>): CoverChoice[] {
  const out: CoverChoice[] = [];
  for (const o of objectives) {
    if (!o.requiresCover) continue;
    const level = levels.get(o.id) ?? 0;
    const pools = o.preferredRoles.map((role) => surfacePieces(palette, role)).filter((pool) => pool.length);
    if (!pools.length) continue;
    const rotY = rng.pick([0, 90]);
    let piece: PalettePiece;
    if (level === 0) {
      piece = rng.pick(pools[0]!);
    } else {
      const all = pools.flat();
      piece = all.reduce((a, b) => (b.footprintIn[0] * b.footprintIn[1] < a.footprintIn[0] * a.footprintIn[1] ? b : a));
    }
    const [w, d] = rotatedFootprint(piece, rotY);
    out.push({ objectiveId: o.id, piece, rotY, rect: rectFromCentre(o.position[0], o.position[1], w, d) });
  }
  return out;
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
    const role = cover.piece.role;
    if (!rectAllowed(ctx, cover.rect, role, cover.objectiveId)) warnings.push(`cover ${cover.piece.id} on ${cover.objectiveId} breaks a spacing rule`);
    const [w, d] = rotatedFootprint(cover.piece, cover.rotY);
    const entry: Placed = {
      id: `o-${cover.objectiveId}`,
      role,
      paletteId: cover.piece.id,
      kind: "cover",
      rect: cover.rect,
      position: [(cover.rect.x0 + cover.rect.x1) / 2, (cover.rect.y0 + cover.rect.y1) / 2],
      rotY: cover.rotY,
      footprintIn: [w, d],
      cells: null,
      objectiveId: cover.objectiveId,
    };
    ctx.placed.push(entry);
    placed.push(entry);
  }
  return { placed, warnings };
}

export interface DressingResult {
  placed: Placed[];
  shortfalls: { typeId: string; min: number; target: number; placed: number }[];
}

// Landmarks are the most constrained type (impassable, so barred from the
// deployment zones) and go down first; the rest follow the archetype's order.
const placementOrder = (targets: readonly CompositionTarget[]): CompositionTarget[] => [...targets].sort((a, b) => Number(b.typeId === "landmark") - Number(a.typeId === "landmark"));

/** Places the archetype's extras up to the density target, cycling the type's roles. */
export function placeDressing(ctx: PlacementContext, targets: readonly CompositionTarget[], alreadyByType: Map<string, number>): DressingResult {
  const placed: Placed[] = [];
  const shortfalls: DressingResult["shortfalls"] = [];
  let n = 0;
  for (const target of placementOrder(targets)) {
    let count = alreadyByType.get(target.typeId) ?? 0;
    const lastByRole = new Map<Role, string>();
    for (let i = 0; count < target.target; i++) {
      const order = [...target.roles.slice(i % target.roles.length), ...target.roles.slice(0, i % target.roles.length)];
      let done: Placed | null = null;
      for (const role of order) {
        const piece = pickPiece(ctx, role, lastByRole.get(role) ?? null);
        if (!piece) continue;
        done = piece.layer === "ground" ? placeGroundBlock(ctx, piece, role, `d-${n}`) : placeFree(ctx, piece, role, `d-${n}`);
        if (done) {
          lastByRole.set(role, piece.id);
          break;
        }
      }
      if (!done) break;
      n++;
      count++;
      placed.push(done);
    }
    if (count < target.target) shortfalls.push({ typeId: target.typeId, min: target.min, target: target.target, placed: count });
  }
  return { placed, shortfalls };
}

export interface GroundTile {
  paletteId: string;
  rotY: number;
  cells: Cell[];
  rect: Rect;
}

/** Fills every free cell with ground tiles, packing 2x2 and 1x2 tiles where they fit. */
export function tileGround(grid: Grid, occupied: Mask, palette: Palette, rng: Rng): GroundTile[] {
  const ground = piecesByRole(palette, "ground").filter((p) => p.layer === "ground" && p.cells);
  const single = ground.find((p) => p.cells![0] === 1 && p.cells![1] === 1);
  const double = ground.find((p) => p.cells![0] === 1 && p.cells![1] === 2);
  const quad = ground.find((p) => p.cells![0] === 2 && p.cells![1] === 2);
  if (!single) throw new Error("palette needs an enabled 1x1 ground tile");
  const filled = occupied.clone();
  const free = (c: number, r: number): boolean => c < grid.cols && r < grid.rows && !filled.get(c, r);
  const all: Cell[] = [];
  for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) all.push({ c, r });
  const tiles: GroundTile[] = [];
  const lay = (piece: PalettePiece, rotY: number, cells: Cell[]) => {
    for (const cell of cells) filled.set(cell.c, cell.r);
    const cs = cells.map((x) => x.c);
    const rs = cells.map((x) => x.r);
    const rect: Rect = { x0: Math.min(...cs) * grid.cellIn, y0: Math.min(...rs) * grid.cellIn, x1: (Math.max(...cs) + 1) * grid.cellIn, y1: (Math.max(...rs) + 1) * grid.cellIn };
    tiles.push({ paletteId: piece.id, rotY, cells, rect });
  };
  for (const { c, r } of rng.shuffle(all)) {
    if (!free(c, r)) continue;
    if (quad && rng.chance(0.6) && free(c + 1, r) && free(c, r + 1) && free(c + 1, r + 1)) {
      lay(quad, 0, [
        { c, r },
        { c: c + 1, r },
        { c, r: r + 1 },
        { c: c + 1, r: r + 1 },
      ]);
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
