import { z } from "zod";
import { Layer, Role } from "./palette.js";

// The generator's output contract. Everything the preview, the TTS emitter and
// the mod need is here in board inches; nothing refers back to the rng.

export const LAYOUT_VERSION = "tc-battlefield-layout-v3";

const DirSchema = z.enum(["N", "E", "S", "W"]);
const CellRef = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);
const Point = z.tuple([z.number(), z.number()]);
const RotY = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);

export const WallLining = z.object({ side: DirSchema, kind: z.enum(["ledge", "logs", "revetment"]) });

export const LayoutCell = z.object({
  c: z.number().int().nonnegative(),
  r: z.number().int().nonnegative(),
  kind: z.enum(["ground", "trench", "crater"]),
  /** The piece standing on the mat in this cell. */
  pieceId: z.string(),
  /** Trench cells only: the sides a model can walk out of. */
  openings: z.array(DirSchema).optional(),
  /** Trench cells (and a raised trench): how each full-length wall is lined. */
  walls: z.array(WallLining).optional(),
  /** Raised ground in the cell: a plateau of stacked tiles, a ramp onto it, an H4x4 hill, or a trench dug into the plateau. */
  feature: z.enum(["plateau", "ramp", "hill", "raised-trench"]).nullable(),
  /** Ramps only: the side the slope climbs toward. */
  rampUp: DirSchema.nullable(),
  /** Height of the cell's walkable top above the mat (trench cells: the lip). */
  topIn: z.number(),
  /** Pieces stacked on this cell's ground piece. */
  upperPieceIds: z.array(z.string()),
});
export type LayoutCell = z.infer<typeof LayoutCell>;

export const SlotRef = z.object({
  id: z.string(),
  category: z.string(),
  /** The player's half it stands in, or "centre": on the line or point the halves mirror across, its own twin, or covering an objective that has none. */
  side: z.enum(["A", "B", "centre"]),
  /** The twin slot on the other player's half; null for a centre slot. */
  twin: z.string().nullable(),
  /** Slot centre in board inches. */
  at: Point,
  /** What fills it: a palette piece, a palette group, or a heap of scatter. */
  fill: z.string(),
  /** Dressing set against a raised feature's face (its id), which it may touch. */
  against: z.string().nullable(),
});
export type SlotRef = z.infer<typeof SlotRef>;

export const LayoutPiece = z.object({
  id: z.string(),
  role: Role,
  paletteId: z.string(),
  assetId: z.string(),
  layer: Layer,
  /** Anchor cell (south-west) for cell-aligned pieces; null for free pieces. */
  cell: CellRef.nullable(),
  cells: z.array(CellRef).nullable(),
  /** Visual footprint centre in board inches. */
  position: Point,
  /** Visual footprint extents in board inches after rotation. */
  footprintIn: z.tuple([z.number().positive(), z.number().positive()]),
  rotY: RotY,
  /** Stack depth: 0 on the mat, 1 on what stands on the mat, and so on; the spawn order. */
  zOrder: z.number().int(),
  /** Height above the mat of the surface the piece rests on. */
  baseIn: z.number(),
  /** The pieces it rests on; empty when it rests on the mat. */
  supportIds: z.array(z.string()),
  /** Members of one rulebook terrain piece (a wire line, a crate stack) share a group id. */
  groupId: z.string().nullable(),
  /** The slot the piece fills (shared by a group's members); null for structural pieces. */
  slot: SlotRef.nullable(),
  objectiveId: z.string().nullable(),
});
export type LayoutPiece = z.infer<typeof LayoutPiece>;

export const EdgeOpeningSchema = z.object({ c: z.number().int(), r: z.number().int(), dir: DirSchema });

const CountByRole = z.record(z.number().int());

export const Layout = z.object({
  version: z.literal(LAYOUT_VERSION),
  seed: z.number().int(),
  scenarioId: z.string(),
  archetype: z.enum(["trench-lines", "no-mans-land"]),
  boardIn: z.number().positive(),
  cellIn: z.number().positive(),
  parity: z.object({ kind: z.enum(["point", "mirror-x", "mirror-y", "none"]), objectivesMatch: z.boolean() }),
  aesthetic: z.object({ primary: z.string(), secondary: z.string().nullable() }),
  grid: z.object({ cols: z.number().int().positive(), rows: z.number().int().positive() }),
  cells: z.array(LayoutCell),
  pieces: z.array(LayoutPiece),
  trench: z.object({
    axis: z.enum(["x", "y"]),
    mode: z.enum(["trench-lines", "deployment-only"]),
    start: EdgeOpeningSchema.nullable(),
    end: EdgeOpeningSchema.nullable(),
    exits: z.array(EdgeOpeningSchema),
    mainPathLength: z.number().int(),
    branches: z.number().int(),
    loops: z.number().int(),
    deploymentLines: z.array(
      z.object({
        player: z.string(),
        zoneLabel: z.string(),
        side: DirSchema,
        variant: z.enum(["full", "from-low", "from-high"]),
        cells: z.array(CellRef),
        commCells: z.array(CellRef),
      }),
    ),
  }),
  plateaus: z.array(
    z.object({
      id: z.string(),
      cells: z.array(CellRef),
      ramps: z.array(z.object({ cell: CellRef, up: DirSchema })),
      raisedTrench: CellRef.nullable(),
      tallPieceId: z.string().nullable(),
    }),
  ),
  hills: z.array(z.object({ id: z.string(), cells: z.array(CellRef), stepped: z.array(CellRef) })),
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
    deploymentLineCells: z.number().int(),
    revetments: z.number().int(),
    piecesByRole: CountByRole,
    groundTiles: z.number().int(),
    stackedTiles: z.number().int(),
    dressingPieces: z.number().int(),
    /** Towers and multi-storey ruins at least 6in tall, objective covers included. */
    tallPieces: z.number().int(),
    /** Scattered terrain (p64) and the dressing against raised faces. */
    scatterPieces: z.number().int(),
    /** Objects by slot category, structural pieces under their own names. */
    objectsByCategory: CountByRole,
    /** Share of objects that fill slots (terrain and scatter) rather than build the ground and trenches. */
    dressingShare: z.number(),
    /** The seeded draw for hills on this board, and the scenario's rate. */
    hillsWanted: z.boolean(),
    hillRate: z.number(),
    totalPieces: z.number().int(),
    coverShrinks: z.number().int(),
    trenchAttempts: z.number().int(),
    /** Layouts drawn for this seed before one met the minimums (the seed's choices of look and hills held fixed), and the cover cap it used. */
    layoutDraws: z.number().int(),
    coverCapIn: z.number(),
    shortfalls: z.array(z.object({ typeId: z.string(), min: z.number().int(), target: z.number().int(), placed: z.number().int() })),
    /** Piece types placed that the archetype's pick-list does not name, on Jonathan's direction. */
    houseRules: z.array(z.string()),
    warnings: z.array(z.string()),
    archetypeMatchesScenario: z.boolean(),
  }),
});
export type Layout = z.infer<typeof Layout>;

export function parseLayout(raw: unknown): Layout {
  return Layout.parse(raw);
}
