import { z } from "zod";
import type { RosterUnit } from "./data.js";

// Mechanics the BattleScribe-derived data does not express, hand-authored in
// data/rules/unit-rules.json with page cites. buildRulesData checks every id
// against the units and their armouries and annotates the access rows, so the
// classifier, the validator and the roster tool read one source.

// Its own source block: schema.ts registers this file's schema, so importing
// schema.ts here would be circular.
const Source = z.object({ file: z.string(), edition: z.string().optional(), pages: z.string().optional(), note: z.string().optional() }).passthrough();
const Ids = z.array(z.string().min(1)).min(1);
const Gate = z.array(z.string()).optional();
const Page = z.number().int().positive();

/** A built-in slot default that may be swapped, only when the model is recruited and only from a gated list. */
export const ReplaceableBuiltIn = z.object({
  id: z.string(),
  name: z.string(),
  unitIds: Ids,
  itemId: z.string(),
  page: Page,
  text: z.string(),
  replacements: z.object({
    onlyWith: Gate,
    onlyWithout: Gate,
    itemIds: Ids,
    /** How many hands the replacements take on this unit, whatever their own profile says. */
    hands: z.union([z.literal(1), z.literal(2)]).optional(),
    page: Page,
    text: z.string(),
  }),
});
export type ReplaceableBuiltIn = z.infer<typeof ReplaceableBuiltIn>;

/** At most `maxPerModel` items from the group on one model. */
export const GroupLimit = z.object({ id: z.string(), name: z.string(), unitIds: Ids, itemIds: Ids, maxPerModel: z.number().int().positive(), page: Page });
export type GroupLimit = z.infer<typeof GroupLimit>;

/** Once bought (confirmed), never removed. */
export const PermanentItems = z.object({ id: z.string(), unitIds: Ids, itemIds: Ids, page: Page, text: z.string() });
export type PermanentItems = z.infer<typeof PermanentItems>;

/** Profile values that change under a gate (a variant). */
export const StatOverride = z.object({
  id: z.string(),
  unitIds: Ids,
  onlyWith: Gate,
  onlyWithout: Gate,
  stats: z.object({ ranged: z.string().optional(), melee: z.string().optional(), armour: z.number().int().optional() }),
  page: Page,
  text: z.string(),
});
export type StatOverride = z.infer<typeof StatOverride>;

/** A choice made before each game, stored on the warband as preGame[key]: a member id, or null for none. */
export const PreGameChoice = z.object({
  key: z.string().regex(/^[a-zA-Z]+$/),
  name: z.string(),
  unitIds: Ids,
  page: Page,
  onlyWith: Gate,
  onlyWithout: Gate,
  unavailable: z.object({ text: z.string(), page: Page }).optional(),
  victims: z.object({ unitNames: z.array(z.string()).min(1), excludeUpgrades: z.array(z.string()).optional(), excludePage: Page.optional() }),
  /** One line for the TTS tooltip. */
  summary: z.string(),
  /** The full rule text for the TTS GM notes. */
  effect: z.string(),
});
export type PreGameChoice = z.infer<typeof PreGameChoice>;

export const UnitRulesFile = z.object({
  $schema: z.literal("tc-rules-unit-rules-v1"),
  source: Source,
  replaceableBuiltIns: z.array(ReplaceableBuiltIn),
  groupLimits: z.array(GroupLimit),
  permanentItems: z.array(PermanentItems),
  statOverrides: z.array(StatOverride),
  preGameChoices: z.array(PreGameChoice),
});
export type UnitRules = z.infer<typeof UnitRulesFile>;

export interface UnitRulesFor {
  replaceable: ReplaceableBuiltIn[];
  groupLimits: GroupLimit[];
  statOverrides: StatOverride[];
  preGame: PreGameChoice[];
}

export interface UnitRulesIndex {
  file: UnitRules;
  byUnit: Map<string, UnitRulesFor>;
}

/**
 * Checks the file against the units and annotates their armoury rows in place:
 * the default `replaceableDefault`, each replacement `replaces` (and `hands`),
 * each permanent item `permanent`. Returns the problems found; empty means ok.
 */
export function applyUnitRules(file: UnitRules, unitsById: Map<string, RosterUnit>): { index: UnitRulesIndex; problems: string[] } {
  const problems: string[] = [];
  const byUnit = new Map<string, UnitRulesFor>();
  const entry = (unitId: string) => {
    let e = byUnit.get(unitId);
    if (!e) byUnit.set(unitId, (e = { replaceable: [], groupLimits: [], statOverrides: [], preGame: [] }));
    return e;
  };
  const unitOf = (where: string, unitId: string) => {
    const unit = unitsById.get(unitId);
    if (!unit) problems.push(`${where}: unknown unit "${unitId}"`);
    return unit;
  };
  const rowOf = (where: string, unit: RosterUnit, itemId: string) => {
    const row = unit.equipmentAccess.find((a) => a.itemId === itemId);
    if (!row) problems.push(`${where}: "${itemId}" is not in the ${unit.id} armoury`);
    return row;
  };

  for (const rule of file.replaceableBuiltIns) {
    for (const unitId of rule.unitIds) {
      const unit = unitOf(`replaceableBuiltIns.${rule.id}`, unitId);
      if (!unit) continue;
      const def = rowOf(`replaceableBuiltIns.${rule.id}`, unit, rule.itemId);
      if (def) def.replaceableDefault = rule.id;
      for (const itemId of rule.replacements.itemIds) {
        const row = rowOf(`replaceableBuiltIns.${rule.id}.replacements`, unit, itemId);
        if (!row) continue;
        row.replaces = rule.itemId;
        if (rule.replacements.hands) row.hands = rule.replacements.hands;
      }
      entry(unitId).replaceable.push(rule);
    }
  }
  for (const rule of file.groupLimits) {
    for (const unitId of rule.unitIds) {
      const unit = unitOf(`groupLimits.${rule.id}`, unitId);
      if (!unit) continue;
      for (const itemId of rule.itemIds) rowOf(`groupLimits.${rule.id}`, unit, itemId);
      entry(unitId).groupLimits.push(rule);
    }
  }
  for (const rule of file.permanentItems) {
    for (const unitId of rule.unitIds) {
      const unit = unitOf(`permanentItems.${rule.id}`, unitId);
      if (!unit) continue;
      for (const itemId of rule.itemIds) {
        const row = rowOf(`permanentItems.${rule.id}`, unit, itemId);
        if (row) row.permanent = true;
      }
    }
  }
  for (const rule of file.statOverrides) {
    for (const unitId of rule.unitIds) if (unitOf(`statOverrides.${rule.id}`, unitId)) entry(unitId).statOverrides.push(rule);
  }
  for (const rule of file.preGameChoices) {
    for (const unitId of rule.unitIds) if (unitOf(`preGameChoices.${rule.key}`, unitId)) entry(unitId).preGame.push(rule);
  }
  return { index: { file, byUnit }, problems };
}
