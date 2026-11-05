import { z } from "zod";
import { DIRS, rotateDir, type Dir } from "./grid.js";

// The curated piece palette (data/tts/palette.json): what each TTS asset is
// for, how big it looks, where its pivot sits, how high it rests on whatever
// is under it, what can stand on it, and for trench pieces which sides are open
// and which walls are already lined. The catalog supplies the asset itself
// (kind, urls, scale, colour) at build time so the palette stays small.

export const PALETTE_SCHEMA = "tc-tts-palette-v2";

export const Role = z.enum([
  "ground",
  "trench-straight",
  "trench-corner",
  "trench-t",
  "trench-entrance",
  "ramp",
  "hill",
  "crater",
  "difficult",
  "dangerous",
  "wire",
  "ruin",
  "building",
  "tower",
  "cover",
  "landmark",
  "decor",
  "revetment",
]);
export type Role = z.infer<typeof Role>;

export const TRENCH_ROLES: readonly Role[] = ["trench-straight", "trench-corner", "trench-t", "trench-entrance"];
export const isTrenchRole = (role: Role): boolean => TRENCH_ROLES.includes(role);

export const Layer = z.enum(["ground", "surface"]);
export type Layer = z.infer<typeof Layer>;

const DirSchema = z.enum(["N", "E", "S", "W"]);
const Pair = z.tuple([z.number(), z.number()]);

export const WallSource = z.enum(["visual", "collider", "assumed"]);

export const PalettePiece = z
  .object({
    id: z.string().min(1),
    assetId: z.string().regex(/^[0-9a-f]{12}$/),
    name: z.string(),
    role: Role,
    layer: Layer,
    /** Footprint in whole cells at rotY 0 ([across x, along y]); null for free-floating pieces. */
    cells: z.tuple([z.number().int().positive(), z.number().int().positive()]).nullable(),
    /** Visual footprint in inches at rotY 0 ([x extent, y extent]). */
    footprintIn: z.tuple([z.number().positive(), z.number().positive()]),
    heightIn: z.number().nonnegative(),
    /** Pivot height above the surface the piece rests on. */
    restHeightIn: z.number(),
    /** Visual bounds centre minus pivot, in inches at rotY 0 ([x, y]). */
    pivotOffsetIn: Pair,
    /** Height of the piece's top above its own support, for pieces others stand on. */
    topIn: z.number().positive().optional(),
    /** Trench pieces: height of the channel floor above the piece's bottom. */
    channelFloorIn: z.number().nonnegative().optional(),
    openings: z.object({ rotY0: z.array(DirSchema).min(1).max(4), verified: z.boolean() }).optional(),
    /** Trench pieces: walls the mesh already lines (fire-step ledge or logs), at rotY 0. */
    decoratedWalls: z.object({ rotY0: z.array(DirSchema), kind: z.enum(["ledge", "logs"]), source: WallSource, note: z.string().optional() }).optional(),
    /** Ramps: the side the slope climbs toward, at rotY 0. */
    uphill: z.object({ rotY0: DirSchema, verified: z.boolean() }).optional(),
    enabled: z.boolean(),
    verified: z.boolean(),
    note: z.string().optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${p.id}: ${message}` });
    if (isTrenchRole(p.role) && !p.openings) issue("trench pieces need an openings table");
    if (p.openings && !isTrenchRole(p.role)) issue("only trench pieces carry openings");
    if (p.decoratedWalls && !isTrenchRole(p.role)) issue("only trench pieces carry decorated walls");
    if (p.openings && new Set(p.openings.rotY0).size !== p.openings.rotY0.length) issue("duplicate openings");
    if (p.openings && p.decoratedWalls?.rotY0.some((d) => p.openings!.rotY0.includes(d))) issue("a decorated wall cannot be an opening");
    if (p.layer === "ground" && !p.cells) issue("ground-layer pieces are cell-aligned and need cells");
    if (p.role === "ramp" && !p.uphill) issue("ramps need an uphill side");
    const expectedCount = { "trench-straight": 2, "trench-corner": 2, "trench-t": 3, "trench-entrance": 1 }[p.role as string];
    if (expectedCount !== undefined && p.openings && p.openings.rotY0.length !== expectedCount) issue(`${p.role} has ${p.openings.rotY0.length} openings, expected ${expectedCount}`);
  });
export type PalettePiece = z.infer<typeof PalettePiece>;

export const GroupMember = z.object({ piece: z.string(), at: Pair, rotY: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]) }).strict();

// Several objects that make one rulebook terrain piece (a wire line, a crate
// stack), placed and spaced as one footprint.
export const PaletteGroup = z
  .object({ id: z.string().min(1), role: Role, members: z.array(GroupMember).min(2), enabled: z.boolean().optional(), note: z.string().optional() })
  .strict();
export type PaletteGroup = z.infer<typeof PaletteGroup>;

export const RotYSense = z.enum(["cw", "ccw"]);
export type RotYSense = z.infer<typeof RotYSense>;

export const Revetment = z
  .object({
    pieceId: z.string(),
    /** Body centre's distance in from the trench cell centre toward the wall. */
    insetIn: z.number().positive(),
    /** Height of the fence's bottom above the trench piece's bottom. */
    bottomAboveTrenchBaseIn: z.number(),
    /** Wall faces shorter than this (the stubs at corners and junctions) are left bare. */
    minFaceLengthIn: z.number().positive(),
    source: z.string().optional(),
  })
  .strict();
export type Revetment = z.infer<typeof Revetment>;

export const Palette = z
  .object({
    $schema: z.literal(PALETTE_SCHEMA),
    name: z.string(),
    cellIn: z.number().positive(),
    groundTopIn: z.number().positive(),
    coordinates: z.string().optional(),
    rotation: z.object({ rotYSense: RotYSense, verified: z.boolean(), note: z.string().optional() }),
    revetment: Revetment,
    sources: z.record(z.string()).optional(),
    pieces: z.array(PalettePiece).min(1),
    groups: z.array(PaletteGroup).default([]),
  })
  .strict()
  .superRefine((p, ctx) => {
    const ids = new Set<string>();
    for (const piece of p.pieces) {
      if (ids.has(piece.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate piece id ${piece.id}` });
      ids.add(piece.id);
    }
    for (const g of p.groups) {
      if (ids.has(g.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `group ${g.id} shares an id with a piece` });
      for (const m of g.members) if (!ids.has(m.piece)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `group ${g.id} uses unknown piece ${m.piece}` });
    }
    const fence = p.pieces.find((x) => x.id === p.revetment.pieceId);
    if (!fence) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `revetment piece ${p.revetment.pieceId} is not in the palette` });
    else if (fence.role !== "revetment") ctx.addIssue({ code: z.ZodIssueCode.custom, message: `revetment piece ${fence.id} must have role revetment` });
  });
