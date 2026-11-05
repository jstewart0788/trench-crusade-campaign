import { z } from "zod";
import { applyUnitRules, UnitRulesFile, type UnitRulesIndex } from "./unit-rules.js";
import {
  CampaignFile,
  Cost,
  EquipmentAccess,
  EquipmentFile,
  EquipmentItem,
  Faction,
  FactionsFile,
  ScenariosFile,
  Subfaction,
  TerrainFile,
  Unit,
  UnitsFile,
} from "./schema.js";

// The roster schemas in schema.ts are passthrough; the converter emits extra
// fields (see data/rules/CONVERSION-NOTES.md) that the roster engine relies on.
// They are typed and checked here so the engine never reads untyped JSON.
// Nothing in this file touches the filesystem, so the browser can build the
// same RulesData from JSON served over HTTP (see load.ts for the node reader).

const Gate = z.array(z.string()).optional();
const RuleText = z.object({ name: z.string(), text: z.string(), sharedRule: z.boolean().optional() }).passthrough();

export const RosterAbility = RuleText.extend({ onlyWith: Gate, onlyWithout: Gate, conditionNote: z.string().optional() });
export type RosterAbility = z.infer<typeof RosterAbility>;

export const Upgrade = z
  .object({
    bsId: z.string(),
    bsIds: z.array(z.string()).optional(),
    name: z.string(),
    group: z.string(),
    cost: Cost.optional(),
    max: z.number().int().nullable().optional(),
    maxPerWarband: z.number().int().nullable().optional(),
    limitsText: z.string().optional(),
    onlyWith: Gate,
    onlyWithout: Gate,
    conditionNote: z.string().optional(),
    rules: z.array(RuleText).optional(),
  })
  .passthrough();
export type Upgrade = z.infer<typeof Upgrade>;

// Variants that recruit with their own purse (Papal States Intervention Force:
// 500 ducats and 11 glory, Warbands of Trench Crusade p35).
export const RosterVariant = Faction.shape.variants.element.extend({
  startingDucats: z.number().int().nonnegative().optional(),
  startingGlory: z.number().int().nonnegative().optional(),
});
export type RosterVariant = z.infer<typeof RosterVariant>;

// A configuration entry the roster always contains (a subfaction's "<Name> Rules"),
// so limit text that counts it reads 1.
const Configuration = z.object({ name: z.string(), bsId: z.string(), mandatory: z.boolean().optional() }).passthrough();

// bsId is the BattleScribe catalogue id the list was converted from; the importer matches a roster's force by it.
export const RosterSubfaction = Subfaction.extend({
  bsId: z.string().optional(),
  variants: z.array(RosterVariant),
  configuration: z.array(Configuration).optional(),
});
export type RosterSubfaction = z.infer<typeof RosterSubfaction>;

export const RosterFaction = Faction.extend({
  bsId: z.string().optional(),
  variants: z.array(RosterVariant),
  configuration: z.array(Configuration).optional(),
  subfactions: z.array(RosterSubfaction).optional(),
});
export type RosterFaction = z.infer<typeof RosterFaction>;

export const RosterAccess = EquipmentAccess.extend({
  maxPerWarband: z.number().int().nullable().optional(),
  limitsText: z.string().optional(),
  onlyWith: Gate,
  onlyWithout: Gate,
  conditionNote: z.string().optional(),
  attachesTo: z.array(z.string()).optional(),
  fixed: z.boolean().optional(),
  // Set from data/rules/unit-rules.json when the data is built, never by the converter:
  /** The id of the replaceable built-in rule whose default this row is (the Shrine's Catherine Wheel). */
  replaceableDefault: z.string().optional(),
  /** This row may only replace that default item, at recruitment. */
  replaces: z.string().optional(),
  /** Hands this item takes on this unit, overriding the item's profile. */
  hands: z.union([z.literal(1), z.literal(2)]).optional(),
  /** Once bought, it cannot be removed. */
  permanent: z.boolean().optional(),
}).passthrough();
export type RosterAccess = z.infer<typeof RosterAccess>;

