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
  /** The book the page is in, when it is not the file's. */
  source: z.string().optional(),
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

// The variant and grant rules below name the lists they apply under: a variant
// id, a subfaction id, or a faction id for that faction's core list. Each one
// cites the book it comes from, since two books are in play.
const Under = Ids;
const Book = z.enum(["Warbands-of-Trench-Crusade.pdf", "Heretic-Naval-Raiders-Warband.pdf"]);
const Price = z.object({ ducats: z.number().int().nonnegative(), glory: z.number().int().nonnegative() });

/** A price that changes under a list: a unit's, an armoury item's (optionally on some units only) or an upgrade's, in either currency. */
export const VariantPrice = z.object({
  id: z.string(),
  under: Under,
  kind: z.enum(["unit", "item", "upgrade"]),
  /** Unit ids, item ids or upgrade names. */
  targets: Ids,
  /** Items and upgrades: only on these units. */
  unitIds: Ids.optional(),
  cost: Price,
  /** Only the first N in the warband, in roster order (Knights of Avarice: the first Goetic Warlock). */
  first: z.number().int().positive().optional(),
  /** Items: the warband-wide Limit under the list, replacing the row's own (Methodius Machine Gun: Limit 2). */
  limit: z.number().int().positive().optional(),
  page: Page,
  source: Book,
  text: z.string(),
});
export type VariantPrice = z.infer<typeof VariantPrice>;

/** A new Warband Entry built from another's profile and kit, with its own name, price and limit (Defenders' Sipahi). */
export const VariantSubstituteUnit = z.object({
  id: z.string(),
  /** Id of the entry this adds; it must not already exist. */
  unitId: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
  name: z.string(),
  /** Variant ids of the profile unit's own list. */
  under: Under,
  profileOf: z.string(),
  cost: Price,
  max: z.number().int().positive(),
  /** "You cannot change their Battlekit in any way": the kit chosen at recruitment is permanent. */
  lockedKit: z.boolean(),
  /** Keywords the entry adds to the profile's (Noble Guardians: ELITE at no additional cost). */
  keywords: z.array(z.string()).optional(),
  page: Page,
  source: Book,
  text: z.string(),
});
export type VariantSubstituteUnit = z.infer<typeof VariantSubstituteUnit>;

/** Up to N models may take a keyword for free. Each pool caps the models drawn from it; a pool without unitIds takes any model in the list. */
export const FreeKeywordGrant = z.object({
  id: z.string(),
  name: z.string(),
  keyword: z.string(),
  under: Under,
  /** The per-model toggle: the list's own upgrade of this name where the data has one, otherwise one is added to each eligible unit. */
  upgrade: z.string(),
  pools: z.array(z.object({ unitIds: Ids.optional(), max: z.number().int().positive() })).min(1),
  page: Page,
  source: Book,
  text: z.string(),
});
export type FreeKeywordGrant = z.infer<typeof FreeKeywordGrant>;

/** An item that is free when the warband is created (game 1), and must then be taken when `required`. */
export const FreeAtCreation = z.object({
  id: z.string(),
  name: z.string(),
  under: Under,
  itemId: z.string(),
  required: z.boolean(),
  page: Page,
  source: Book,
  text: z.string(),
});
export type FreeAtCreation = z.infer<typeof FreeAtCreation>;

/** Ducats or glory a list gains at a campaign event, beyond its starting purse. */
export const PurseAdjustment = z.object({
  id: z.string(),
  name: z.string(),
  under: Under,
  event: z.enum(["reinforcements"]),
  ducats: z.number().int().optional(),
  glory: z.number().int().optional(),
  page: Page,
  source: Book,
  text: z.string(),
});
export type PurseAdjustment = z.infer<typeof PurseAdjustment>;

/** Under a list, a unit is presented under another name, or only when the model has an upgrade ("uses the X Warband Entry"). The id stays, so model picks still apply. */
export const VariantRename = z.object({
  id: z.string(),
  under: Under,
  unitIds: Ids,
  name: z.string(),
  /** Only a model that has this upgrade (the Banshee upgrade makes a Chorister a Barbed Wire Banshee). */
  withUpgrade: z.string().optional(),
  /** "0-N" under this name, when the book caps it there (0-4 Dervishes). */
  max: z.number().int().nonnegative().optional(),
  page: Page,
  source: Book,
  text: z.string(),
});
export type VariantRename = z.infer<typeof VariantRename>;

