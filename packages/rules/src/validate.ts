import { checkBattlekit, type CarriedItem } from "./battlekit.js";
import type { GroupLimit, PreGameChoice, ReplaceableBuiltIn } from "./unit-rules.js";
import { warbandCost } from "./cost.js";
import { normaliseName, resolveLimit, type LimitContext, type LimitField } from "./limits.js";
import {
  accessFor,
  findSubfaction,
  findUnit,
  inRosterList,
  rosterUnits,
  rosterVariants,
  thresholdFor,
  upgradeFor,
  type Campaign,
  type RosterAccess,
  type RosterUnit,
  type RulesData,
  type ThresholdRow,
  type Upgrade,
} from "./data.js";
import { Warband as WarbandSchema, type Warband, type WarbandMember } from "./roster.js";
import type { EquipmentItem } from "./schema.js";

export const ROSTER_ERROR_CODES = [
  "roster-invalid",
  "faction-unknown",
  "subfaction-unknown",
  "variant-unknown",
  "patron-unknown",
  "patron-faction",
  "unit-unknown",
  "unit-faction",
  "over-threshold",
  "over-glory",
  "unit-min",
  "unit-max",
  "mercenary-limit",
  "variant-locked",
  "variant-excluded",
  "elite-cap",
  "item-unknown",
  "item-not-available",
  "item-fixed-missing",
  "built-in-missing",
  "built-in-replacement",
  "item-group-limit",
  "pre-game-invalid",
  "item-variant-locked",
  "item-max-per-model",
  "item-max-per-warband",
  "upgrade-unknown",
  "upgrade-variant-locked",
  "upgrade-duplicate",
  "upgrade-max-per-model",
  "upgrade-max-per-warband",
  "battlekit-ranged",
  "battlekit-melee",
  "battlekit-grenade",
  "battlekit-armour",
  "battlekit-shield",
  "battlekit-headgear",
  "battlekit-duplicate",
  "battlekit-heavy",
  "battlekit-hands",
  "bayonet-lug",
] as const;
export type RosterErrorCode = (typeof ROSTER_ERROR_CODES)[number];

export interface RosterError {
  code: RosterErrorCode;
  memberId?: string;
  unitId?: string;
  itemId?: string;
  message: string;
}

export type RosterWarningCode = "unmodelled" | "glory-unknown";

export interface RosterWarning {
  code: RosterWarningCode;
  memberId?: string;
  unitId?: string;
  itemId?: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: RosterError[];
  warnings: RosterWarning[];
}

export interface ValidateOptions {
  /** Overrides the Threshold Value looked up from gameNumber. */
  threshold?: number;
}

/** Warbands of Trench Crusade p10, "Maximum Elites". */
export const MAX_ELITES = 6;

interface ResolvedMember {
  member: WarbandMember;
  unit: RosterUnit;
}

interface TakenUpgrade {
  upgrade: Upgrade;
  unit: RosterUnit;
  count: number;
}

