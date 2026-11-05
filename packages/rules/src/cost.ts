import { accessFor, findUnit, upgradeFor, type RosterScope, type RosterUnit, type RulesData, type Upgrade } from "./data.js";
import type { Warband, WarbandMember } from "./roster.js";
import type { Cost } from "./schema.js";
import { appliesUnder, type FreeAtCreation, type VariantPrice } from "./unit-rules.js";

export interface LineCost {
  id: string;
  ducats: number;
  glory: number;
}

export interface MemberCost {
  memberId: string;
  unitId: string;
  unit: LineCost;
  items: LineCost[];
  upgrades: LineCost[];
  ducats: number;
  glory: number;
}

export interface WarbandCost {
  ducats: number;
  glory: number;
  perMember: MemberCost[];
}

/**
 * What prices depend on beyond the roster list: the variant (variantPrices,
 * unit-rules.json), the game (freeAtCreation) and the members already on the
 * roster (a price for "the first" one). A Warband is one; a bare RosterScope
 * gets the list's base prices.
 */
export interface PriceScope extends RosterScope {
  variantId?: string | undefined;
  gameNumber?: number | undefined;
  members?: readonly WarbandMember[] | undefined;
}

const ZERO: LineCost = { id: "", ducats: 0, glory: 0 };

function line(id: string, cost: Cost | undefined): LineCost {
  return { id, ducats: cost?.ducats ?? 0, glory: cost?.glory ?? 0 };
}

/** The variant price that applies to a target, if any; the last matching entry in the file wins. */
function variantPrice(data: RulesData, scope: PriceScope, kind: VariantPrice["kind"], target: string, unitId: string, ordinal: number): VariantPrice | undefined {
  let found: VariantPrice | undefined;
  for (const rule of data.unitRules.file.variantPrices) {
    if (rule.kind !== kind || !rule.targets.includes(target) || !appliesUnder(rule.under, scope)) continue;
    if (rule.unitIds && !rule.unitIds.includes(unitId)) continue;
    if (rule.first !== undefined && ordinal > rule.first) continue;
    found = rule;
  }
  return found;
}

function freeAtCreation(data: RulesData, scope: PriceScope, itemId: string): FreeAtCreation | undefined {
  if (scope.gameNumber !== 1) return undefined;
  return data.unitRules.file.freeAtCreation.find((r) => r.itemId === itemId && appliesUnder(r.under, scope));
}

/** 1-based position of a thing among the roster's copies of it, members in roster order; one past the last for something not on the roster yet. */
function ordinalOf(members: readonly WarbandMember[] | undefined, count: (m: WarbandMember) => number, memberId?: string, within = 0): number {
  let n = 0;
  for (const m of members ?? []) {
    if (m.id === memberId) return n + within + 1;
    n += count(m);
  }
  return n + within + 1;
}

/** The unit's price under this roster; `ordinal` is which copy of the unit it is (default: the next one recruited). */
export function unitCost(data: RulesData, scope: PriceScope, unit: RosterUnit, ordinal?: number): LineCost {
  const n = ordinal ?? ordinalOf(scope.members, (m) => (findUnit(data, scope, m.unitId)?.id === unit.id ? 1 : 0));
  const rule = variantPrice(data, scope, "unit", unit.id, unit.id, n);
  return line(unit.id, rule?.cost ?? unit.cost);
}

/**
 * Price of one item for one member: the faction's armoury price on the
 * unit's equipmentAccess row, falling back to the library price. Rows marked
 * `fixed`, and rows in a mercenary's `loadout` group (Warbands p172: the kit
 * they arrive with), are built-in and never charged unless the row prices them.
 * A variant price replaces either, and an item free at creation costs nothing
 * for its first copy at game 1. `ordinal` is the warband-wide copy (default:
 * the next one bought). Unknown units or items cost nothing here; validateWarband
 * reports them.
 */
