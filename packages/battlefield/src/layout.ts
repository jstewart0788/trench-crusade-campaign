import { z } from "zod";
import { Layer, Role } from "./palette.js";

// The generator's output contract. Everything the preview, the TTS emitter and
// the mod need is here in board inches; nothing refers back to the rng.

export const LAYOUT_VERSION = "tc-battlefield-layout-v1";

const DirSchema = z.enum(["N", "E", "S", "W"]);
const CellRef = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);
const Point = z.tuple([z.number(), z.number()]);
const RotY = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);

export const LayoutCell = z.object({
  c: z.number().int().nonnegative(),
  r: z.number().int().nonnegative(),
  kind: z.enum(["ground", "trench", "crater"]),
  pieceId: z.string(),
  /** Trench cells only: the sides a model can walk out of. */
  openings: z.array(DirSchema).optional(),
});
export type LayoutCell = z.infer<typeof LayoutCell>;

export const LayoutPiece = z.object({
  id: z.string(),
  role: Role,
  paletteId: z.string(),
  assetId: z.string(),
  layer: Layer,
  /** Anchor cell (south-west) for cell-aligned pieces; null for free pieces. */
  cell: CellRef.nullable(),
  cells: z.array(CellRef).nullable(),
  /** Footprint centre in board inches. */
  position: Point,
  /** Footprint extents in board inches after rotation. */
  footprintIn: z.tuple([z.number().positive(), z.number().positive()]),
  rotY: RotY,
  zOrder: z.number().int(),
  objectiveId: z.string().nullable(),
});
export type LayoutPiece = z.infer<typeof LayoutPiece>;

export const EdgeOpeningSchema = z.object({ c: z.number().int(), r: z.number().int(), dir: DirSchema });

export const Layout = z.object({
  version: z.literal(LAYOUT_VERSION),
  seed: z.number().int(),
  scenarioId: z.string(),
  archetype: z.literal("trench-lines"),
  boardIn: z.number().positive(),
  cellIn: z.number().positive(),
  grid: z.object({ cols: z.number().int().positive(), rows: z.number().int().positive() }),
  cells: z.array(LayoutCell),
  pieces: z.array(LayoutPiece),
  trench: z.object({
    axis: z.enum(["x", "y"]),
    start: EdgeOpeningSchema,
    end: EdgeOpeningSchema,
    exits: z.array(EdgeOpeningSchema),
    mainPathLength: z.number().int(),
    branches: z.number().int(),
    loops: z.number().int(),
  }),
  objectives: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      position: Point,
      cell: CellRef,
      requiresCover: z.boolean(),
      coverPieceId: z.string().nullable(),
    }),
  ),
  deploymentZones: z.array(
    z.object({
      player: z.string(),
      label: z.string(),
      polygon: z.array(Point),
      isDeployment: z.boolean(),
      noTerrain: z.boolean(),
      cells: z.array(CellRef),
    }),
  ),
  stats: z.object({
    trenchCells: z.number().int(),
    trenchPieces: z.object({ straight: z.number().int(), corner: z.number().int(), t: z.number().int() }),
    piecesByRole: z.record(z.number().int()),
    groundTiles: z.number().int(),
    dressingPieces: z.number().int(),
    totalPieces: z.number().int(),
    coverShrinks: z.number().int(),
    trenchAttempts: z.number().int(),
    shortfalls: z.array(z.object({ typeId: z.string(), min: z.number().int(), target: z.number().int(), placed: z.number().int() })),
    warnings: z.array(z.string()),
    archetypeMatchesScenario: z.boolean(),
  }),
});
export type Layout = z.infer<typeof Layout>;

export function parseLayout(raw: unknown): Layout {
  return Layout.parse(raw);
}
