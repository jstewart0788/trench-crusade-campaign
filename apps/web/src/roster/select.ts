import {
  evaluateGates,
  findUnit,
  itemCost,
  resolveLimit,
  unitLimits,
  upgradeFor,
  type EquipmentItem,
  type GateRef,
  type GateResult,
  type LimitContext,
  type LineCost,
  type RosterAccess,
  type RosterUnit,
  type RulesData,
  type Upgrade,
  type Warband,
  type WarbandMember,
} from "@tc/rules/browser";

// Read-only views over the roster for the builder's pickers. Every number
// here comes from the same engine calls the validator makes, so what the
// picker shows is what validation will say.

export interface GateView {
  /** Locked out by the warband's variant: not shown at all. */
  hidden: boolean;
  /** Waiting on something else on the roster or this model: shown, not selectable. */
  disabled: boolean;
  notes: string[];
}

export function gateLabel(gate: string, data: RulesData): string {
  const variant = data.variantsById.get(gate);
  if (variant) return variant.name;
  const scoped = /^(item|upgrade):(.+)$/.exec(gate);
  if (scoped) return scoped[1] === "item" ? (data.equipmentById.get(scoped[2]!)?.name ?? scoped[2]!) : scoped[2]!;
  return gate.replace(/\s*\[[^\]]*\]\s*$/, "");
}

export function gateView(result: GateResult, data: RulesData): GateView {
  const labels = (refs: GateRef[], list: GateRef["list"]) => refs.filter((r) => r.list === list).map((r) => gateLabel(r.gate, data));
  const notes: string[] = [];
  const needs = labels(result.unresolved, "onlyWith");
  const notWith = labels(result.unresolved, "onlyWithout");
  if (needs.length) notes.push(`needs ${needs.join(" or ")} — not checked here`);
  if (notWith.length) notes.push(`not with ${notWith.join(", ")} — not checked here`);
  if (result.open) return { hidden: false, disabled: false, notes };
  if (result.blockedBy.every((r) => data.variantsById.has(r.gate))) return { hidden: true, disabled: true, notes };
  const blocked: string[] = [];
  const blockedNeeds = labels(result.blockedBy, "onlyWith");
  const blockedNotWith = labels(result.blockedBy, "onlyWithout");
  if (blockedNeeds.length) blocked.push(`needs ${blockedNeeds.join(" or ")}`);
  if (blockedNotWith.length) blocked.push(`not with ${blockedNotWith.join(", ")}`);
  return { hidden: false, disabled: true, notes: [...blocked, ...notes] };
}

export interface UnitRow {
  unit: RosterUnit;
  count: number;
  min: number | null;
  max: number | null;
  atMax: boolean;
  gate: GateView;
}

export function unitRows(warband: Warband, data: RulesData, ctx: LimitContext): UnitRow[] {
  const counts = new Map<string, number>();
  for (const m of warband.members) {
    const unit = findUnit(data, warband.factionId, m.unitId);
    if (unit) counts.set(unit.id, (counts.get(unit.id) ?? 0) + 1);
  }
  const rows: UnitRow[] = [];
  for (const unit of data.unitsByFaction.get(warband.factionId) ?? []) {
    if (unit.kind === "fireteam") continue;
    const gate = gateView(evaluateGates(unit.onlyWith, unit.onlyWithout, warband, data, ctx), data);
    if (gate.hidden) continue;
    const { min, max } = unitLimits(unit, ctx);
    const count = counts.get(unit.id) ?? 0;
    rows.push({ unit, count, min, max, atMax: max !== null && count >= max, gate });
  }
  return rows;
}

export function limitText(min: number | null, max: number | null): string {
  if (max === null) return min ? `${min}+` : "any";
  if (min === max) return String(max);
  return `${min ?? 0}–${max}`;
}

/** Items the unit arrives with (`fixed` rows); added to a new member automatically. */
export function defaultKit(unit: RosterUnit, warband: Warband, data: RulesData, ctx: LimitContext): string[] {
  return unit.equipmentAccess.filter((a) => a.fixed && evaluateGates(a.onlyWith, a.onlyWithout, warband, data, ctx).open).map((a) => a.itemId);
}

export interface AccessRow {
  access: RosterAccess;
  item: EquipmentItem;
  cost: LineCost;
  count: number;
  max: number | null;
  atMax: boolean;
  gate: GateView;
}

export interface AccessGroup {
  group: string;
  label: string;
  rows: AccessRow[];
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
  upgrades: "Upgrades",
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

export function armouryGroups(member: WarbandMember, unit: RosterUnit, warband: Warband, data: RulesData, ctx: LimitContext): AccessGroup[] {
  const model = { member, unit };
  const byGroup = new Map<string, AccessRow[]>();
  for (const access of unit.equipmentAccess) {
    const item = data.equipmentById.get(access.itemId);
    if (!item) continue;
    const gate = gateView(evaluateGates(access.onlyWith, access.onlyWithout, warband, data, ctx, model), data);
    if (gate.hidden) continue;
    const count = member.equipmentItemIds.filter((id) => id === access.itemId).length;
    const max = resolveLimit(access.limitsText ?? item.limits ?? undefined, "max", "model", access.max ?? null, ctx, item.name).value;
    const row: AccessRow = {
      access,
      item,
      cost: itemCost(data, warband.factionId, member.unitId, access.itemId),
      count,
      max,
      atMax: max !== null && count >= max,
      gate,
    };
    const rows = byGroup.get(access.group) ?? [];
    rows.push(row);
    byGroup.set(access.group, rows);
  }
  return [...byGroup]
    .map(([group, rows]) => ({ group, label: groupLabel(group), rows }))
    .sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.group.localeCompare(b.group));
}

export interface UpgradeRow {
  upgrade: Upgrade;
  cost: LineCost;
  count: number;
  max: number;
  atMax: boolean;
  gate: GateView;
}

export function upgradeRows(member: WarbandMember, unit: RosterUnit, warband: Warband, data: RulesData, ctx: LimitContext): UpgradeRow[] {
  const model = { member, unit };
  const rows: UpgradeRow[] = [];
  for (const upgrade of unit.upgrades ?? []) {
    const gate = gateView(evaluateGates(upgrade.onlyWith, upgrade.onlyWithout, warband, data, ctx, model), data);
    if (gate.hidden) continue;
    const count = (member.upgradeIds ?? []).filter((id) => upgradeFor(unit, id)?.name === upgrade.name).length;
    // Warbands p14: once per model unless the entry says otherwise.
    const max = resolveLimit(upgrade.limitsText, "max", "model", upgrade.max ?? null, ctx, upgrade.name).value ?? 1;
    rows.push({
      upgrade,
      cost: { id: upgrade.bsId, ducats: upgrade.cost?.ducats ?? 0, glory: upgrade.cost?.glory ?? 0 },
      count,
      max,
      atMax: count >= max,
      gate,
    });
  }
  return rows;
}

export function memberLabel(member: WarbandMember, unit: RosterUnit | undefined): string {
  return member.name ?? unit?.name ?? member.unitId;
}

export function priceText(cost: { ducats: number; glory: number }): string {
  const parts: string[] = [];
  if (cost.ducats || !cost.glory) parts.push(`${cost.ducats}d`);
  if (cost.glory) parts.push(`${cost.glory}g`);
  return parts.join(" + ");
}