export function itemCost(data: RulesData, scope: PriceScope, unitId: string, itemId: string, ordinal?: number): LineCost {
  const unit = findUnit(data, scope, unitId);
  const n = ordinal ?? ordinalOf(scope.members, (m) => m.equipmentItemIds.filter((id) => id === itemId).length);
  if (freeAtCreation(data, scope, itemId) && n === 1) return { ...ZERO, id: itemId };
  const rule = unit ? variantPrice(data, scope, "item", itemId, unit.id, n) : undefined;
  if (rule) return line(itemId, rule.cost);
  const access = unit ? accessFor(unit, itemId) : undefined;
  if (access?.cost) return line(itemId, access.cost);
  if (access?.fixed || access?.replaceableDefault || access?.group === "loadout") return { ...ZERO, id: itemId };
  return line(itemId, data.equipmentById.get(itemId)?.cost);
}

/** An upgrade's price under this roster; `ordinal` counts the roster's upgrades of that name (default: the next one taken). */
export function upgradeCost(data: RulesData, scope: PriceScope, unit: RosterUnit, upgrade: Upgrade, ordinal?: number): LineCost {
  const n = ordinal ?? ordinalOf(scope.members, (m) => upgradesNamed(data, scope, m, upgrade.name));
  const rule = variantPrice(data, scope, "upgrade", upgrade.name, unit.id, n);
  return line(upgrade.bsId, rule?.cost ?? upgrade.cost);
}

function upgradesNamed(data: RulesData, scope: PriceScope, m: WarbandMember, name: string): number {
  const unit = findUnit(data, scope, m.unitId);
  return unit ? (m.upgradeIds ?? []).filter((id) => upgradeFor(unit, id)?.name === name).length : 0;
}

/** The warband-wide Limit a variant sets on an item for this unit (Methodius Machine Gun: Limit 2), when one does. */
export function variantItemLimit(data: RulesData, scope: PriceScope, unitId: string, itemId: string): VariantPrice | undefined {
  const rule = variantPrice(data, scope, "item", itemId, unitId, 1);
  return rule?.limit !== undefined ? rule : undefined;
}

/** A member's price. A member that is not on scope.members is priced as the next one recruited (a copy, a recruit on the shelf). */
export function memberCost(data: RulesData, scope: PriceScope, member: WarbandMember): MemberCost {
  const unit = findUnit(data, scope, member.unitId);
  const unitLine = unit
    ? unitCost(data, scope, unit, ordinalOf(scope.members, (m) => (findUnit(data, scope, m.unitId)?.id === unit.id ? 1 : 0), member.id))
    : line(member.unitId, undefined);
  const seen = new Map<string, number>();
  const items = member.equipmentItemIds.map((itemId) => {
    const within = seen.get(itemId) ?? 0;
    seen.set(itemId, within + 1);
    return itemCost(data, scope, member.unitId, itemId, ordinalOf(scope.members, (m) => m.equipmentItemIds.filter((id) => id === itemId).length, member.id, within));
  });
  const named = new Map<string, number>();
  const upgrades = (member.upgradeIds ?? []).map((id) => {
    const upgrade = unit ? upgradeFor(unit, id) : undefined;
    if (!unit || !upgrade) return line(id, undefined);
    const within = named.get(upgrade.name) ?? 0;
    named.set(upgrade.name, within + 1);
    return { ...upgradeCost(data, scope, unit, upgrade, ordinalOf(scope.members, (m) => upgradesNamed(data, scope, m, upgrade.name), member.id, within)), id };
  });
  const all = [unitLine, ...items, ...upgrades];
  return {
    memberId: member.id,
    unitId: member.unitId,
    unit: unitLine,
    items,
    upgrades,
    ducats: all.reduce((n, l) => n + l.ducats, 0),
    glory: all.reduce((n, l) => n + l.glory, 0),
  };
}

export function warbandCost(warband: Warband, data: RulesData): WarbandCost {
  const perMember = warband.members.map((m) => memberCost(data, warband, m));
  return {
    ducats: perMember.reduce((n, m) => n + m.ducats, 0),
    glory: perMember.reduce((n, m) => n + m.glory, 0),
    perMember,
  };
}