export function validateWarband(input: Warband, data: RulesData, opts: ValidateOptions = {}): ValidationResult {
  const errors: RosterError[] = [];
  const warnings: RosterWarning[] = [];
  const fail = (e: RosterError) => void errors.push(e);
  const warn = (w: Omit<RosterWarning, "code">) => void warnings.push({ code: "unmodelled", ...w });
  const done = () => ({ ok: errors.length === 0, errors, warnings });

  const parsed = WarbandSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fail({ code: "roster-invalid", message: `${issue.path.join(".")}: ${issue.message}` });
    return done();
  }
  const warband = parsed.data;

  const faction = data.factionsById.get(warband.factionId);
  if (!faction) {
    fail({ code: "faction-unknown", message: `Unknown faction "${warband.factionId}"` });
    return done();
  }

  const subfaction = findSubfaction(data, warband);
  if (warband.subfactionId !== undefined && !subfaction) {
    fail({ code: "subfaction-unknown", message: `"${warband.subfactionId}" is not a subfaction of ${faction.name}` });
    return done();
  }
  const listName = subfaction?.name ?? faction.name;

  const variants = rosterVariants(data, warband);
  if (warband.variantId !== undefined && !variants.some((v) => v.id === warband.variantId)) {
    fail({ code: "variant-unknown", message: `"${warband.variantId}" is not a variant of ${listName}` });
  }

  if (warband.patronId !== undefined) {
    const patron = data.campaign.patrons.find((p) => p.id === warband.patronId);
    if (!patron) fail({ code: "patron-unknown", message: `Unknown patron "${warband.patronId}"` });
    else if (!patron.factions.some((name) => sameFactionName(name, faction.name))) {
      fail({ code: "patron-faction", message: `${patron.name} does not sponsor ${faction.name}` });
    }
  }

  const members: ResolvedMember[] = [];
  for (const member of warband.members) {
    const unit = findUnit(data, warband, member.unitId);
    if (!unit) {
      fail({ code: "unit-unknown", memberId: member.id, unitId: member.unitId, message: `Unknown unit "${member.unitId}"` });
      continue;
    }
    if (!inRosterList(unit, warband)) {
      fail({
        code: "unit-faction",
        memberId: member.id,
        unitId: unit.id,
        message: `${unit.name} belongs to ${unit.subfactionId ?? unit.factionId}, not ${listName}`,
      });
      continue;
    }
    if (unit.kind === "fireteam") {
      warn({ memberId: member.id, unitId: unit.id, message: `${unit.name} is a deprecated Fireteam wrapper with no profile; its members are not validated` });
    }
    members.push({ member, unit });
  }

  const ctx = buildLimitContext(warband, data, members);
  const variant = variants.find((v) => v.id === warband.variantId);

  // Digital Rulebook p97–98: total cost (models, Battlekit, paid upgrades) must
  // not exceed the Threshold Value for the game being played. A variant that
  // starts with a smaller purse keeps the same shortfall in later games
  // (Papal States: "Threshold Value is reduced by 200", Warbands p35).
  const cost = warbandCost(warband, data);
  let threshold = opts.threshold;
  if (threshold === undefined) {
    const t = warbandThreshold(warband, data);
    threshold = t.value;
    if (t.clamped) warn({ message: `Threshold table ends at game ${t.row.game}; using ${t.row.threshold} for game ${warband.gameNumber}` });
  }
  if (cost.ducats > threshold) {
    fail({ code: "over-threshold", message: `Warband costs ${cost.ducats} ducats; Threshold Value is ${threshold}` });
  }

  // Warbands p10: a new warband has no Glory unless its variant grants some.
  let glory = warband.glory;
  if (glory === undefined && warband.gameNumber === 1) glory = variant?.startingGlory ?? 0;
  if (glory === undefined) {
    if (cost.glory > 0) warnings.push({ code: "glory-unknown", message: `Warband spends ${cost.glory} Glory Points; set glory to check them against the pool` });
  } else if (cost.glory > glory) {
    fail({ code: "over-glory", message: `Warband spends ${cost.glory} Glory Points but only ${glory} are available` });
  }

  checkUnitCounts(warband, data, members, ctx, fail, warn);

  const elites = members.filter((m) => m.unit.elite).length;
  if (elites > MAX_ELITES) {
    fail({ code: "elite-cap", message: `${elites} ELITE models; a warband can never include more than ${MAX_ELITES}` });
  }

  const carriedByItem = new Map<string, { total: number; sample: CarriedItem; memberId: string }>();
  const takenByUpgrade = new Map<string, { total: number; rows: TakenUpgrade[] }>();
  for (const { member, unit } of members) {
    const where = { memberId: member.id, unitId: unit.id };
    const carried = checkMemberItems(member, unit, data, warband, ctx, fail, warn);
    checkFixedKit(member, unit, data, warband, ctx, fail);
    checkUnitRules(member, unit, data, warband, ctx, fail);
    const taken = checkMemberUpgrades(member, unit, data, warband, ctx, fail, warn);
    const kit = checkBattlekit(unit, carried, data.headgearItemIds);
    for (const e of kit.errors) fail({ ...where, ...e });
    for (const w of kit.warnings) warn({ ...where, ...w });
    for (const c of carried) {
      const entry = carriedByItem.get(c.itemId);
      if (entry) entry.total += c.count;
      else carriedByItem.set(c.itemId, { total: c.count, sample: c, memberId: member.id });
    }
    for (const t of taken) {
      const key = normaliseName(t.upgrade.name);
      const entry = takenByUpgrade.get(key);
      if (entry) (entry.total += t.count), entry.rows.push(t);
      else takenByUpgrade.set(key, { total: t.count, rows: [t] });
    }
  }

  // Warbands of Trench Crusade p11, "Limit X": a warband-wide cap on a piece of Battlekit.
  for (const [itemId, { total, sample }] of carriedByItem) {
    const limit = resolveLimit(sample.access.limitsText ?? sample.item.limits ?? undefined, "max", "warband", sample.access.maxPerWarband ?? null, ctx, sample.item.name);
    if (limit.value !== null && total > limit.value) {
      fail({ code: "item-max-per-warband", itemId, message: `${sample.item.name}: ${total} in the warband, limit ${limit.value}` });
      warnUnresolved(warn, limit.unresolved, { itemId }, sample.item.name);
    }
  }

  // Upgrades capped per warband ("Up to 2 Yeomen can be upgraded to Trench
  // Moles", p30; Forward Positions p41) count across every unit that offers
  // the same-named entry, which is how BattleScribe shares the constraint.
  for (const { total, rows } of takenByUpgrade.values()) {
    for (const { upgrade, unit } of rows) {
      const where = { unitId: unit.id };
      const limit = resolveLimit(upgrade.limitsText, "max", "warband", upgrade.maxPerWarband ?? null, ctx, upgrade.name);
      if (limit.value !== null && total > limit.value) {
        fail({ code: "upgrade-max-per-warband", ...where, message: `${upgrade.name}: ${total} in the warband, limit ${limit.value}` });
        warnUnresolved(warn, limit.unresolved, where, upgrade.name);
        break;
      }
    }
  }

  checkPreGame(warband, data, fail);

  return done();
}

