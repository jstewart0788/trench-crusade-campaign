import { warbandCost } from "./cost.js";
import { normaliseName, resolveLimit, type LimitContext, type LimitField } from "./limits.js";
import { accessFor, findUnit, thresholdFor, upgradeFor, type RosterAccess, type RosterUnit, type RulesData, type Upgrade } from "./load.js";
import { Warband as WarbandSchema, type Warband, type WarbandMember } from "./roster.js";
import type { EquipmentItem } from "./schema.js";

export const ROSTER_ERROR_CODES = [
  "roster-invalid",
  "faction-unknown",
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

// Access groups whose weapons carry the Shield Combo stipulation in every
// faction armoury (Warbands of Trench Crusade p24, p50, p74, p106, p129). The
// dataset has no stipulation field, so the BattleScribe group name stands in.
// A mercenary's `loadout` is its fixed kit, and the Mamluk Faris's Polearm
// comes paired with a Trench Shield (p179).
const SHIELD_COMBO_GROUPS = new Set(["shield-combo", "shield-combos", "bayonet", "loadout"]);

interface ResolvedMember {
  member: WarbandMember;
  unit: RosterUnit;
}

interface CarriedItem {
  itemId: string;
  item: EquipmentItem;
  access: RosterAccess;
  count: number;
}

interface TakenUpgrade {
  upgrade: Upgrade;
  unit: RosterUnit;
  count: number;
}

const hasKeyword = (keywords: string[], re: RegExp) => keywords.some((k) => re.test(k.trim()));

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

  if (warband.variantId !== undefined && !faction.variants.some((v) => v.id === warband.variantId)) {
    fail({ code: "variant-unknown", message: `"${warband.variantId}" is not a variant of ${faction.name}` });
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
    const unit = findUnit(data, warband.factionId, member.unitId);
    if (!unit) {
      fail({ code: "unit-unknown", memberId: member.id, unitId: member.unitId, message: `Unknown unit "${member.unitId}"` });
      continue;
    }
    if (unit.factionId !== warband.factionId) {
      fail({
        code: "unit-faction",
        memberId: member.id,
        unitId: unit.id,
        message: `${unit.name} belongs to ${unit.factionId}, not ${faction.name}`,
      });
      continue;
    }
    if (unit.kind === "fireteam") {
      warn({ memberId: member.id, unitId: unit.id, message: `${unit.name} is a deprecated Fireteam wrapper with no profile; its members are not validated` });
    }
    members.push({ member, unit });
  }

  const ctx = buildLimitContext(warband, data, members);
  const variant = faction.variants.find((v) => v.id === warband.variantId);

  // Digital Rulebook p97–98: total cost (models, Battlekit, paid upgrades) must
  // not exceed the Threshold Value for the game being played. A variant that
  // starts with a smaller purse keeps the same shortfall in later games
  // (Papal States: "Threshold Value is reduced by 200", Warbands p35).
  const cost = warbandCost(warband, data);
  let threshold = opts.threshold;
  if (threshold === undefined) {
    const t = thresholdFor(data, warband.gameNumber);
    threshold = t.row.threshold;
    if (t.clamped) warn({ message: `Threshold table ends at game ${t.row.game}; using ${t.row.threshold} for game ${warband.gameNumber}` });
    if (variant?.startingDucats !== undefined) threshold -= thresholdFor(data, 1).row.threshold - variant.startingDucats;
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

  checkUnitCounts(warband, faction.id, data, members, ctx, fail, warn);

  const elites = members.filter((m) => m.unit.elite).length;
  if (elites > MAX_ELITES) {
    fail({ code: "elite-cap", message: `${elites} ELITE models; a warband can never include more than ${MAX_ELITES}` });
  }

  const carriedByItem = new Map<string, { total: number; sample: CarriedItem; memberId: string }>();
  const takenByUpgrade = new Map<string, { total: number; rows: TakenUpgrade[] }>();
  for (const { member, unit } of members) {
    const carried = checkMemberItems(member, unit, data, warband, ctx, fail, warn);
    const taken = checkMemberUpgrades(member, unit, data, warband, ctx, fail, warn);
    checkBattlekit(member, unit, carried, fail, warn);
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

  return done();
}

function sameFactionName(a: string, b: string): boolean {
  const norm = (s: string) => normaliseName(s).replace(/^the/, "").replace(/s$/, "");
  return norm(a) === norm(b);
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
  for (const v of data.factionsById.get(warband.factionId)?.variants ?? []) variants.set(normaliseName(v.name), v.id);

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

  const knownUnits = new Set((data.unitsByFaction.get(warband.factionId) ?? []).map((u) => normaliseName(u.name)));
  const knownItems = new Set(data.equipment.map((e) => normaliseName(e.name)));
  const knownUpgrades = new Set(
    (data.unitsByFaction.get(warband.factionId) ?? []).flatMap((u) => (u.upgrades ?? []).map((g) => normaliseName(g.name))),
  );

  return {
    count(name) {
      const key = normaliseName(name);
      const variantId = variants.get(key);
      if (variantId !== undefined) return warband.variantId === variantId ? 1 : 0;
      let known = false;
      let total = 0;
      if (knownUnits.has(key)) (known = true), (total += unitCounts.get(key) ?? 0);
      if (knownItems.has(key)) (known = true), (total += itemCounts.get(key) ?? 0);
      if (knownUpgrades.has(key)) (known = true), (total += upgradeCounts.get(key) ?? 0);
      return known ? total : undefined;
    },
  };
}

type Gate = { matched: boolean; unresolved: string[] };

/** onlyWith / onlyWithout entries are variant ids or "Name [Catalogue]" strings. Any match satisfies the gate. */
function evalGate(values: string[] | undefined, warband: Warband, data: RulesData, ctx: LimitContext): Gate {
  const gate: Gate = { matched: false, unresolved: [] };
  for (const v of values ?? []) {
    if (data.variantsById.has(v)) {
      if (warband.variantId === v) gate.matched = true;
      continue;
    }
    const count = ctx.count(v);
    if (count === undefined) gate.unresolved.push(v);
    else if (count > 0) gate.matched = true;
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
): void {
  if (onlyWith && onlyWith.length > 0) {
    const gate = evalGate(onlyWith, warband, data, ctx);
    if (!gate.matched) {
      if (gate.unresolved.length > 0) {
        warn({ ...where, message: `${subject} requires one of ${gate.unresolved.map((u) => `"${u}"`).join(", ")}, which the data does not model` });
      } else {
        fail({ ...where, code: codes.locked, message: `${subject} is only available with ${onlyWith.join(" or ")}` });
      }
    }
  }
  if (onlyWithout && onlyWithout.length > 0) {
    const gate = evalGate(onlyWithout, warband, data, ctx);
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
  factionId: string,
  data: RulesData,
  members: ResolvedMember[],
  ctx: LimitContext,
  fail: (e: RosterError) => void,
  warn: (w: Omit<RosterWarning, "code">) => void,
): void {
  const counts = new Map<string, number>();
  for (const { unit } of members) counts.set(unit.id, (counts.get(unit.id) ?? 0) + 1);

  for (const unit of data.unitsByFaction.get(factionId) ?? []) {
    const count = counts.get(unit.id) ?? 0;
    const where = { unitId: unit.id };

    if (count > 0) {
      checkGates(unit.name, unit.onlyWith, unit.onlyWithout, warband, data, ctx, { locked: "variant-locked", excluded: "variant-excluded" }, where, fail, warn);
    }

    const max = unitLimit(unit, "max", ctx);
    const cap = [max.value, unit.maxPerWarband ?? null].filter((n): n is number => n !== null);
    const effectiveMax = cap.length ? Math.min(...cap) : null;
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
    checkGates(item.name, access.onlyWith, access.onlyWithout, warband, data, ctx, { locked: "item-variant-locked", excluded: "item-variant-locked" }, where, fail, warn);

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
    checkGates(upgrade.name, upgrade.onlyWith, upgrade.onlyWithout, warband, data, ctx, { locked: "upgrade-variant-locked", excluded: "upgrade-variant-locked" }, where, fail, warn);
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

interface TwoHanded {
  name: string;
  combo: boolean;
}

// Digital Rulebook p69 "Battlekit Limits" and "Shields"; HELD p55, HEAVY p55,
// STRONG p57; Headgear and Bayonet Lugs from Warbands of Trench Crusade p11.
function checkBattlekit(
  member: WarbandMember,
  unit: RosterUnit,
  carried: CarriedItem[],
  fail: (e: RosterError) => void,
  warn: (w: Omit<RosterWarning, "code">) => void,
): void {
  const where = { memberId: member.id, unitId: unit.id };
  const strong = hasKeyword(unit.keywords, /^strong$/i);
  const negateHeavy = strong || hasKeyword(unit.keywords, /^negate heavy$/i);

  let shields = 0;
  let armour = 0;
  let headgear = 0;
  let heavy = 0;
  let heldHands = 0;
  let ranged1 = 0;
  let melee1 = 0;
  const ranged2: TwoHanded[] = [];
  const melee2: TwoHanded[] = [];
  const grenadeTypes: string[] = [];
  const rangedNames: string[] = [];
  const bayonets: CarriedItem[] = [];

  for (const { item, access, count } of carried) {
    const combo = SHIELD_COMBO_GROUPS.has(access.group);
    if (hasKeyword(item.keywords, /^heavy(\s|$)/i)) heavy += count;
    if (access.group === "headgear") headgear += count;
    if (access.group === "bayonet") bayonets.push({ item, access, count, itemId: item.id });

    switch (item.category) {
      case "shield":
        shields += count;
        break;
      case "armour":
        armour += count;
        break;
      case "grenade":
        grenadeTypes.push(item.name);
        break;
      case "ranged":
        rangedNames.push(item.name);
        if (item.hands === 2) for (let i = 0; i < count; i++) ranged2.push({ name: item.name, combo });
        else if (item.hands === 1) ranged1 += count;
        break;
      case "melee":
        if (item.hands === 2) for (let i = 0; i < count; i++) melee2.push({ name: item.name, combo });
        else if (item.hands === 1) melee1 += count;
        break;
      default:
        if (hasKeyword(item.keywords, /^held$/i)) heldHands += count;
        else if (item.hands) heldHands += item.hands * count;
        if (item.category === "equipment" && count > 1) {
          fail({ ...where, code: "battlekit-duplicate", itemId: item.id, message: `${item.name} taken ${count} times; one piece of Equipment with the same name per model` });
        }
    }
  }

  // STRONG: one 2-Handed Melee Weapon is used as if 1-Handed (p57). Spend it
  // on a weapon without Shield Combo first, since that is the one a shield blocks.
  if (strong && melee2.length > 0) {
    const idx = Math.max(0, melee2.findIndex((w) => !w.combo));
    melee2.splice(idx, 1);
    melee1 += 1;
  }

  const slotViolation = (two: number, one: number) => two > 1 || (two === 1 && one > 0) || one > 2;
  if (slotViolation(ranged2.length, ranged1)) {
    fail({ ...where, code: "battlekit-ranged", message: `${unit.name}: one 2-Handed or two 1-Handed Ranged Weapons (has ${ranged2.length} x 2H, ${ranged1} x 1H)` });
  }
  if (slotViolation(melee2.length, melee1)) {
    fail({ ...where, code: "battlekit-melee", message: `${unit.name}: one 2-Handed or two 1-Handed Melee Weapons (has ${melee2.length} x 2H, ${melee1} x 1H)` });
  }
  if (grenadeTypes.length > 1) {
    fail({ ...where, code: "battlekit-grenade", message: `${unit.name}: one type of Grenade (has ${grenadeTypes.join(", ")})` });
  }
  if (armour > 1) fail({ ...where, code: "battlekit-armour", message: `${unit.name}: one suit of Armour (has ${armour})` });
  if (shields > 1) fail({ ...where, code: "battlekit-shield", message: `${unit.name}: one Shield (has ${shields})` });
  if (headgear > 1) fail({ ...where, code: "battlekit-headgear", message: `${unit.name}: one piece of Headgear (has ${headgear})` });
  if (heavy > 1 && !negateHeavy) {
    fail({ ...where, code: "battlekit-heavy", message: `${unit.name}: one piece of HEAVY Battlekit unless STRONG (has ${heavy})` });
  }

  const occupied = shields + heldHands;
  const weapons = ranged1 + melee1 + ranged2.length + melee2.length;
  if (occupied > 2) {
    fail({ ...where, code: "battlekit-hands", message: `${unit.name}: Shields and HELD Battlekit need ${occupied} hands; a model has two` });
  } else if (occupied > 0) {
    if (heldHands > 0 && shields > 0 && weapons > 0) {
      fail({ ...where, code: "battlekit-hands", message: `${unit.name}: a model with HELD Battlekit cannot carry both a Weapon and a Shield` });
    } else if (occupied >= 2 && weapons > 0) {
      fail({ ...where, code: "battlekit-hands", message: `${unit.name}: both hands are taken by Shields/HELD Battlekit; no Weapons can be carried` });
    } else {
      if (ranged1 > 1 || melee1 > 1) {
        fail({ ...where, code: "battlekit-hands", message: `${unit.name}: with a Shield or HELD Battlekit, at most one 1-Handed Melee and one 1-Handed Ranged Weapon` });
      }
      for (const w of [...ranged2, ...melee2]) {
        if (shields > 0 && heldHands === 0 && w.combo) {
          warn({ ...where, message: `${w.name} with a Shield relies on Shield Combo; the Shield's own stipulation is not encoded in the data, so it is assumed` });
        } else {
          fail({ ...where, code: "battlekit-hands", message: `${unit.name}: ${w.name} is 2-Handed and cannot be carried with a Shield or HELD Battlekit${w.combo ? "" : " (no Shield Combo)"}` });
        }
      }
    }
  }

  for (const b of bayonets) {
    const lugs = (b.access.attachesTo ?? []).map(normaliseName);
    if (!rangedNames.some((n) => lugs.includes(normaliseName(n)))) {
      fail({ ...where, code: "bayonet-lug", itemId: b.item.id, message: `${b.item.name} needs a Ranged Weapon with a Bayonet Lug (${(b.access.attachesTo ?? []).join(", ")})` });
    }
  }
}
