import type { Layout, LayoutPiece } from "./layout.js";
import { PaletteError, resolvePalette, rotateVector, type Catalog, type CatalogAsset, type Palette, type ResolvedPalette } from "./palette.js";

// Turns a layout into the object-state tables spawnObjectData accepts, the
// same shape scripts/tts_measure_rest.py spawns with. Board inches become
// world units 1:1; the board sits centred on the mat with its north along +z.
// Every piece is Locked, so it stays exactly where its stack puts it.

export interface TtsEmitOptions {
  /** World y of the mat's top surface. */
  matTopY: number;
  /** World x, z of the mat (and board) centre. */
  matCenter: [number, number];
}

export const DEFAULT_TTS_OPTIONS: TtsEmitOptions = { matTopY: 0.95, matCenter: [0, 0] };

export interface TtsTransform {
  posX: number;
  posY: number;
  posZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

export interface TtsObjectState {
  Name: string;
  Nickname: string;
  Description: string;
  Transform: TtsTransform;
  ColorDiffuse: { r: number; g: number; b: number };
  Locked: true;
  Tags: string[];
  CustomAssetbundle?: { AssetbundleURL: string; AssetbundleSecondaryURL: string; MaterialIndex: number; TypeIndex: number; LoopingEffectIndex: number };
  CustomMesh?: { MeshURL: string; DiffuseURL: string; NormalURL: string; ColliderURL: string; Convex: boolean; MaterialIndex: number; TypeIndex: number; CastShadows: boolean };
  CustomImage?: { ImageURL: string; ImageSecondaryURL: string; ImageScalar: number; WidthScale: number };
}

export const battlefieldTag = (seed: number): string => `tc-battlefield:${seed}`;
export const TERRAIN_TAG = "tc-terrain";

const round = (n: number): number => Math.round(n * 1000) / 1000 + 0;

/** Rotates a local (x, z) offset by the piece's rotY under the palette's sense. */
export function rotateOffset(offset: readonly [number, number], rotY: number, sense: "cw" | "ccw"): [number, number] {
  return rotateVector(offset, rotY, sense);
}

// Spawned as the source saves spawn the asset (the harvested catalog's `spawn`),
// TTS's defaults where the catalog has none.
function customBlock(asset: CatalogAsset): Pick<TtsObjectState, "Name" | "CustomAssetbundle" | "CustomMesh" | "CustomImage"> {
  const urls = asset.urls;
  const spawn = { materialIndex: 0, typeIndex: 0, convex: true, ...asset.spawn };
  switch (asset.kind) {
    case "Custom_Assetbundle":
      return { Name: asset.kind, CustomAssetbundle: { AssetbundleURL: urls.primary, AssetbundleSecondaryURL: urls.secondary ?? "", MaterialIndex: spawn.materialIndex, TypeIndex: spawn.typeIndex, LoopingEffectIndex: 0 } };
    case "Custom_Model":
    case "Custom_Model_Bag":
    case "Custom_Model_Infinite_Bag":
      return { Name: "Custom_Model", CustomMesh: { MeshURL: urls.primary, DiffuseURL: urls.diffuse ?? "", NormalURL: urls.normal ?? "", ColliderURL: urls.collider ?? "", Convex: spawn.convex, MaterialIndex: spawn.materialIndex, TypeIndex: spawn.typeIndex, CastShadows: true } };
    case "Custom_Token":
    case "Custom_Tile":
    case "Custom_Board":
      return { Name: asset.kind, CustomImage: { ImageURL: urls.primary, ImageSecondaryURL: "", ImageScalar: 1, WidthScale: 0 } };
    default:
      throw new PaletteError(`asset ${asset.id} has unsupported kind ${asset.kind}`);
  }
}

export function pieceToObjectState(piece: LayoutPiece, layout: Layout, palette: ResolvedPalette, opts: TtsEmitOptions): TtsObjectState {
  const entry = palette.byId.get(piece.paletteId);
  if (!entry) throw new PaletteError(`layout piece ${piece.id} uses unknown palette piece ${piece.paletteId}`);
  if (entry.assetId !== piece.assetId) throw new PaletteError(`layout piece ${piece.id} expects asset ${piece.assetId}, palette has ${entry.assetId}`);
  const asset = entry.asset;
  const [offX, offZ] = rotateOffset(entry.pivotOffsetIn, piece.rotY, palette.rotation.rotYSense);
  const half = layout.boardIn / 2;
  const [sx, sy, sz] = asset.scale;
  const [cr = 1, cg = 1, cb = 1] = asset.colorDiffuse;
  return {
    ...customBlock(asset),
    Nickname: entry.name,
    Description: `${piece.role} ${piece.id} (${entry.id})${piece.objectiveId ? ` covers ${piece.objectiveId}` : ""}`,
    Transform: {
      posX: round(opts.matCenter[0] + (piece.position[0] - half) - offX),
      posY: round(opts.matTopY + piece.baseIn + entry.restHeightIn),
      posZ: round(opts.matCenter[1] + (piece.position[1] - half) - offZ),
      rotX: 0,
      rotY: piece.rotY,
      rotZ: 0,
      scaleX: sx,
      scaleY: sy,
      scaleZ: sz,
    },
    ColorDiffuse: { r: cr, g: cg, b: cb },
    Locked: true,
    Tags: [battlefieldTag(layout.seed), TERRAIN_TAG, `tc-role:${piece.role}`],
  };
}

/** Spawn order follows the stack: what rests on the mat first, then what rests on that. */
export function layoutToObjectStates(layout: Layout, palette: Palette, catalog: Catalog, options: Partial<TtsEmitOptions> = {}): TtsObjectState[] {
  const opts = { ...DEFAULT_TTS_OPTIONS, ...options };
  const resolved = resolvePalette(palette, catalog);
  const ordered = [...layout.pieces].sort((a, b) => a.zOrder - b.zOrder);
  return ordered.map((piece) => pieceToObjectState(piece, layout, resolved, opts));
}