function sameFactionName(a: string, b: string): boolean {
  const norm = (s: string) => normaliseName(s).replace(/^the/, "").replace(/s$/, "");
  return norm(a) === norm(b);
}

/** Patrons that sponsor the faction (campaign.json spells faction names slightly differently from factions.json). A subfaction takes its faction's patrons. */
export function patronsForFaction(data: RulesData, factionId: string): Campaign["patrons"] {
  const faction = data.factionsById.get(factionId);
  if (!faction) return [];
  return data.campaign.patrons.filter((p) => p.factions.some((name) => sameFactionName(name, faction.name)));
}

export interface WarbandThreshold {
  /** Threshold Value the roster is checked against. */
  value: number;
  /** The table row it came from, before any variant adjustment. */
  row: ThresholdRow;
  clamped: boolean;
}

/**
 * Threshold Value for this roster: the table row for its game number, less
 * the shortfall of a variant that starts with a smaller purse (Papal States:
 * "Threshold Value is reduced by 200", Warbands p35).
 */
export function warbandThreshold(warband: Pick<Warband, "factionId" | "subfactionId" | "variantId" | "gameNumber">, data: RulesData): WarbandThreshold {
  const t = thresholdFor(data, warband.gameNumber);
  let value = t.row.threshold;
  const variant = rosterVariants(data, warband).find((v) => v.id === warband.variantId);
  if (variant?.startingDucats !== undefined) value -= thresholdFor(data, 1).row.threshold - variant.startingDucats;
  return { value, row: t.row, clamped: t.clamped };
}

/** The counting context the validator uses for limit text and gates, for callers that show limits before validating. */
export function limitContext(warband: Warband, data: RulesData): LimitContext {
  const members: ResolvedMember[] = [];
  for (const member of warband.members) {
    const unit = findUnit(data, warband, member.unitId);
    if (unit && inRosterList(unit, warband)) members.push({ member, unit });
  }
  return buildLimitContext(warband, data, members);
}

/** Effective per-warband min/max for a unit under this roster (null: no limit). */
export function unitLimits(unit: RosterUnit, ctx: LimitContext): { min: number | null; max: number | null } {
  return { min: unitLimit(unit, "min", ctx).value, max: capMax(unit, unitLimit(unit, "max", ctx).value) };
}

function capMax(unit: RosterUnit, resolved: number | null): number | null {
  const cap = [resolved, unit.maxPerWarband ?? null].filter((n): n is number => n !== null);
  return cap.length ? Math.min(...cap) : null;
}

export interface GateRef {
  gate: string;
  list: "onlyWith" | "onlyWithout";
}