export const RosterUnit = Unit.extend({
  abilities: z.array(RosterAbility),
  equipmentAccess: z.array(RosterAccess),
  upgrades: z.array(Upgrade).optional(),
  onlyWith: Gate,
  onlyWithout: Gate,
  maxPerWarband: z.number().int().nullable().optional(),
  mercenary: z.boolean().optional(),
  mercenaryId: z.string().optional(),
}).passthrough();
export type RosterUnit = z.infer<typeof RosterUnit>;

export type Campaign = z.infer<typeof CampaignFile>;
export type Scenarios = z.infer<typeof ScenariosFile>;
export type Terrain = z.infer<typeof TerrainFile>;

export interface ThresholdRow {
  game: number;
  threshold: number;
  fieldStrength: number;
}

// TTS model map (data/tts/models.json, written by scripts/map_tts_models.py).
// A unit's chosen candidate is only a default: players bind their own models
// in the mod (ROADMAP TC-016), so a unit without one is not an error. The
// top-level mesh of a candidate is the base; the figure is in `parts`.

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3>;

export const ModelPart = z
  .object({
    kind: z.enum(["Custom_Model", "Custom_Assetbundle"]),
    guid: z.string(),
    nickname: z.string(),
    meshUrl: z.string().nullable().optional(),
    diffuseUrl: z.string().nullable().optional(),
    colliderUrl: z.string().nullable().optional(),
    assetBundleUrl: z.string().nullable().optional(),
    position: Vec3,
    rotation: Vec3,
    scale: Vec3,
  })
  .passthrough();
export type ModelPart = z.infer<typeof ModelPart>;

export const ModelCandidate = z
  .object({
    modId: z.string(),
    guid: z.string(),
    nickname: z.string(),
    meshUrl: z.string(),
    diffuseUrl: z.string().nullable(),
    colliderUrl: z.string().nullable(),
    rotation: Vec3,
    scale: Vec3,
    parts: z.array(ModelPart),
  })
  .passthrough();
export type ModelCandidate = z.infer<typeof ModelCandidate>;

const ModelUnit = z
  .object({
    kind: z.enum(["model", "fireteam"]),
    candidates: z.array(ModelCandidate),
    chosen: z.string().nullable().optional(),
    chosenModId: z.string().optional(),
    chosenNickname: z.string().optional(),
  })
  .passthrough();

export const ModelMapFile = z.object({ $schema: z.literal("tc-tts-models-v1"), units: z.record(ModelUnit) }).passthrough();

export const MODEL_MAP_FILE = "data/tts/models.json";

export const MODEL_PICKS_FILE = "data/tts/model-picks.json";

const PickedModel = z.object({
  modId: z.string(),
  guid: z.string(),
  nickname: z.string(),
  meshUrl: z.string(),
  diffuseUrl: z.string().nullable(),
  colliderUrl: z.string().nullable(),
  scale: Vec3,
  parts: z.array(
    z.object({
      kind: z.enum(["Custom_Model", "Custom_Assetbundle"]),
      meshUrl: z.string().nullable(),
      diffuseUrl: z.string().nullable(),
      colliderUrl: z.string().nullable(),
      assetBundleUrl: z.string().nullable(),
      position: Vec3,
      rotation: Vec3,
      scale: Vec3,
    }),
  ),
});

export const ModelPicksFile = z.object({
  $schema: z.literal("tc-tts-model-picks-v1"),
  picks: z.array(z.object({ unitId: z.string(), matchItemIds: z.array(z.string()), note: z.string().optional(), model: PickedModel })),
}).passthrough();

export interface ModelPick {
  matchItemIds: string[];
  candidate: ModelCandidate;
}

