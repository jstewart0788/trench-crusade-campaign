import {
  evaluateGates,
  foreignBuyable,
  itemsRuledOut,
  upgradeAllowed,
  lentBy,
  presentedItem,
  findUnit,
  grantRoom,
  grantStates,
  itemCost,
  resolveLimit,
  rosterUnits,
  unitCost,
  unitDisplayName,
  unitLimits,
  upgradeCost,
  upgradeFor,
  type EquipmentItem,
  type GateResult,
  type LimitContext,
  type LineCost,
  type ListScope,
  type RosterAccess,
  type RosterUnit,
  type RulesData,
  type Upgrade,
  type Warband,
  type WarbandMember,
} from "@tc/rules/browser";
import type { Cap } from "./purse.js";

// Read-only views over the roster for the Barracks and the Armoury. Every
// number comes from the engine calls the validator makes, so what a list
// shows is what validation will say.

export type GateStatus = "open" | "closed" | "uncheckable";

/**
 * What a list does with a gated row. Closed rows (wrong variant, something
 * missing from the roster or from this model) are left out. Rows that need a
 * campaign selection the data cannot count (Book of Golems, Remnants of
 * Byzantium…) are left out too and only tallied, so a list can say how many
 * it is not showing. An exclusion the data cannot count is assumed not to
 * apply, which is what the validator assumes.
 */
export function gateStatus(result: GateResult): GateStatus {
  if (!result.open) return "closed";
  if (result.unresolved.some((r) => r.list === "onlyWith")) return "uncheckable";
  return "open";
}

export interface UnitRow {
  unit: RosterUnit;
  /** The unit's name under this roster's variant (Silahdar for the Yüzbaşı in the Defenders, p99). */
  name: string;
  /** The next one's price under this roster (a variant may reprice it, or only its first). */
  cost: LineCost;
  count: number;
  min: number | null;
  max: number | null;
  atMax: boolean;
}

export interface UnitListing {
  rows: UnitRow[];
  /** Units left out because their gate names something the data cannot count. */
  uncheckable: number;
}

export function unitRows(warband: Warband, data: RulesData, ctx: LimitContext): UnitListing {
  const counts = new Map<string, number>();
  for (const m of warband.members) {
    const unit = findUnit(data, warband, m.unitId);
    if (unit) counts.set(unit.id, (counts.get(unit.id) ?? 0) + 1);
  }
  const rows: UnitRow[] = [];
  let uncheckable = 0;
  for (const unit of rosterUnits(data, warband)) {
    if (unit.kind === "fireteam") continue;
    const status = gateStatus(evaluateGates(unit.onlyWith, unit.onlyWithout, warband, data, ctx));
    if (status === "uncheckable") uncheckable += 1;
    if (status !== "open") continue;
    const { min, max } = unitLimits(unit, ctx);
    // A limit that resolves to 0 for this roster (the Sea Hag under the Leviathan Shoal) bars the unit as surely as a gate does.
    if (max === 0) continue;
    const count = counts.get(unit.id) ?? 0;
    rows.push({ unit, name: unitDisplayName(data, warband, unit), cost: unitCost(data, warband, unit), count, min, max, atMax: max !== null && count >= max });
  }
  return { rows, uncheckable };
}

/** The count chip on a recruit row: "1 of 0–2", "×3" when there is no limit, nothing for none of an unlimited unit. */
export function countChip(count: number, min: number | null, max: number | null): string {
  if (max === null && !min) return count > 0 ? `×${count}` : "";
  return `${count} of ${limitText(min, max)}`;
}

export function limitText(min: number | null, max: number | null): string {
  if (max === null) return min ? `${min}+` : "any";
  if (min === max) return String(max);
  return `${min ?? 0}–${max}`;
}

/** Items the unit arrives with (`fixed` rows); added to a new member automatically. */
export function defaultKit(unit: RosterUnit, warband: Warband, data: RulesData, ctx: LimitContext): string[] {
  return unit.equipmentAccess
    .filter((a) => (a.fixed || a.replaceableDefault) && gateStatus(evaluateGates(a.onlyWith, a.onlyWithout, warband, data, ctx)) === "open")
    .map((a) => a.itemId);
}

export interface AccessRow {
  access: RosterAccess;
  item: EquipmentItem;
  cost: LineCost;
  count: number;
  max: number | null;
  atMax: boolean;
}

export interface AccessGroup {
  group: string;
  label: string;
  rows: AccessRow[];
}

export interface HiddenRow {
  access: RosterAccess;
  item: EquipmentItem;
}

export interface ArmouryListing {
  groups: AccessGroup[];
  uncheckable: number;
  /** The rows behind the `uncheckable` count. */
  uncheckableRows: HiddenRow[];
}

const GROUP_LABELS: Record<string, string> = {
  "ranged-one-handed": "Ranged, 1-handed",
  "ranged-two-handed": "Ranged, 2-handed",
  "ranged-weapons": "Ranged",
  bayonet: "Bayonets",
  "melee-one-handed": "Melee, 1-handed",
  "melee-two-handed": "Melee, 2-handed",
  "shield-combo": "Shield combo",
  "shield-combos": "Shield combo",
  shields: "Shields",
  shield: "Shields",
  armour: "Armour",
  headgear: "Headgear",
  grenades: "Grenades",
  equipment: "Equipment",
  "utility-hand": "Utility (held)",
  instruments: "Instruments",
  "special-ammunitions": "Special ammunition",
  loadout: "Loadout",
  direct: "Built in",
  upgrades: "Upgrade items",
  enhancement: "Enhancements",
};
const GROUP_ORDER = Object.keys(GROUP_LABELS);