export interface GateResult {
  /** False when a gate is closed by something the data can count; the validator fails these. */
  open: boolean;
  /** What closed it: every onlyWith entry when none matched, or the onlyWithout entries that did. */
  blockedBy: GateRef[];
  /** Entries the data cannot count; the validator warns about these instead of failing. */
  unresolved: GateRef[];
}

/** Evaluates a unit's, access row's or upgrade's gates the way validateWarband does, for callers that want to show availability before the fact. */
export function evaluateGates(
  onlyWith: string[] | undefined,
  onlyWithout: string[] | undefined,
  warband: Warband,
  data: RulesData,
  ctx: LimitContext,
  model?: ModelScope,
): GateResult {
  const result: GateResult = { open: true, blockedBy: [], unresolved: [] };
  if (onlyWith && onlyWith.length > 0) {
    const gate = evalGate(onlyWith, warband, data, ctx, model);
    if (!gate.matched) {
      if (gate.unresolved.length > 0) result.unresolved.push(...gate.unresolved.map((g) => ({ gate: g, list: "onlyWith" as const })));
      else (result.open = false), result.blockedBy.push(...onlyWith.map((g) => ({ gate: g, list: "onlyWith" as const })));
    }
  }
  if (onlyWithout && onlyWithout.length > 0) {
    const gate = evalGate(onlyWithout, warband, data, ctx, model);
    if (gate.matched) (result.open = false), result.blockedBy.push(...gate.matchedBy.map((g) => ({ gate: g, list: "onlyWithout" as const })));
    else result.unresolved.push(...gate.unresolved.map((g) => ({ gate: g, list: "onlyWithout" as const })));
  }
  return result;
}

function warnUnresolved(
  warn: (w: Omit<RosterWarning, "code">) => void,
  unresolved: string[],
  where: { memberId?: string; unitId?: string; itemId?: string },
  subject: string,
): void {
  for (const clause of unresolved) {
    warn({ ...where, message: `${subject}: limit may be modified by "${clause}", which the data does not model` });
  }
}

function buildLimitContext(warband: Warband, data: RulesData, members: ResolvedMember[]): LimitContext {
  const variants = new Map<string, string>();
  for (const v of rosterVariants(data, warband)) variants.set(normaliseName(v.name), v.id);
  const list = findSubfaction(data, warband) ?? data.factionsById.get(warband.factionId);
  const mandatory = new Set((list?.configuration ?? []).filter((c) => c.mandatory).map((c) => normaliseName(c.name)));

  const unitCounts = new Map<string, number>();
  const itemCounts = new Map<string, number>();
  const upgradeCounts = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string, n = 1) => map.set(key, (map.get(key) ?? 0) + n);
  for (const { member, unit } of members) {
    bump(unitCounts, normaliseName(unit.name));
    for (const itemId of member.equipmentItemIds) {
      const item = data.equipmentById.get(itemId);
      if (item) bump(itemCounts, normaliseName(item.name));
    }
    for (const id of member.upgradeIds ?? []) {
      const g = upgradeFor(unit, id);
      if (g) bump(upgradeCounts, normaliseName(g.name));
    }
  }

  const units = rosterUnits(data, warband);
  const knownUnits = new Set(units.map((u) => normaliseName(u.name)));
  const knownItems = new Set(data.equipment.map((e) => normaliseName(e.name)));
  const knownUpgrades = new Set(units.flatMap((u) => (u.upgrades ?? []).map((g) => normaliseName(g.name))));

  return {
    count(name) {
      const key = normaliseName(name);
      const variantId = variants.get(key);
      if (variantId !== undefined) return warband.variantId === variantId ? 1 : 0;
      if (mandatory.has(key)) return 1;
      let known = false;
      let total = 0;
      if (knownUnits.has(key)) (known = true), (total += unitCounts.get(key) ?? 0);
      if (knownItems.has(key)) (known = true), (total += itemCounts.get(key) ?? 0);
      if (knownUpgrades.has(key)) (known = true), (total += upgradeCounts.get(key) ?? 0);
      return known ? total : undefined;
    },
  };
}

type Gate = { matched: boolean; matchedBy: string[]; unresolved: string[] };

export interface ModelScope {
  member: WarbandMember;
  unit: RosterUnit;
}

const SAME_MODEL_GATE = /^(item|upgrade):(.+)$/;