export interface ModelMap {
  /** The chosen default candidate per unit id; unmapped units and fireteam wrappers are absent. */
  byUnitId: Map<string, ModelCandidate>;
  /** Hand-picked models per unit, chosen by the member's loadout (data/tts/model-picks.json). */
  picksByUnitId?: Map<string, ModelPick[]>;
}

/** The most specific pick whose items the member all carries, else the unit's default. */
export function modelFor(models: ModelMap | undefined, unitId: string, itemIds: readonly string[]): { candidate: ModelCandidate; picked: boolean } | undefined {
  const carried = new Set(itemIds);
  const fits = (models?.picksByUnitId?.get(unitId) ?? []).filter((p) => p.matchItemIds.every((id) => carried.has(id)));
  fits.sort((a, b) => b.matchItemIds.length - a.matchItemIds.length);
  if (fits[0]) return { candidate: fits[0].candidate, picked: true };
  const d = models?.byUnitId.get(unitId);
  return d ? { candidate: d, picked: false } : undefined;
}

export interface RulesData {
  factions: RosterFaction[];
  units: RosterUnit[];
  equipment: EquipmentItem[];
  campaign: Campaign;
  scenarios: Scenarios;
  terrain: Terrain;
  factionsById: Map<string, RosterFaction>;
  /** Subfaction id -> the subfaction and the faction it belongs to. */
  subfactionsById: Map<string, { faction: RosterFaction; subfaction: RosterSubfaction }>;
  unitsById: Map<string, RosterUnit>;
  /** A faction's core list: its units that belong to no subfaction. */
  unitsByFaction: Map<string, RosterUnit[]>;
  unitsBySubfaction: Map<string, RosterUnit[]>;
  equipmentById: Map<string, EquipmentItem>;
  variantsById: Map<string, { factionId: string; subfactionId?: string; id: string; name: string }>;
  /**
   * Items some armoury lists under its `headgear` group (Combat Helmet, Iron
   * Capirote, Anfarro). They are Headgear on every model, whichever group a
   * given unit files them under (the Sin Eater's built-in helmet is `direct`).
   */
  headgearItemIds: ReadonlySet<string>;
  thresholdTable: ThresholdRow[];
  /** Present when data/tts/models.json was supplied. */
  models?: ModelMap;
  /** data/rules/unit-rules.json, checked and indexed by unit; its row annotations are already on the units. */
  unitRules: UnitRulesIndex;
}

export class RulesDataError extends Error {
  constructor(
    public readonly file: string,
    public readonly issues: string[],
  ) {
    super(`${file} failed validation:\n${issues.join("\n")}`);
    this.name = "RulesDataError";
  }
}

/** The six data files, keyed by the name the API and the loader use, with their repo-relative paths. */
export const RULES_FILES = {
  factions: "data/rules/factions.json",
  units: "data/rules/units.json",
  equipment: "data/rules/equipment.json",
  campaign: "data/rules/campaign.json",
  scenarios: "data/rules/scenarios.json",
  terrain: "data/rules/terrain.json",
  unitRules: "data/rules/unit-rules.json",
} as const;
export type RulesFileKey = keyof typeof RULES_FILES;

/** Parsed-but-unvalidated contents of the six files, as read from disk or fetched from the API. */
export type RulesFiles = Record<RulesFileKey, unknown>;