export function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function groupRank(group: string): number {
  const at = GROUP_ORDER.indexOf(group);
  return at === -1 ? GROUP_ORDER.length : at;
}

export function armouryGroups(member: WarbandMember, unit: RosterUnit, warband: Warband, data: RulesData, ctx: LimitContext): ArmouryListing {
  const model = { member, unit };
  const byGroup = new Map<string, AccessRow[]>();
  const uncheckableRows: HiddenRow[] = [];
  const ruledOut = itemsRuledOut(data, member, unit);
  for (const access of unit.equipmentAccess) {
    const known = data.equipmentById.get(access.itemId);
    if (!known) continue;
    const item = presentedItem(data, warband, known);
    const status = gateStatus(evaluateGates(access.onlyWith, access.onlyWithout, warband, data, ctx, model));
    if (status === "uncheckable") uncheckableRows.push({ access, item });
    if (status !== "open") continue;
    const count = member.equipmentItemIds.filter((id) => id === access.itemId).length;
    // Lent Battlekit (Corrupt Merchants, Weapon Collections) is on the shelf only while it may be bought: at creation, or to replace.
    const lender = lentBy(data, access);
    if (lender && count === 0 && !foreignBuyable(data, warband, lender, access.itemId).ok) continue;
    // An upgrade the model holds may rule an item out (Medicine: no Medi-kit, p94).
    if (count === 0 && ruledOut.has(access.itemId)) continue;
    const max = resolveLimit(access.limitsText ?? item.limits ?? undefined, "max", "model", access.max ?? null, ctx, item.name).value;
    const row: AccessRow = {
      access,
      item,
      cost: itemCost(data, warband, member.unitId, access.itemId),
      count,
      max,
      atMax: max !== null && count >= max,
    };
    const rows = byGroup.get(access.group) ?? [];
    rows.push(row);
    byGroup.set(access.group, rows);
  }
  const groups = [...byGroup]
    .map(([group, rows]) => ({ group, label: groupLabel(group), rows }))
    .sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.group.localeCompare(b.group));
  return { groups, uncheckable: uncheckableRows.length, uncheckableRows };
}

export interface UpgradeRow {
  upgrade: Upgrade;
  cost: LineCost;
  count: number;
  max: number;
  atMax: boolean;
  /** Set when the warband already has as many as it may. */
  cap?: Cap;
}

export interface UpgradeListing {
  rows: UpgradeRow[];
  uncheckable: number;
}

export function upgradeRows(member: WarbandMember, unit: RosterUnit, warband: Warband, data: RulesData, ctx: LimitContext): UpgradeListing {
  const model = { member, unit };
  const rows: UpgradeRow[] = [];
  let uncheckable = 0;
  const grants = grantStates(warband, data);
  for (const upgrade of unit.upgrades ?? []) {
    const status = gateStatus(evaluateGates(upgrade.onlyWith, upgrade.onlyWithout, warband, data, ctx, model));
    if (status === "uncheckable") uncheckable += 1;
    if (status !== "open") continue;
    const count = (member.upgradeIds ?? []).filter((id) => upgradeFor(unit, id)?.name === upgrade.name).length;
    // Not offered until what it needs is held or staged (a Legionnaire before its +1, NR p28); one already taken stays listed so it can be removed.
    if (count === 0 && !upgradeAllowed(data, warband, member, unit, upgrade)) continue;
    // Warbands p14: once per model unless the entry says otherwise.
    const max = resolveLimit(upgrade.limitsText, "max", "model", upgrade.max ?? null, ctx, upgrade.name).value ?? 1;
    const warbandMax = resolveLimit(upgrade.limitsText, "max", "warband", upgrade.maxPerWarband ?? null, ctx, upgrade.name).value;
    const warbandCount = ctx.count(upgrade.name) ?? 0;
    const row: UpgradeRow = {
      upgrade,
      cost: upgradeCost(data, warband, unit, upgrade),
      count,
      max,
      atMax: count >= max,
    };
    // A free-keyword grant is capped by its pools for this unit (Swiss Guard: the Lieutenant, then 4 others), not the upgrade's own text.
    const grant = upgrade.grant ? grants.find((g) => g.rule.id === upgrade.grant) : undefined;
    const room = grant ? grantRoom(grant, unit.id) : { count: warbandCount, max: warbandMax };
    if (count < max && room.max !== null && room.count >= room.max) row.cap = { count: room.count, max: room.max, scope: "warband" };
    rows.push(row);
  }
  return { rows, uncheckable };
}

/** The unit's name as the roster's list gives it, when the rules and the roster are passed; its entry name otherwise. */
function shownName(member: WarbandMember, unit: RosterUnit | undefined, data?: RulesData, scope?: ListScope): string {
  if (!unit) return member.unitId;
  return data && scope ? unitDisplayName(data, scope, unit, member) : unit.name;
}

export function memberLabel(member: WarbandMember, unit: RosterUnit | undefined, data?: RulesData, scope?: ListScope): string {
  return member.name ?? shownName(member, unit, data, scope);
}

/** "Captain Vane (Lieutenant)" when the member is named, else the unit name. */
export function memberTitle(member: WarbandMember, unit: RosterUnit | undefined, data?: RulesData, scope?: ListScope): string {
  const unitName = shownName(member, unit, data, scope);
  return member.name ? `${member.name} (${unitName})` : unitName;
}

export function priceText(cost: { ducats: number; glory: number }): string {
  const parts: string[] = [];
  if (cost.ducats || !cost.glory) parts.push(`${cost.ducats}d`);
  if (cost.glory) parts.push(`${cost.glory}g`);
  return parts.join(" + ");
}

export function hiddenText(n: number): string {
  return `${n} ${n === 1 ? "option" : "options"} hidden by campaign rules we can't check yet`;
}
