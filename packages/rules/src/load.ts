import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  CampaignFile,
  Cost,
  EquipmentAccess,
  EquipmentFile,
  EquipmentItem,
  Faction,
  FactionsFile,
  ScenariosFile,
  TerrainFile,
  Unit,
  UnitsFile,
} from "./schema.js";

// The roster schemas in schema.ts are passthrough; the converter emits extra
// fields (see data/rules/CONVERSION-NOTES.md) that the roster engine relies on.
// They are typed and checked here so the engine never reads untyped JSON.

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

export const RosterFaction = Faction.extend({ variants: z.array(RosterVariant) });
export type RosterFaction = z.infer<typeof RosterFaction>;

export const RosterAccess = EquipmentAccess.extend({
  maxPerWarband: z.number().int().nullable().optional(),
  limitsText: z.string().optional(),
  onlyWith: Gate,
  onlyWithout: Gate,
  conditionNote: z.string().optional(),
  attachesTo: z.array(z.string()).optional(),
  fixed: z.boolean().optional(),
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

export interface RulesData {
  factions: RosterFaction[];
  units: RosterUnit[];
  equipment: EquipmentItem[];
  campaign: Campaign;
  scenarios: Scenarios;
  terrain: Terrain;
  factionsById: Map<string, RosterFaction>;
  unitsById: Map<string, RosterUnit>;
  unitsByFaction: Map<string, RosterUnit[]>;
  equipmentById: Map<string, EquipmentItem>;
  variantsById: Map<string, { factionId: string; id: string; name: string }>;
  thresholdTable: ThresholdRow[];
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

function readJson<T>(rootDir: string, rel: string, schema: z.ZodType<T>): T {
  const abs = resolve(rootDir, rel);
  const parsed = schema.safeParse(JSON.parse(readFileSync(abs, "utf8")));
  if (!parsed.success) {
    throw new RulesDataError(
      rel,
      parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  return parsed.data;
}

const ThresholdTable = z.array(
  z.object({ game: z.number().int().positive(), threshold: z.number().int(), fieldStrength: z.number().int() }).passthrough(),
);

export function loadRulesData(rootDir: string): RulesData {
  const factionsFile = readJson(rootDir, "data/rules/factions.json", FactionsFile.extend({ factions: z.array(RosterFaction) }));
  const unitsFile = readJson(rootDir, "data/rules/units.json", UnitsFile.extend({ units: z.array(RosterUnit) }));
  const equipmentFile = readJson(rootDir, "data/rules/equipment.json", EquipmentFile);
  const campaign = readJson(rootDir, "data/rules/campaign.json", CampaignFile);
  const scenarios = readJson(rootDir, "data/rules/scenarios.json", ScenariosFile);
  const terrain = readJson(rootDir, "data/rules/terrain.json", TerrainFile);

  const table = ThresholdTable.safeParse(campaign.warbandThreshold.table);
  if (!table.success) {
    throw new RulesDataError("data/rules/campaign.json", ["warbandThreshold.table rows need game/threshold/fieldStrength"]);
  }

  const factions = factionsFile.factions;
  const units = unitsFile.units;
  const equipment = equipmentFile.items;

  const unitsByFaction = new Map<string, RosterUnit[]>();
  for (const unit of units) {
    const list = unitsByFaction.get(unit.factionId) ?? [];
    list.push(unit);
    unitsByFaction.set(unit.factionId, list);
  }

  const variantsById = new Map<string, { factionId: string; id: string; name: string }>();
  for (const faction of factions) {
    for (const v of faction.variants) variantsById.set(v.id, { factionId: faction.id, id: v.id, name: v.name });
  }

  return {
    factions,
    units,
    equipment,
    campaign,
    scenarios,
    terrain,
    factionsById: new Map(factions.map((f) => [f.id, f])),
    unitsById: new Map(units.map((u) => [u.id, u])),
    unitsByFaction,
    equipmentById: new Map(equipment.map((e) => [e.id, e])),
    variantsById,
    thresholdTable: [...table.data].sort((a, b) => a.game - b.game),
  };
}

/**
 * Looks a roster unitId up for a given faction. Mercenaries are stored once
 * per faction as `<faction>/<slug>` with a shared `mercenaryId`; a roster may
 * name either, and the faction's own row wins.
 */
export function findUnit(data: RulesData, factionId: string, unitId: string): RosterUnit | undefined {
  const direct = data.unitsById.get(unitId);
  if (direct) return direct;
  return data.unitsByFaction.get(factionId)?.find((u) => u.mercenaryId === unitId);
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
  if (!last) throw new RulesDataError("data/rules/campaign.json", ["warbandThreshold.table is empty"]);
  return { row: last, clamped: true };
}