function parseFile<T>(key: RulesFileKey, raw: unknown, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new RulesDataError(
      RULES_FILES[key],
      parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  return parsed.data;
}

const ThresholdTable = z.array(
  z.object({ game: z.number().int().positive(), threshold: z.number().int(), fieldStrength: z.number().int() }).passthrough(),
);

export function buildRulesData(files: RulesFiles, models?: ModelMap): RulesData {
  const factionsFile = parseFile("factions", files.factions, FactionsFile.extend({ factions: z.array(RosterFaction) }));
  const unitsFile = parseFile("units", files.units, UnitsFile.extend({ units: z.array(RosterUnit) }));
  const equipmentFile = parseFile("equipment", files.equipment, EquipmentFile);
  const campaign = parseFile("campaign", files.campaign, CampaignFile);
  const scenarios = parseFile("scenarios", files.scenarios, ScenariosFile);
  const terrain = parseFile("terrain", files.terrain, TerrainFile);
  const unitRulesFile = parseFile("unitRules", files.unitRules, UnitRulesFile);

  const table = ThresholdTable.safeParse(campaign.warbandThreshold.table);
  if (!table.success) {
    throw new RulesDataError(RULES_FILES.campaign, ["warbandThreshold.table rows need game/threshold/fieldStrength"]);
  }

  const factions = factionsFile.factions;
  const units = unitsFile.units;
  const equipment = equipmentFile.items;

  const unitsByFaction = new Map<string, RosterUnit[]>();
  const unitsBySubfaction = new Map<string, RosterUnit[]>();
  for (const unit of units) {
    const [map, key] = unit.subfactionId ? [unitsBySubfaction, unit.subfactionId] : [unitsByFaction, unit.factionId];
    const list = map.get(key) ?? [];
    list.push(unit);
    map.set(key, list);
  }

  const subfactionsById = new Map<string, { faction: RosterFaction; subfaction: RosterSubfaction }>();
  const variantsById = new Map<string, { factionId: string; subfactionId?: string; id: string; name: string }>();
  for (const faction of factions) {
    for (const v of faction.variants) variantsById.set(v.id, { factionId: faction.id, id: v.id, name: v.name });
    for (const subfaction of faction.subfactions ?? []) {
      subfactionsById.set(subfaction.id, { faction, subfaction });
      for (const v of subfaction.variants) variantsById.set(v.id, { factionId: faction.id, subfactionId: subfaction.id, id: v.id, name: v.name });
    }
  }

  const applied = applyUnitRules(unitRulesFile, new Map(units.map((u) => [u.id, u])));
  if (applied.problems.length) throw new RulesDataError(RULES_FILES.unitRules, applied.problems.slice(0, 10));
  const unitRules = applied.index;

  return {
    factions,
    units,
    equipment,
    campaign,
    scenarios,
    terrain,
    factionsById: new Map(factions.map((f) => [f.id, f])),
    subfactionsById,
    unitsById: new Map(units.map((u) => [u.id, u])),
    unitsByFaction,
    unitsBySubfaction,
    equipmentById: new Map(equipment.map((e) => [e.id, e])),
    variantsById,
    unitRules,
    headgearItemIds: new Set(units.flatMap((u) => u.equipmentAccess.filter((a) => a.group === "headgear").map((a) => a.itemId))),
    thresholdTable: [...table.data].sort((a, b) => a.game - b.game),
    models,
  };
}

/**
 * GUIDs repeat inside a TTS save, so a unit's chosen model is addressed by
 * modId + guid + nickname (see data/tts/MODELS-COVERAGE.md).
 */
export function buildModelMap(raw: unknown, picksRaw?: unknown): ModelMap {
  const parsed = ModelMapFile.safeParse(raw);
  if (!parsed.success) {
    throw new RulesDataError(MODEL_MAP_FILE, parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  const byUnitId = new Map<string, ModelCandidate>();
  for (const [unitId, unit] of Object.entries(parsed.data.units)) {
    if (unit.chosen === null || unit.chosen === undefined) continue;
    const chosen = unit.candidates.find((c) => c.guid === unit.chosen && c.modId === unit.chosenModId && c.nickname === unit.chosenNickname);
    if (!chosen) throw new RulesDataError(MODEL_MAP_FILE, [`units.${unitId}: chosen ${unit.chosen} is not among its candidates`]);
    byUnitId.set(unitId, chosen);
  }
  if (picksRaw === undefined) return { byUnitId };
  const picks = ModelPicksFile.safeParse(picksRaw);
  if (!picks.success) {
    throw new RulesDataError(MODEL_PICKS_FILE, picks.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  const picksByUnitId = new Map<string, ModelPick[]>();
  for (const p of picks.data.picks) {
    const m = p.model;
    const candidate: ModelCandidate = {
      modId: m.modId, guid: m.guid, nickname: m.nickname, meshUrl: m.meshUrl, diffuseUrl: m.diffuseUrl, colliderUrl: m.colliderUrl,
      rotation: [0, 0, 0], scale: m.scale,
      parts: m.parts.map((q) => ({ ...q, guid: "", nickname: "" })),
    };
    const list = picksByUnitId.get(p.unitId) ?? [];
    list.push({ matchItemIds: p.matchItemIds, candidate });
    picksByUnitId.set(p.unitId, list);
  }
  return { byUnitId, picksByUnitId };
}

/** Which roster list a warband draws from: a faction's core list, or one of its subfactions. */
export interface RosterScope {
  factionId: string;
  subfactionId?: string | undefined;
}

/** The subfaction a scope names, when it names one that belongs to its faction. */
export function findSubfaction(data: RulesData, scope: RosterScope): RosterSubfaction | undefined {
  if (scope.subfactionId === undefined) return undefined;
  const entry = data.subfactionsById.get(scope.subfactionId);
  return entry && entry.faction.id === scope.factionId ? entry.subfaction : undefined;
}

/** The units the warband can recruit: the subfaction's list when one is set, else the faction's core list. */
export function rosterUnits(data: RulesData, scope: RosterScope): RosterUnit[] {
  if (scope.subfactionId !== undefined) return data.unitsBySubfaction.get(scope.subfactionId) ?? [];
  return data.unitsByFaction.get(scope.factionId) ?? [];
}

/** The Warband Variants on offer: the subfaction's own when one is set, else the faction's. */
export function rosterVariants(data: RulesData, scope: RosterScope): RosterVariant[] {
  if (scope.subfactionId !== undefined) return findSubfaction(data, scope)?.variants ?? [];
  return data.factionsById.get(scope.factionId)?.variants ?? [];
}

/** True when the unit belongs to the scope's roster list. */
export function inRosterList(unit: RosterUnit, scope: RosterScope): boolean {
  return unit.factionId === scope.factionId && unit.subfactionId === scope.subfactionId;
}

/**
 * Looks a roster unitId up for a given roster list. Mercenaries are stored
 * once per list as `<list>/<slug>` with a shared `mercenaryId`; a roster may
 * name either, and the list's own row wins.
 */
export function findUnit(data: RulesData, scope: RosterScope, unitId: string): RosterUnit | undefined {
  const direct = data.unitsById.get(unitId);
  if (direct) return direct;
  return rosterUnits(data, scope).find((u) => u.mercenaryId === unitId);
}

export function accessFor(unit: RosterUnit, itemId: string): RosterAccess | undefined {
  return unit.equipmentAccess.find((a) => a.itemId === itemId);
}

/** An upgrade merged from several upstream entries (Janissary Veteran) answers to any of its ids. */
export function upgradeFor(unit: RosterUnit, upgradeId: string): Upgrade | undefined {
  return unit.upgrades?.find((g) => g.bsId === upgradeId || g.bsIds?.includes(upgradeId));
}

/**
 * Threshold Value for the game about to be played (Digital Rulebook p98,
 * Warband Threshold Table). Game 1 is the 700-ducat starting warband
 * (Warbands of Trench Crusade p7, p9). Past the last row the table is
 * clamped; `clamped` tells the caller so it can warn.
 */
export function thresholdFor(data: RulesData, gameNumber: number): { row: ThresholdRow; clamped: boolean } {
  const exact = data.thresholdTable.find((r) => r.game === gameNumber);
  if (exact) return { row: exact, clamped: false };
  const last = data.thresholdTable[data.thresholdTable.length - 1];
  if (!last) throw new RulesDataError(RULES_FILES.campaign, ["warbandThreshold.table is empty"]);
  return { row: last, clamped: true };
}
