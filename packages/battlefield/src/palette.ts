import { z } from "zod";
import { DIRS, rotateDir, type Dir } from "./grid.js";

// The curated piece palette (data/tts/palette.json): what each TTS asset is
// for, how big it is in cells or inches, where its pivot sits and, for trench
// pieces, which sides are open at rotY 0. The catalog supplies the asset
// itself (kind, urls, scale, colour) at build time so the palette stays small.

export const PALETTE_SCHEMA = "tc-tts-palette-v1";

export const Role = z.enum(["ground", "trench-straight", "trench-corner", "trench-t", "trench-entrance", "hill", "crater", "difficult", "dangerous", "wire", "ruin", "landmark"]);
export type Role = z.infer<typeof Role>;

export const TRENCH_ROLES: readonly Role[] = ["trench-straight", "trench-corner", "trench-t", "trench-entrance"];
export const isTrenchRole = (role: Role): boolean => TRENCH_ROLES.includes(role);

export const Layer = z.enum(["ground", "surface"]);
export type Layer = z.infer<typeof Layer>;

const DirSchema = z.enum(["N", "E", "S", "W"]);
const Pair = z.tuple([z.number(), z.number()]);

export const PalettePiece = z
  .object({
    id: z.string().min(1),
    assetId: z.string().regex(/^[0-9a-f]{12}$/),
    name: z.string(),
    role: Role,
    layer: Layer,
    /** Footprint in whole cells at rotY 0 ([across x, along y]); null for free-floating pieces. */
    cells: z.tuple([z.number().int().positive(), z.number().int().positive()]).nullable(),
    /** Footprint in inches at rotY 0 ([x extent, y extent]). */
    footprintIn: z.tuple([z.number().positive(), z.number().positive()]),
    heightIn: z.number().nonnegative(),
    /** Pivot height above the surface the piece sits on. */
    restHeightIn: z.number(),
    /** Bounds centre minus pivot, in inches at rotY 0 ([x, y]). */
    pivotOffsetIn: Pair,
    openings: z.object({ rotY0: z.array(DirSchema).min(1).max(4), verified: z.boolean() }).optional(),
    enabled: z.boolean(),
    verified: z.boolean(),
    note: z.string().optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (isTrenchRole(p.role) && !p.openings) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${p.id}: trench pieces need an openings table` });
    if (p.openings && !isTrenchRole(p.role)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${p.id}: only trench pieces carry openings` });
    if (p.openings && new Set(p.openings.rotY0).size !== p.openings.rotY0.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${p.id}: duplicate openings` });
    if (p.layer === "ground" && !p.cells) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${p.id}: ground-layer pieces are cell-aligned and need cells` });
    const expectedCount = { "trench-straight": 2, "trench-corner": 2, "trench-t": 3, "trench-entrance": 1 }[p.role as string];
    if (expectedCount !== undefined && p.openings && p.openings.rotY0.length !== expectedCount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${p.id}: ${p.role} has ${p.openings.rotY0.length} openings, expected ${expectedCount}` });
    }
  });
export type PalettePiece = z.infer<typeof PalettePiece>;

export const RotYSense = z.enum(["cw", "ccw"]);
export type RotYSense = z.infer<typeof RotYSense>;

export const Palette = z
  .object({
    $schema: z.literal(PALETTE_SCHEMA),
    name: z.string(),
    cellIn: z.number().positive(),
    groundTopIn: z.number().positive(),
    coordinates: z.string().optional(),
    rotation: z.object({ rotYSense: RotYSense, verified: z.boolean(), note: z.string().optional() }),
    sources: z.record(z.string()).optional(),
    pieces: z.array(PalettePiece).min(1),
  })
  .strict()
  .superRefine((p, ctx) => {
    const ids = new Set<string>();
    for (const piece of p.pieces) {
      if (ids.has(piece.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate piece id ${piece.id}` });
      ids.add(piece.id);
    }
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

export function piecesByRole(palette: Palette | ResolvedPalette, role: Role, enabledOnly = true): PalettePiece[] {
  return palette.pieces.filter((p) => p.role === role && (!enabledOnly || p.enabled));
}

/** Quarter turns to apply for a rotY under the palette's rotation sense. */
export const quarterTurns = (rotY: number, sense: RotYSense): number => {
  const k = ((Math.round(rotY / 90) % 4) + 4) % 4;
  return sense === "cw" ? k : (4 - k) % 4;
};

export function rotateOpenings(openings: readonly Dir[], rotY: number, sense: RotYSense): Dir[] {
  const k = quarterTurns(rotY, sense);
  return DIRS.filter((d) => openings.some((o) => rotateDir(o, k) === d));
}

const sameSet = (a: readonly Dir[], b: readonly Dir[]): boolean => a.length === b.length && a.every((d) => b.includes(d));

/** The smallest rotY in {0, 90, 180, 270} that turns the piece's openings into `required`, or null. */
export function rotYForOpenings(piece: PalettePiece, required: readonly Dir[], sense: RotYSense): number | null {
  if (!piece.openings) return null;
  for (const rotY of [0, 90, 180, 270]) {
    if (sameSet(rotateOpenings(piece.openings.rotY0, rotY, sense), required)) return rotY;
  }
  return null;
}

/** Footprint in inches after rotation ([x extent, y extent]). */
export function rotatedFootprint(piece: PalettePiece, rotY: number): [number, number] {
  const [w, d] = piece.footprintIn;
  return quarterTurns(rotY, "cw") % 2 === 0 ? [w, d] : [d, w];
}

/** Cells covered after rotation ([across x, along y]); null for free pieces. */
export function rotatedCells(piece: PalettePiece, rotY: number): [number, number] | null {
  if (!piece.cells) return null;
  const [w, d] = piece.cells;
  return quarterTurns(rotY, "cw") % 2 === 0 ? [w, d] : [d, w];
}