export type Palette = z.infer<typeof Palette>;

// The slice of data/tts/catalog.json the emitter needs.
const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export const CatalogAsset = z
  .object({
    id: z.string(),
    kind: z.string(),
    urls: z.object({ primary: z.string(), secondary: z.string().optional(), diffuse: z.string().optional(), normal: z.string().optional(), collider: z.string().optional() }).passthrough(),
    scale: Vec3,
    /** RGB, or RGBA for a handful of harvested assets; the emitter uses the first three. */
    colorDiffuse: z.array(z.number()).min(3).max(4),
    nicknames: z.array(z.object({ nickname: z.string(), count: z.number() }).passthrough()),
  })
  .passthrough();
export type CatalogAsset = z.infer<typeof CatalogAsset>;

export const Catalog = z.object({ assets: z.array(CatalogAsset) }).passthrough();
export type Catalog = z.infer<typeof Catalog>;

export class PaletteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaletteError";
  }
}

export function parsePalette(raw: unknown): Palette {
  const result = Palette.safeParse(raw);
  if (!result.success) throw new PaletteError(`palette failed validation:\n${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n")}`);
  return result.data;
}

export function parseCatalog(raw: unknown): Catalog {
  const result = Catalog.safeParse(raw);
  if (!result.success) throw new PaletteError(`catalog failed validation:\n${result.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("\n")}`);
  return result.data;
}

export interface ResolvedPiece extends PalettePiece {
  asset: CatalogAsset;
}

export interface ResolvedPalette extends Omit<Palette, "pieces"> {
  pieces: ResolvedPiece[];
  byId: Map<string, ResolvedPiece>;
}

