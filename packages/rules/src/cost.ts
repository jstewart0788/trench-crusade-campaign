import { accessFor, findUnit, upgradeFor, type RulesData } from "./load.js";
import type { Warband, WarbandMember } from "./roster.js";
import type { Cost } from "./schema.js";

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

const ZERO: LineCost = { id: "", ducats: 0, glory: 0 };

function line(id: string, cost: Cost | undefined): LineCost {
  return { id, ducats: cost?.ducats ?? 0, glory: cost?.glory ?? 0 };
}

/**
 * Price of one item for one member: the faction's armoury price on the
 * unit's equipmentAccess row, falling back to the library price. Rows marked
 * `fixed` are built-in kit and never charged unless the row prices them.
 * Unknown units or items cost nothing here; validateWarband reports them.
 */
export function itemCost(data: RulesData, factionId: string, unitId: string, itemId: string): LineCost {
  const unit = findUnit(data, factionId, unitId);
  const access = unit ? accessFor(unit, itemId) : undefined;
  if (access?.cost) return line(itemId, access.cost);
  if (access?.fixed) return { ...ZERO, id: itemId };
  return line(itemId, data.equipmentById.get(itemId)?.cost);
}

export function memberCost(data: RulesData, factionId: string, member: WarbandMember): MemberCost {
  const unit = findUnit(data, factionId, member.unitId);
  const unitLine = line(member.unitId, unit?.cost);
  const items = member.equipmentItemIds.map((itemId) => itemCost(data, factionId, member.unitId, itemId));
  const upgrades = (member.upgradeIds ?? []).map((id) => line(id, unit ? upgradeFor(unit, id)?.cost : undefined));
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
  const perMember = warband.members.map((m) => memberCost(data, warband.factionId, m));
  return {
    ducats: perMember.reduce((n, m) => n + m.ducats, 0),
    glory: perMember.reduce((n, m) => n + m.glory, 0),
    perMember,
  };
}