function countOnModel(model: ModelScope, kind: string, ref: string): number {
  if (kind === "item") return model.member.equipmentItemIds.filter((id) => id === ref).length;
  const key = normaliseName(ref);
  return (model.member.upgradeIds ?? []).filter((id) => normaliseName(upgradeFor(model.unit, id)?.name ?? "") === key).length;
}

/**
 * onlyWith / onlyWithout entries are variant ids, `item:<item-id>` / `upgrade:<name>`
 * (a selection on the same model, e.g. a Heavy Ballistic Shield's Machine Armour) or
 * "Name [Catalogue]" strings counted across the roster. Any match satisfies the gate.
 */
function evalGate(values: string[] | undefined, warband: Warband, data: RulesData, ctx: LimitContext, model?: ModelScope): Gate {
  const gate: Gate = { matched: false, matchedBy: [], unresolved: [] };
  const match = (v: string) => ((gate.matched = true), gate.matchedBy.push(v));
  for (const v of values ?? []) {
    if (data.variantsById.has(v)) {
      if (warband.variantId === v) match(v);
      continue;
    }
    const scoped = SAME_MODEL_GATE.exec(v);
    if (scoped && model) {
      if (countOnModel(model, scoped[1]!, scoped[2]!) > 0) match(v);
      continue;
    }
    const count = ctx.count(scoped ? scoped[2]! : v);
    if (count === undefined) gate.unresolved.push(v);
    else if (count > 0) match(v);
  }
  return gate;
}

function checkGates(
  subject: string,
  onlyWith: string[] | undefined,
  onlyWithout: string[] | undefined,
  warband: Warband,
  data: RulesData,
  ctx: LimitContext,
  codes: { locked: RosterErrorCode; excluded: RosterErrorCode },
  where: { memberId?: string; unitId?: string; itemId?: string },
  fail: (e: RosterError) => void,
  warn: (w: Omit<RosterWarning, "code">) => void,
  model?: ModelScope,
): void {
  if (onlyWith && onlyWith.length > 0) {
    const gate = evalGate(onlyWith, warband, data, ctx, model);
    if (!gate.matched) {
      if (gate.unresolved.length > 0) {
        warn({ ...where, message: `${subject} requires one of ${gate.unresolved.map((u) => `"${u}"`).join(", ")}, which the data does not model` });
      } else {
        fail({ ...where, code: codes.locked, message: `${subject} is only available with ${onlyWith.join(" or ")}` });
      }
    }
  }
  if (onlyWithout && onlyWithout.length > 0) {
    const gate = evalGate(onlyWithout, warband, data, ctx, model);
    if (gate.matched) {
      fail({ ...where, code: codes.excluded, message: `${subject} is not available with ${onlyWithout.join(" / ")}` });
    } else if (gate.unresolved.length > 0) {
      warn({ ...where, message: `${subject} is unavailable with ${gate.unresolved.map((u) => `"${u}"`).join(", ")}, which the data does not model` });
    }
  }
}

function unitLimit(unit: RosterUnit, field: LimitField, ctx: LimitContext) {
  return resolveLimit(unit.limits.text, field, "warband", unit.limits[field], ctx, unit.name);
}

// A minimum binds only when the roster can take the unit at all: a leader the
// variant swaps out (Matagot Hag, Chieftain, the Yüzbaşı under Fida'i of
// Alamut, Warbands p89 / p94) is not missing from a warband that cannot have it.
function unitAvailable(unit: RosterUnit, warband: Warband, data: RulesData, ctx: LimitContext): boolean {
  if (unit.onlyWith?.length && !evalGate(unit.onlyWith, warband, data, ctx).matched) return false;
  if (unit.onlyWithout?.length && evalGate(unit.onlyWithout, warband, data, ctx).matched) return false;
  return true;
}