/** Keywords a list adds to or takes from its units, for nothing; without unitIds, every model of the list but its Mercenaries (p172). */
export const VariantKeywords = z.object({
  id: z.string(),
  under: Under,
  unitIds: Ids.optional(),
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
  /** Only a model that has this upgrade (the Executor's LEADER and TOUGH, p142); unitIds are then required. */
  withUpgrade: z.string().optional(),
  page: Page,
  source: Book,
  text: z.string(),
});
export type VariantKeywords = z.infer<typeof VariantKeywords>;

/** The first purchase of each item of these categories costs less (Cold Steel: halved, rounded up per the Digital Rulebook p30). */
export const FirstPurchaseDiscount = z.object({
  id: z.string(),
  name: z.string(),
  under: Under,
  categories: z.array(z.enum(["ranged", "melee", "grenade", "shield", "armour", "equipment", "ammunition"])).min(1),
  divideBy: z.number().int().min(2),
  page: Page,
  source: Book,
  text: z.string(),
});
export type FirstPurchaseDiscount = z.infer<typeof FirstPurchaseDiscount>;

/** Battlekit from another faction's armoury, bought while the warband is created (game 1) and only repurchased after. */
export const CrossFactionArmoury = z.object({
  id: z.string(),
  name: z.string(),
  under: Under,
  /** The faction whose core armoury is opened. */
  from: z.string(),
  max: z.number().int().positive(),
  page: Page,
  source: Book,
  text: z.string(),
});
export type CrossFactionArmoury = z.infer<typeof CrossFactionArmoury>;

/** An item the warband may hold in its own Armoury rather than give to a model (a Grand Cannon gun battery). */
export const WarbandHeldItem = z.object({
  id: z.string(),
  name: z.string(),
  under: Under,
  itemId: z.string(),
  page: Page,
  source: Book,
  text: z.string(),
});
export type WarbandHeldItem = z.infer<typeof WarbandHeldItem>;

/** An upgrade the player may pay for in another currency: each alternative is offered as the same upgrade at that price. */
export const CurrencyChoice = z.object({
  id: z.string(),
  under: Under,
  upgrade: z.string(),
  alternatives: z.array(Price).min(1),
  page: Page,
  source: Book,
  text: z.string(),
});
export type CurrencyChoice = z.infer<typeof CurrencyChoice>;

/** No model whose ducat cost with its kit is under the floor, except the listed units (Mammon's Chosen). */
export const MinimumModelCost = z.object({
  id: z.string(),
  name: z.string(),
  under: Under,
  ducats: z.number().int().positive(),
  exceptUnitIds: Ids.optional(),
  page: Page,
  source: Book,
  text: z.string(),
});
export type MinimumModelCost = z.infer<typeof MinimumModelCost>;

/**
 * What an upgrade needs, or rules out, on the same model, by upgrade name:
 * every `requires` (a Legionnaire before its +1, NR p28), none of `excludes`
 * unless the model has `unless` (Hawk Eyes and Hypnotic Eyes need Two Heads,
 * p96), at most `maxOf` of the rule's own upgrades ("either Ranged or Melee"),
 * none of `excludesItems`, none of `withoutKeywords` (Unseen Advance: models
 * without ELITE).
 */
export const UpgradeRequirement = z.object({
  id: z.string(),
  name: z.string(),
  unitIds: Ids,
  upgrades: Ids,
  requires: z.array(z.string()).optional(),
  excludes: z.array(z.string()).optional(),
  unless: z.string().optional(),
  maxOf: z.number().int().positive().optional(),
  excludesItems: z.array(z.string()).optional(),
  withoutKeywords: z.array(z.string()).optional(),
  page: Page,
  source: Book,
  text: z.string(),
});
export type UpgradeRequirement = z.infer<typeof UpgradeRequirement>;

const StatName = z.enum(["movement", "ranged", "melee", "armour", "base"]);
/** One change to a characteristic: set it ("+1", "8\"/Flying", "32mm", -2) or add to it (1, -1). */
export const StatChange = z.object({ stat: StatName, op: z.enum(["set", "add"]), value: z.union([z.string(), z.number().int()]) });
export type StatChange = z.infer<typeof StatChange>;

/**
 * Characteristics an upgrade changes on the model that takes it, where the
 * converted data does not already say so (the converter records upstream's own
 * upgrade modifiers in each unit's notes, which buildRulesData reads too).
 */
