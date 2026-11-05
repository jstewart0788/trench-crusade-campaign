import { memberCost, toWarbandExport, validateWarband, type ExportEquipment, type ExportMember, type MemberCost, type RulesData, type Warband } from "@tc/rules/browser";
import type { Money } from "./purse.js";

/** What the Warband screen shows when a member row is expanded. */
export interface MemberDetail {
  /** The member exactly as the TTS mod is served it (toWarbandExport), so the screen and the table cannot disagree. */
  member: ExportMember;
  cost: MemberCost;
  issues: { kind: "error" | "warning"; message: string }[];
}

export type Details = { byId: Map<string, MemberDetail> } | { error: string };

export function memberDetails(warband: Warband, rules: RulesData, code: string): Details {
  let members: ExportMember[];
  try {
    members = toWarbandExport(warband, rules, { code, now: new Date(0) }).members;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const validation = validateWarband(warband, rules);
  const byId = new Map<string, MemberDetail>();
  for (const member of members) {
    const roster = warband.members.find((m) => m.id === member.id)!;
    byId.set(member.id, {
      member,
      cost: memberCost(rules, warband, roster),
      issues: [
        ...validation.errors.filter((e) => e.memberId === member.id).map((e) => ({ kind: "error" as const, message: e.message })),
        ...validation.warnings.filter((w) => w.memberId === member.id).map((w) => ({ kind: "warning" as const, message: w.message })),
      ],
    });
  }
  return { byId };
}

/** Kit printed on the unit card rather than bought or fixed in the armoury. */
export const isCardKit = (e: Pick<ExportEquipment, "id">) => e.id.startsWith("profile/");

export interface CostLine {
  label: string;
  cost: Money;
  builtIn: boolean;
}

/** The model's price as a ledger: the unit, each roster item, each upgrade; the lines add up to `total`. */
export function costLines({ member, cost }: MemberDetail): { lines: CostLine[]; total: Money } {
  return {
    lines: [
      { label: member.unit.name, cost: { ducats: cost.unit.ducats, glory: cost.unit.glory }, builtIn: false },
      ...member.equipment.filter((e) => !isCardKit(e)).map((e) => ({ label: e.name, cost: e.cost, builtIn: e.builtIn === true })),
      ...member.upgrades.map((u) => ({ label: u.name, cost: u.cost, builtIn: false })),
    ],
    total: { ducats: cost.ducats, glory: cost.glory },
  };
}

/** Armour as the rulebook writes it: "−1", "0", "+1". */
export const signedArmour = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