// Warbands of Trench Crusade p13: some entries must be taken, some are 0-X.
// Mercenaries (p172) are per-faction rows with their own 0-1 limits.
function checkUnitCounts(
  warband: Warband,
  data: RulesData,
  members: ResolvedMember[],
  ctx: LimitContext,
  fail: (e: RosterError) => void,
  warn: (w: Omit<RosterWarning, "code">) => void,
): void {
  const counts = new Map<string, number>();
  for (const { unit } of members) counts.set(unit.id, (counts.get(unit.id) ?? 0) + 1);

  for (const unit of rosterUnits(data, warband)) {
    const count = counts.get(unit.id) ?? 0;
    const where = { unitId: unit.id };

    if (count > 0) {
      checkGates(unit.name, unit.onlyWith, unit.onlyWithout, warband, data, ctx, { locked: "variant-locked", excluded: "variant-excluded" }, where, fail, warn);
    }

    const max = unitLimit(unit, "max", ctx);
    const effectiveMax = capMax(unit, max.value);
    if (effectiveMax !== null && count > effectiveMax) {
      fail({
        code: unit.mercenary ? "mercenary-limit" : "unit-max",
        ...where,
        message: `${count} x ${unit.name}; at most ${effectiveMax} per warband`,
      });
      warnUnresolved(warn, max.unresolved, where, unit.name);
    }

    const min = unitLimit(unit, "min", ctx);
    if (min.value !== null && count < min.value && unitAvailable(unit, warband, data, ctx)) {
      fail({ code: "unit-min", ...where, message: `${count} x ${unit.name}; at least ${min.value} required` });
      warnUnresolved(warn, min.unresolved, where, unit.name);
    }
  }
}

// unit-rules.json mechanics ------------------------------------------------

/** A gate is satisfied only when the data can count everything it names; an uncountable gate never switches a mechanic on. */
function gateHolds(onlyWith: string[] | undefined, onlyWithout: string[] | undefined, warband: Warband, data: RulesData, ctx: LimitContext): boolean {
  const g = evaluateGates(onlyWith, onlyWithout, warband, data, ctx);
  return g.open && !g.unresolved.some((r) => r.list === "onlyWith");
}

/** The unit's profile under this roster: its card stats with any unit-rules override whose gate holds (Anchorite Armoury, p63). */
export function effectiveStats(unit: RosterUnit, warband: Warband, data: RulesData, ctx: LimitContext = limitContext(warband, data)): RosterUnit["stats"] {
  let stats = unit.stats;
  for (const o of data.unitRules.byUnit.get(unit.id)?.statOverrides ?? []) {
    if (gateHolds(o.onlyWith, o.onlyWithout, warband, data, ctx)) stats = { ...stats, ...o.stats };
  }
  return stats;
}

export interface ReplaceableState {
  rule: ReplaceableBuiltIn;
  /** The roster may replace the default (its gate holds). Recruitment-only is the roster tool's to enforce. */
  open: boolean;
  /** How many of the default and its replacements the member carries, and which. */
  carried: string[];
}

export function replaceableState(member: WarbandMember, unit: RosterUnit, warband: Warband, data: RulesData, ctx: LimitContext = limitContext(warband, data)): ReplaceableState[] {
  return (data.unitRules.byUnit.get(unit.id)?.replaceable ?? []).map((rule) => {
    const slot = new Set([rule.itemId, ...rule.replacements.itemIds]);
    return { rule, open: gateHolds(rule.replacements.onlyWith, rule.replacements.onlyWithout, warband, data, ctx), carried: member.equipmentItemIds.filter((id) => slot.has(id)) };
  });
}

/** Items of each per-model group the member carries. */
export function groupCounts(member: WarbandMember, unit: RosterUnit, data: RulesData): { limit: GroupLimit; count: number }[] {
  return (data.unitRules.byUnit.get(unit.id)?.groupLimits ?? []).map((limit) => {
    const ids = new Set(limit.itemIds);
    return { limit, count: member.equipmentItemIds.filter((id) => ids.has(id)).length };
  });
}