export const UpgradeEffect = z.object({
  id: z.string(),
  name: z.string(),
  unitIds: Ids,
  upgrade: z.string(),
  changes: z.array(StatChange).min(1),
  page: Page,
  source: Book,
  text: z.string(),
});
export type UpgradeEffect = z.infer<typeof UpgradeEffect>;

export const UnitRulesFile = z.object({
  $schema: z.literal("tc-rules-unit-rules-v1"),
  source: Source,
  replaceableBuiltIns: z.array(ReplaceableBuiltIn),
  groupLimits: z.array(GroupLimit),
  permanentItems: z.array(PermanentItems),
  statOverrides: z.array(StatOverride),
  preGameChoices: z.array(PreGameChoice),
  variantPrices: z.array(VariantPrice),
  variantSubstituteUnits: z.array(VariantSubstituteUnit),
  freeKeywordGrants: z.array(FreeKeywordGrant),
  freeAtCreation: z.array(FreeAtCreation),
  purseAdjustments: z.array(PurseAdjustment),
  variantRenames: z.array(VariantRename),
  variantKeywords: z.array(VariantKeywords),
  firstPurchaseDiscounts: z.array(FirstPurchaseDiscount),
  crossFactionArmoury: z.array(CrossFactionArmoury),
  warbandHeldItems: z.array(WarbandHeldItem),
  currencyChoices: z.array(CurrencyChoice),
  minimumModelCosts: z.array(MinimumModelCost),
  upgradeRequirements: z.array(UpgradeRequirement),
  upgradeEffects: z.array(UpgradeEffect),
});
export type UnitRules = z.infer<typeof UnitRulesFile>;

export interface UnitRulesFor {
  replaceable: ReplaceableBuiltIn[];
  groupLimits: GroupLimit[];
  statOverrides: StatOverride[];
  preGame: PreGameChoice[];
}

/** What taking an upgrade (or carrying an item) does to a model's characteristics and keywords. */
export interface ModelEffect {
  upgrade?: string;
  item?: string;
  changes: StatChange[];
  keywords: string[];
  /** The unit-rules.json entry it comes from; absent for one read from the converted data. */
  rule?: UpgradeEffect;
}

export interface UnitRulesIndex {
  file: UnitRules;
  byUnit: Map<string, UnitRulesFor>;
  grantsById: Map<string, FreeKeywordGrant>;
  /** Per unit: upstream's upgrade and item modifiers (from the converted notes), then unit-rules.json upgradeEffects. */
  effectsByUnit: Map<string, ModelEffect[]>;
}

const NOTE_STAT = /^(movement|ranged|melee|armour|base) (set|increment|decrement) (.+?) with upgrade '(.+)'$/;
const NOTE_KEYWORD = /^gains keyword (.+) when atLeast 1 (.+) \(self\)$/;

/**
 * Upstream's own per-model modifiers, as the converter writes them into a unit's
 * notes ("ranged increment 1 with upgrade 'The Executor'", "gains keyword Strong
 * when atLeast 1 Inhuman Strength (self)"). Only triggers that are one of the
 * unit's upgrades or armoury items are kept; anything else is a roster-wide or
 * campaign condition this does not model.
 */
export function effectsFromNotes(unit: RosterUnit, itemName: (id: string) => string | undefined): ModelEffect[] {
  const upgrades = new Set((unit.upgrades ?? []).map((g) => g.name));
  const items = new Map(unit.equipmentAccess.map((a) => [itemName(a.itemId), a.itemId] as const));
  const out: ModelEffect[] = [];
  for (const part of (unit.notes ?? "").split("; ")) {
    const stat = NOTE_STAT.exec(part);
    if (stat && upgrades.has(stat[4]!)) {
      const [, name, op, raw] = stat;
      const amount = op === "set" ? undefined : Number(raw) * (op === "decrement" ? -1 : 1);
      const value = op === "set" ? (name === "armour" ? Number(raw) : raw!.replace(/\s*dice$/i, "")) : amount!;
      if (typeof value === "number" && Number.isNaN(value)) continue;
      out.push({ upgrade: stat[4]!, changes: [{ stat: name as StatChange["stat"], op: op === "set" ? "set" : "add", value }], keywords: [] });
      continue;
    }
    const kw = NOTE_KEYWORD.exec(part);
    if (kw) {
      if (upgrades.has(kw[2]!)) out.push({ upgrade: kw[2]!, changes: [], keywords: [kw[1]!] });
      else if (items.has(kw[2]!)) out.push({ item: items.get(kw[2]!)!, changes: [], keywords: [kw[1]!] });
    }
  }
  return out;
}