/** Joins every palette piece to its catalog asset; unknown asset ids are an error. */
export function resolvePalette(palette: Palette, catalog: Catalog): ResolvedPalette {
  const assets = new Map(catalog.assets.map((a) => [a.id, a]));
  const pieces = palette.pieces.map((p) => {
    const asset = assets.get(p.assetId);
    if (!asset) throw new PaletteError(`palette piece ${p.id} references unknown catalog asset ${p.assetId}`);
    return { ...p, asset };
  });
  return { ...palette, pieces, byId: new Map(pieces.map((p) => [p.id, p])) };
}

export function pieceById(palette: Palette, id: string): PalettePiece {
  const piece = palette.pieces.find((p) => p.id === id);
  if (!piece) throw new PaletteError(`palette has no piece ${id}`);
  return piece;
}

export function piecesByRole(palette: Palette | ResolvedPalette, role: Role, enabledOnly = true): PalettePiece[] {
  return palette.pieces.filter((p) => p.role === role && (!enabledOnly || p.enabled));
}

/** Quarter turns to apply for a rotY under the palette's rotation sense. */
export const quarterTurns = (rotY: number, sense: RotYSense): number => {
  const k = ((Math.round(rotY / 90) % 4) + 4) % 4;
  return sense === "cw" ? k : (4 - k) % 4;
};

export function rotateSides(sides: readonly Dir[], rotY: number, sense: RotYSense): Dir[] {
  const k = quarterTurns(rotY, sense);
  return DIRS.filter((d) => sides.some((o) => rotateDir(o, k) === d));
}

export const rotateOpenings = rotateSides;

/** The rotY in {0, 90, 180, 270} that turns a rotY-0 side into `side`. */
export function rotYTurning(from: Dir, to: Dir, sense: RotYSense): number {
  for (const rotY of [0, 90, 180, 270]) if (rotateDir(from, quarterTurns(rotY, sense)) === to) return rotY;
  throw new PaletteError(`no rotation turns ${from} into ${to}`);
}

const sameSet = (a: readonly Dir[], b: readonly Dir[]): boolean => a.length === b.length && a.every((d) => b.includes(d));

/** Every rotY in {0, 90, 180, 270} that turns the piece's openings into `required`. */
export function rotationsForOpenings(piece: PalettePiece, required: readonly Dir[], sense: RotYSense): number[] {
  if (!piece.openings) return [];
  return [0, 90, 180, 270].filter((rotY) => sameSet(rotateSides(piece.openings!.rotY0, rotY, sense), required));
}

/** The smallest rotY that turns the piece's openings into `required`, or null. */
export function rotYForOpenings(piece: PalettePiece, required: readonly Dir[], sense: RotYSense): number | null {
  return rotationsForOpenings(piece, required, sense)[0] ?? null;
}

/** Walls the piece lines itself at this rotation; assumed tables count as bare. */
export function decoratedSides(piece: PalettePiece, rotY: number, sense: RotYSense): Dir[] {
  const walls = piece.decoratedWalls;
  if (!walls || walls.source === "assumed") return [];
  return rotateSides(walls.rotY0, rotY, sense);
}

const swapsAxes = (rotY: number): boolean => quarterTurns(rotY, "cw") % 2 === 1;

/** Footprint in inches after rotation ([x extent, y extent]). */
export function rotatedFootprint(piece: { footprintIn: readonly [number, number] }, rotY: number): [number, number] {
  const [w, d] = piece.footprintIn;
  return swapsAxes(rotY) ? [d, w] : [w, d];
}

/** Cells covered after rotation ([across x, along y]); null for free pieces. */
export function rotatedCells(piece: PalettePiece, rotY: number): [number, number] | null {
  if (!piece.cells) return null;
  const [w, d] = piece.cells;
  return swapsAxes(rotY) ? [d, w] : [w, d];
}

/** Rotates a board-plane offset ([x, y], y = north) by rotY under the palette's sense. */
export function rotateVector(v: readonly [number, number], rotY: number, sense: RotYSense): [number, number] {
  let [x, y] = v;
  for (let i = 0; i < quarterTurns(rotY, sense); i++) [x, y] = [y, -x];
  return [x + 0, y + 0];
}
