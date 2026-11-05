import type { Layout } from "./layout.js";
import type { Catalog, Palette } from "./palette.js";
import { battlefieldTag, layoutToObjectStates, objectiveMarkers, TERRAIN_TAG, type ObjectiveMarkerSpec, type TtsEmitOptions, type TtsObjectState } from "./tts.js";

// The wire form of a board for the TTS mod: what is the same for every use of a
// palette piece is sent once per board, each placed piece is one short row, and
// the mod rebuilds the exact object states layoutToObjectStates emits
// (expandBattlefield is the reference for the mod's Lua copy).

export const BATTLEFIELD_PAYLOAD_VERSION = "tc-battlefield-v1";

export type AssetTemplate = Pick<TtsObjectState, "Name" | "ColorDiffuse" | "CustomAssetbundle" | "CustomMesh" | "CustomImage"> & {
  scale: [number, number, number];
};

/** [paletteId, nicknameText, reminderText, role, pieceId, objectiveId or "", posX, posY, posZ, rotY] */
export type PieceRow = [string, number, number, string, string, string, number, number, number, number];

export interface BattlefieldPayload {
  version: typeof BATTLEFIELD_PAYLOAD_VERSION;
  scenarioId: string;
  seed: number;
  boardIn: number;
  assets: Record<string, AssetTemplate>;
  /** Nicknames and rules reminders, each once; rows point into it (0-based). */
  texts: string[];
  pieces: PieceRow[];
  objectives: ObjectiveMarkerSpec[];
}

const ROLE_TAG = "tc-role:";
const IDS_LINE = /^(\S+) (\S+) \((\S+)\)(?: covers (\S+))?$/;

function template(s: TtsObjectState): AssetTemplate {
  const t: AssetTemplate = { Name: s.Name, ColorDiffuse: s.ColorDiffuse, scale: [s.Transform.scaleX, s.Transform.scaleY, s.Transform.scaleZ] };
  if (s.CustomAssetbundle) t.CustomAssetbundle = s.CustomAssetbundle;
  if (s.CustomMesh) t.CustomMesh = s.CustomMesh;
  if (s.CustomImage) t.CustomImage = s.CustomImage;
  return t;
}

export class CompactError extends Error {}

export function compactBattlefield(layout: Layout, palette: Palette, catalog: Catalog, options: Partial<TtsEmitOptions> = {}): BattlefieldPayload {
  const states = layoutToObjectStates(layout, palette, catalog, options);
  const assets: Record<string, AssetTemplate> = {};
  const texts: string[] = [];
  const textIndex = new Map<string, number>();
  const text = (s: string): number => {
    let i = textIndex.get(s);
    if (i === undefined) {
      i = texts.length;
      texts.push(s);
      textIndex.set(s, i);
    }
    return i;
  };
  const pieces = states.map((s): PieceRow => {
    const lines = s.Description.split("\n");
    const ids = IDS_LINE.exec(lines.at(-1) ?? "");
    if (!ids) throw new CompactError(`unexpected description ids line on ${s.Nickname}`);
    const [, role, pieceId, paletteId, objectiveId = ""] = ids as unknown as [string, string, string, string, string?];
    const t = template(s);
    const known = assets[paletteId];
    if (known && JSON.stringify(known) !== JSON.stringify(t)) throw new CompactError(`palette piece ${paletteId} spawns two different ways`);
    assets[paletteId] = t;
    return [paletteId, text(s.Nickname), text(lines.slice(0, -1).join("\n")), role, pieceId, objectiveId,
      s.Transform.posX, s.Transform.posY, s.Transform.posZ, s.Transform.rotY];
  });
  const payload: BattlefieldPayload = {
    version: BATTLEFIELD_PAYLOAD_VERSION,
    scenarioId: layout.scenarioId,
    seed: layout.seed,
    boardIn: layout.boardIn,
    assets,
    texts,
    pieces,
    objectives: objectiveMarkers(layout, palette, catalog, options),
  };
  const back = expandBattlefield(payload);
  if (JSON.stringify(back) !== JSON.stringify(states)) throw new CompactError(`board ${layout.scenarioId} seed ${layout.seed} does not rebuild exactly`);
  return payload;
}

export function expandBattlefield(p: BattlefieldPayload): TtsObjectState[] {
  return p.pieces.map(([paletteId, nick, reminder, role, pieceId, objectiveId, posX, posY, posZ, rotY]) => {
    const t = p.assets[paletteId];
    if (!t) throw new CompactError(`row uses unknown palette piece ${paletteId}`);
    const state: TtsObjectState = {
      Name: t.Name,
      ...(t.CustomAssetbundle ? { CustomAssetbundle: t.CustomAssetbundle } : {}),
      ...(t.CustomMesh ? { CustomMesh: t.CustomMesh } : {}),
      ...(t.CustomImage ? { CustomImage: t.CustomImage } : {}),
      Nickname: p.texts[nick]!,
      Description: `${p.texts[reminder]}\n${role} ${pieceId} (${paletteId})${objectiveId ? ` covers ${objectiveId}` : ""}`,
      Transform: { posX, posY, posZ, rotX: 0, rotY, rotZ: 0, scaleX: t.scale[0], scaleY: t.scale[1], scaleZ: t.scale[2] },
      ColorDiffuse: t.ColorDiffuse,
      Locked: true,
      Tags: [battlefieldTag(p.seed), TERRAIN_TAG, `${ROLE_TAG}${role}`],
    };
    return state;
  });
}