/** Which lists an `under` id names: a variant, a subfaction, or a faction's core list. */
export interface ListResolver {
  /** The units of the list the id names, or undefined when it names none. */
  unitsUnder(id: string): RosterUnit[] | undefined;
  isVariant(id: string): boolean;
}

/** True when a rule's `under` names this roster's variant, subfaction, or (for a core list) faction. */
export function appliesUnder(under: readonly string[], scope: { factionId: string; subfactionId?: string | undefined; variantId?: string | undefined }): boolean {
  if (scope.variantId !== undefined && under.includes(scope.variantId)) return true;
  if (scope.subfactionId !== undefined) return under.includes(scope.subfactionId);
  return under.includes(scope.factionId);
}

const titleCase = (keyword: string) => keyword.toLowerCase().replace(/(^|[\s-])(\w)/g, (_, sep: string, c: string) => sep + c.toUpperCase());

/** A keyword in the data's spelling ("NEGATE FEAR" → "Negate Fear"), which is how units.json lists them. */
export function dataKeyword(keyword: string): string {
  return titleCase(keyword.trim());
}

/**
 * Builds the variantSubstituteUnits entries as units of their own, from a copy
 * of the profile unit, so the list, the limits, the validator and the export
 * treat them like any other entry. Called before the unit indexes are built.
 */
export function substituteUnits(file: UnitRules, unitsById: Map<string, RosterUnit>, lists: ListResolver): { units: RosterUnit[]; problems: string[] } {
  const problems: string[] = [];
  const units: RosterUnit[] = [];
  for (const rule of file.variantSubstituteUnits) {
    const where = `variantSubstituteUnits.${rule.id}`;
    const source = unitsById.get(rule.profileOf);
    if (!source) {
      problems.push(`${where}: unknown unit "${rule.profileOf}"`);
      continue;
    }
    if (unitsById.has(rule.unitId)) problems.push(`${where}: "${rule.unitId}" already exists`);
    for (const id of rule.under) {
      if (!lists.isVariant(id) || !lists.unitsUnder(id)?.includes(source)) problems.push(`${where}: "${id}" is not a variant of ${rule.profileOf}'s list`);
    }
    const copy = structuredClone(source) as RosterUnit & Record<string, unknown>;
    delete copy.mercenaryId;
    delete copy.bsId;
    delete copy.notes;
    const keywords = [...copy.keywords];
    for (const k of rule.keywords ?? []) if (!keywords.some((have) => have.toLowerCase() === k.toLowerCase())) keywords.push(dataKeyword(k));
    const unit: RosterUnit = {
      ...copy,
      id: rule.unitId,
      name: rule.name,
      cost: { ...rule.cost },
      limits: { max: rule.max, min: null },
      maxPerWarband: rule.max,
      onlyWith: [...rule.under],
      keywords,
      elite: copy.elite || keywords.some((k) => k.toLowerCase() === "elite"),
      substituteOf: source.id,
      equipmentAccess: copy.equipmentAccess.map((a) => (rule.lockedKit ? { ...a, permanent: true } : a)),
    };
    units.push(unit);
  }
  return { units, problems };
}

/**
 * Checks the file against the units and annotates their armoury rows in place:
 * the default `replaceableDefault`, each replacement `replaces` (and `hands`),
 * each permanent item `permanent`. Returns the problems found; empty means ok.
 */