function checkUnitRules(member: WarbandMember, unit: RosterUnit, data: RulesData, warband: Warband, ctx: LimitContext, fail: (e: RosterError) => void): void {
  const where = { memberId: member.id, unitId: unit.id };
  const name = (id: string) => data.equipmentById.get(id)?.name ?? id;
  for (const s of replaceableState(member, unit, warband, data, ctx)) {
    const { rule } = s;
    if (s.carried.length === 0) {
      const alt = s.open ? `, or one of its replacements (p${rule.replacements.page})` : "";
      fail({ ...where, code: "built-in-missing", itemId: rule.itemId, message: `${unit.name} must carry its ${rule.name}${alt} (p${rule.page})` });
    } else if (s.carried.length > 1) {
      fail({ ...where, code: "built-in-replacement", message: `${unit.name} carries ${s.carried.map(name).join(" and ")}; its ${rule.name} slot holds exactly one` });
    } else if (s.carried[0] !== rule.itemId && !s.open) {
      const where_ = (rule.replacements.onlyWith ?? []).map((g) => data.variantsById.get(g)?.name ?? g).join(" or ");
      fail({ ...where, code: "built-in-replacement", itemId: s.carried[0], message: `${unit.name} can only swap its ${rule.name} for ${name(s.carried[0]!)}${where_ ? ` in a ${where_} warband` : ""} (p${rule.replacements.page})` });
    }
  }
  for (const { limit, count } of groupCounts(member, unit, data)) {
    if (count > limit.maxPerModel) {
      fail({ ...where, code: "item-group-limit", message: `${unit.name}: up to ${limit.maxPerModel} ${limit.name} (has ${count}, p${limit.page})` });
    }
  }
}

export interface PreGameState {
  rule: PreGameChoice;
  /** The rule may be used by this roster (its gate holds). */
  available: boolean;
  /** Members that may be chosen. Empty when the rule is unavailable. */
  candidates: WarbandMember[];
  /** The stored choice, if any. */
  chosen: string | null;
}

/** Pre-game choices the roster's units give it (Broken on the Wheel, p59), with who may be chosen. */
export function preGameChoices(warband: Warband, data: RulesData, ctx: LimitContext = limitContext(warband, data)): PreGameState[] {
  const rules = new Map<string, PreGameChoice>();
  for (const m of warband.members) {
    const unit = findUnit(data, warband, m.unitId);
    for (const rule of (unit && data.unitRules.byUnit.get(unit.id)?.preGame) ?? []) rules.set(rule.key, rule);
  }
  return [...rules.values()].map((rule) => {
    const available = gateHolds(rule.onlyWith, rule.onlyWithout, warband, data, ctx);
    const banned = new Set((rule.victims.excludeUpgrades ?? []).map(normaliseName));
    const candidates = !available
      ? []
      : warband.members.filter((m) => {
          const unit = findUnit(data, warband, m.unitId);
          if (!unit || !rule.victims.unitNames.includes(unit.name)) return false;
          return !(m.upgradeIds ?? []).some((id) => banned.has(normaliseName(upgradeFor(unit, id)?.name ?? "")));
        });
    return { rule, available, candidates, chosen: warband.preGame?.[rule.key] ?? null };
  });
}

function checkPreGame(warband: Warband, data: RulesData, fail: (e: RosterError) => void): void {
  const states = new Map(preGameChoices(warband, data).map((s) => [s.rule.key, s]));
  for (const [key, chosen] of Object.entries(warband.preGame ?? {})) {
    if (chosen === null) continue;
    const s = states.get(key);
    if (!s) {
      fail({ code: "pre-game-invalid", memberId: chosen, message: `No model in the warband gives it the "${key}" choice` });
    } else if (!s.available) {
      fail({ code: "pre-game-invalid", memberId: chosen, message: `${s.rule.name} is not allowed: ${s.rule.unavailable?.text ?? "its condition does not hold"}${s.rule.unavailable ? ` (p${s.rule.unavailable.page})` : ""}` });
    } else if (!s.candidates.some((m) => m.id === chosen)) {
      fail({ code: "pre-game-invalid", memberId: chosen, message: `${s.rule.name}: the chosen model must be a ${s.rule.victims.unitNames.join(" or ")}${s.rule.victims.excludeUpgrades?.length ? ` without ${s.rule.victims.excludeUpgrades.join(" or ")}` : ""} (p${s.rule.page})` });
    }
  }
}

// A `fixed` armoury row is kit the unit's entry gives it: free, and (every
// such row in the data) "min 1 per model". It is part of the model, so leaving
// it off is an error. A gate the data cannot count leaves the row unrequired.
function checkFixedKit(member: WarbandMember, unit: RosterUnit, data: RulesData, warband: Warband, ctx: LimitContext, fail: (e: RosterError) => void): void {
  const model = { member, unit };
  for (const access of unit.equipmentAccess) {
    if (!access.fixed) continue;
    const item = data.equipmentById.get(access.itemId);
    if (!item) continue;
    if (access.onlyWith?.length && !evalGate(access.onlyWith, warband, data, ctx, model).matched) continue;
    if (access.onlyWithout?.length && evalGate(access.onlyWithout, warband, data, ctx, model).matched) continue;
    const required = Math.max(1, resolveLimit(access.limitsText ?? item.limits ?? undefined, "min", "model", null, ctx, item.name).value ?? 1);
    const carried = member.equipmentItemIds.filter((id) => id === access.itemId).length;
    if (carried < required) {
      fail({ code: "item-fixed-missing", memberId: member.id, unitId: unit.id, itemId: item.id, message: `${unit.name} must carry ${item.name}: it is part of the unit's kit` });
    }
  }
}