export function applyUnitRules(file: UnitRules, unitsById: Map<string, RosterUnit>, lists: ListResolver, itemNames?: (itemId: string) => string | undefined): { index: UnitRulesIndex; problems: string[] } {
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

  const listUnits = (where: string, under: readonly string[]) => {
    const units = new Set<RosterUnit>();
    for (const id of under) {
      const list = lists.unitsUnder(id);
      if (!list) problems.push(`${where}: "${id}" is not a variant, subfaction or faction`);
      for (const u of list ?? []) units.add(u);
    }
    return [...units];
  };

  for (const rule of file.variantPrices) {
    const where = `variantPrices.${rule.id}`;
    const units = listUnits(where, rule.under);
    for (const unitId of rule.unitIds ?? []) unitOf(where, unitId);
    if (rule.kind !== "item" && rule.limit !== undefined) problems.push(`${where}: only an item price can carry a limit`);
    for (const target of rule.targets) {
      const offered =
        rule.kind === "unit"
          ? units.some((u) => u.id === target)
          : units.some((u) => (!rule.unitIds || rule.unitIds.includes(u.id)) && (rule.kind === "item" ? u.equipmentAccess.some((a) => a.itemId === target) : (u.upgrades ?? []).some((g) => g.name === target)));
      if (!offered) problems.push(`${where}: no unit under ${rule.under.join(" / ")} offers ${rule.kind} "${target}"`);
    }
  }

  for (const rule of file.freeAtCreation) {
    const where = `freeAtCreation.${rule.id}`;
    if (!listUnits(where, rule.under).some((u) => u.equipmentAccess.some((a) => a.itemId === rule.itemId))) problems.push(`${where}: no unit under ${rule.under.join(" / ")} offers "${rule.itemId}"`);
  }
  for (const rule of file.purseAdjustments) listUnits(`purseAdjustments.${rule.id}`, rule.under);
  for (const rule of [...file.variantRenames, ...file.variantKeywords]) {
    const kind = "name" in rule ? "variantRenames" : "variantKeywords";
    const where = `${kind}.${rule.id}`;
    const units = listUnits(where, rule.under);
    for (const unitId of rule.unitIds ?? []) {
      const unit = unitOf(where, unitId);
      if (unit && !units.includes(unit)) problems.push(`${where}: ${unitId} is not in the ${rule.under.join(" / ")} list`);
      if (unit && "withUpgrade" in rule && rule.withUpgrade && !(unit.upgrades ?? []).some((g) => g.name === rule.withUpgrade)) problems.push(`${where}: ${unitId} has no upgrade "${rule.withUpgrade}"`);
    }
    if (!("name" in rule) && !rule.add?.length && !rule.remove?.length) problems.push(`${where}: adds and removes nothing`);
  }

  for (const rule of file.firstPurchaseDiscounts) listUnits(`firstPurchaseDiscounts.${rule.id}`, rule.under);
  // Lent Battlekit: rows the converted data gates on the variant whose item is in
  // the other faction's core armoury are that faction's, bought under this rule.
  for (const rule of file.crossFactionArmoury) {
    const where = `crossFactionArmoury.${rule.id}`;
    const home = listUnits(where, rule.under);
    const from = lists.unitsUnder(rule.from);
    if (!from?.length || lists.isVariant(rule.from)) {
      problems.push(`${where}: "${rule.from}" is not a faction with a core list`);
      continue;
    }
    const theirs = new Set(
      from
        .filter((u) => u.kind === "model" && !u.mercenary && !u.onlyWith?.length)
        .flatMap((u) => u.equipmentAccess.filter((a) => !a.onlyWith?.length && !a.fixed && a.group !== "loadout" && a.group !== "direct").map((a) => a.itemId)),
    );
    let lent = 0;
    for (const unit of home) {
      for (const row of unit.equipmentAccess) {
        if (row.foreign || !theirs.has(row.itemId) || !row.onlyWith?.some((g) => rule.under.includes(g))) continue;
        row.foreign = rule.id;
        lent++;
      }
    }
    if (!lent) problems.push(`${where}: no row under ${rule.under.join(" / ")} lends Battlekit from ${rule.from}`);
  }
  for (const rule of file.warbandHeldItems) {
    const where = `warbandHeldItems.${rule.id}`;
    if (!listUnits(where, rule.under).some((u) => u.equipmentAccess.some((a) => a.itemId === rule.itemId))) problems.push(`${where}: no unit under ${rule.under.join(" / ")} offers "${rule.itemId}"`);
  }
  for (const rule of file.upgradeRequirements) {
    const where = `upgradeRequirements.${rule.id}`;
    for (const unitId of rule.unitIds) {
      const unit = unitOf(where, unitId);
      if (!unit) continue;
      const names = new Set((unit.upgrades ?? []).map((g) => g.name));
      for (const n of [...rule.upgrades, ...(rule.requires ?? []), ...(rule.excludes ?? []), ...(rule.unless ? [rule.unless] : [])]) {
        if (!names.has(n)) problems.push(`${where}: ${unitId} has no upgrade "${n}"`);
      }
      for (const itemId of rule.excludesItems ?? []) rowOf(where, unit, itemId);
    }
    if (!rule.requires?.length && !rule.excludes?.length && !rule.maxOf && !rule.excludesItems?.length && !rule.withoutKeywords?.length) problems.push(`${where}: requires and rules out nothing`);
  }
  for (const rule of file.minimumModelCosts) {
    const where = `minimumModelCosts.${rule.id}`;
    const units = listUnits(where, rule.under);
    for (const unitId of rule.exceptUnitIds ?? []) if (!units.some((u) => u.id === unitId)) problems.push(`${where}: ${unitId} is not in the ${rule.under.join(" / ")} list`);
  }
  // A currency choice is the same upgrade again at the other price, so the
  // per-model "once" and the per-warband limit (both counted by name) cover both.
  for (const rule of file.currencyChoices) {
    const where = `currencyChoices.${rule.id}`;
    let found = 0;
    for (const unit of listUnits(where, rule.under)) {
      const own = (unit.upgrades ?? []).find((g) => g.name === rule.upgrade && !g.paysFor);
      if (!own) continue;
      found++;
      const at = unit.upgrades!.indexOf(own) + 1;
      unit.upgrades = [...unit.upgrades!.slice(0, at), ...rule.alternatives.map((cost, i) => ({ ...own, bsId: `choice/${rule.id}/${i + 1}`, cost: { ...cost }, paysFor: own.bsId })), ...unit.upgrades!.slice(at)];
    }
    if (!found) problems.push(`${where}: no unit under ${rule.under.join(" / ")} has the upgrade "${rule.upgrade}"`);
  }

  // A grant's toggle is an upgrade: the list's own where upstream already
  // offers one (Swiss Guard), otherwise a free one added here. Either way it
  // carries `grant`, and the pools, not the upgrade's own limit text, cap it.
  const grantsById = new Map<string, FreeKeywordGrant>();
  for (const rule of file.freeKeywordGrants) {
    const where = `freeKeywordGrants.${rule.id}`;
    grantsById.set(rule.id, rule);
    const units = listUnits(where, rule.under);
    const variants = rule.under.filter((id) => lists.isVariant(id));
    const gate = variants.length ? { onlyWith: variants } : {};
    const restricted = rule.pools.every((p) => p.unitIds);
    const eligible = restricted ? new Set(rule.pools.flatMap((p) => p.unitIds ?? [])) : undefined;
    for (const unitId of eligible ?? []) {
      const unit = unitOf(where, unitId);
      if (unit && !units.includes(unit)) problems.push(`${where}: ${unitId} is not in the ${rule.under.join(" / ")} list`);
    }
    for (const unit of units) {
      if (unit.kind === "fireteam" || (eligible && !eligible.has(unit.id))) continue;
      const own = (unit.upgrades ?? []).filter((g) => g.name === rule.upgrade);
      if (own.length) for (const g of own) g.grant = rule.id;
      else {
        unit.upgrades = [
          ...(unit.upgrades ?? []),
          { bsId: `grant/${rule.id}`, name: rule.upgrade, group: "upgrades", cost: { ducats: 0, glory: 0 }, max: 1, rules: [{ name: rule.name, text: rule.text }], grant: rule.id, ...gate },
        ];
      }
    }
  }
  const effectsByUnit = new Map<string, ModelEffect[]>();
  for (const unit of unitsById.values()) {
    const fromNotes = effectsFromNotes(unit, (id) => itemNames?.(id));
    if (fromNotes.length) effectsByUnit.set(unit.id, fromNotes);
  }
  for (const rule of file.upgradeEffects) {
    const where = `upgradeEffects.${rule.id}`;
    for (const unitId of rule.unitIds) {
      const unit = unitOf(where, unitId);
      if (!unit) continue;
      if (!(unit.upgrades ?? []).some((g) => g.name === rule.upgrade)) problems.push(`${where}: ${unitId} has no upgrade "${rule.upgrade}"`);
      effectsByUnit.set(unitId, [...(effectsByUnit.get(unitId) ?? []), { upgrade: rule.upgrade, changes: rule.changes, keywords: [], rule }]);
    }
  }
  for (const rule of file.variantKeywords) if (rule.withUpgrade && !rule.unitIds) problems.push(`variantKeywords.${rule.id}: withUpgrade needs unitIds`);
  return { index: { file, byUnit, grantsById, effectsByUnit }, problems };
}