function checkMemberItems(
  member: WarbandMember,
  unit: RosterUnit,
  data: RulesData,
  warband: Warband,
  ctx: LimitContext,
  fail: (e: RosterError) => void,
  warn: (w: Omit<RosterWarning, "code">) => void,
): CarriedItem[] {
  const counts = new Map<string, number>();
  for (const itemId of member.equipmentItemIds) counts.set(itemId, (counts.get(itemId) ?? 0) + 1);

  const carried: CarriedItem[] = [];
  for (const [itemId, count] of counts) {
    const where = { memberId: member.id, unitId: unit.id, itemId };
    const item = data.equipmentById.get(itemId);
    if (!item) {
      fail({ code: "item-unknown", ...where, message: `Unknown item "${itemId}"` });
      continue;
    }
    const access = accessFor(unit, itemId);
    if (!access) {
      fail({ code: "item-not-available", ...where, message: `${item.name} is not in the ${unit.name} armoury` });
      continue;
    }
    checkGates(item.name, access.onlyWith, access.onlyWithout, warband, data, ctx, { locked: "item-variant-locked", excluded: "item-variant-locked" }, where, fail, warn, { member, unit });

    const perModel = resolveLimit(access.limitsText ?? item.limits ?? undefined, "max", "model", access.max ?? null, ctx, item.name);
    if (perModel.value !== null && count > perModel.value) {
      fail({ code: "item-max-per-model", ...where, message: `${count} x ${item.name} on one model; limit ${perModel.value}` });
      warnUnresolved(warn, perModel.unresolved, where, item.name);
    }
    carried.push({ itemId, item, access, count });
  }
  return carried;
}

function checkMemberUpgrades(
  member: WarbandMember,
  unit: RosterUnit,
  data: RulesData,
  warband: Warband,
  ctx: LimitContext,
  fail: (e: RosterError) => void,
  warn: (w: Omit<RosterWarning, "code">) => void,
): TakenUpgrade[] {
  const where = { memberId: member.id, unitId: unit.id };
  // Keyed by name, not bsId: the converter splits one ability into an entry
  // per variant gate (the Yüzbaşı's Janissary Veteran, one +10 ability on p81).
  const taken = new Map<string, TakenUpgrade>();
  for (const id of member.upgradeIds ?? []) {
    const upgrade = upgradeFor(unit, id);
    if (!upgrade) {
      fail({ code: "upgrade-unknown", ...where, message: `Unknown upgrade "${id}" for ${unit.name}` });
      continue;
    }
    checkGates(upgrade.name, upgrade.onlyWith, upgrade.onlyWithout, warband, data, ctx, { locked: "upgrade-variant-locked", excluded: "upgrade-variant-locked" }, where, fail, warn, { member, unit });
    const key = normaliseName(upgrade.name);
    const entry = taken.get(key);
    if (entry) entry.count += 1;
    else taken.set(key, { upgrade, unit, count: 1 });
  }

  // Warbands p14: an upgrade "cannot be purchased more than once for the same
  // model" unless its entry says otherwise, so the data's per-model max only
  // changes the code when it is not the default of one.
  for (const t of taken.values()) {
    const perModel = resolveLimit(t.upgrade.limitsText, "max", "model", t.upgrade.max ?? null, ctx, t.upgrade.name);
    const max = perModel.value ?? 1;
    if (t.count > max) {
      fail({
        code: max === 1 ? "upgrade-duplicate" : "upgrade-max-per-model",
        ...where,
        message: `${t.upgrade.name} taken ${t.count} times on one ${t.unit.name}; limit ${max} per model`,
      });
      warnUnresolved(warn, perModel.unresolved, where, t.upgrade.name);
    }
  }
  return [...taken.values()];
}
