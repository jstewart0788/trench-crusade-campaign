import { findUnit, upgradeFor, type RosterUnit, type RulesData } from "./data.js";
import { isEliteMember } from "./grants.js";
import { unitDisplayName } from "./presentation.js";
import type { Fireteam, Warband, WarbandMember } from "./roster.js";
import { appliesUnder, type FireteamRule } from "./unit-rules.js";

// Fireteams (FIRETEAM, Warbands p17): two models that activate together, on
// the roster sheet. unit-rules.json fireteamRules say which lists may form them,
// how many, and who may be in one. A team is two member ids under one rule.

export type FireteamProblemCode = "fireteam-invalid" | "fireteam-limit" | "fireteam-partner";

export interface FireteamProblem {
  code: FireteamProblemCode;
  memberId?: string;
  message: string;
}

/** The rules this roster may form teams under, each with its team allowance (undefined: one per anchor). */
export function fireteamRules(data: RulesData, warband: Pick<Warband, "factionId" | "subfactionId" | "variantId">): { rule: FireteamRule; max: number | undefined }[] {
  return data.unitRules.file.fireteamRules
    .filter((r) => appliesUnder(r.under, warband))
    .map((rule) => {
      let max = rule.max;
      for (const m of rule.maxUnder ?? []) if (appliesUnder(m.under, warband)) max = m.max;
      return { rule, max };
    });
}

const resolve = (data: RulesData, warband: Warband, id: string) => {
  const member = warband.members.find((m) => m.id === id);
  const unit = member ? findUnit(data, warband, member.unitId) : undefined;
  return member && unit ? { member, unit } : undefined;
};

const hasUpgrade = (unit: RosterUnit, member: WarbandMember, name: string) => (member.upgradeIds ?? []).some((id) => upgradeFor(unit, id)?.name === name);

/** True when the model can be the team's anchor under this rule (a Mamluk Faris; a Takwin Homunculus with Enslaved Mind). */
export function isAnchor(rule: FireteamRule, member: WarbandMember, unit: RosterUnit): boolean {
  const a = rule.anchor;
  if (!a) return false;
  if (a.unitIds && !a.unitIds.includes(unit.id)) return false;
  if (a.upgrade && !hasUpgrade(unit, member, a.upgrade)) return false;
  return true;
}

/** Why this model cannot be an anchored team's other member, if it cannot (the Faris's partner must be ELITE, p179). */
function partnerProblem(data: RulesData, warband: Warband, rule: FireteamRule, member: WarbandMember, unit: RosterUnit): string | undefined {
  const p = rule.partner;
  if (p?.elite && !isEliteMember(member, unit, data, warband)) return "must have the ELITE Keyword";
  if (p?.carriesItem && !member.equipmentItemIds.includes(p.carriesItem)) return `must carry the ${data.equipmentById.get(p.carriesItem)?.name ?? p.carriesItem}`;
  return undefined;
}

/** Why these two members cannot form a team under this rule, or undefined when they can (other teams on the roster aside). */
export function pairProblem(data: RulesData, warband: Warband, rule: FireteamRule, ids: readonly string[]): string | undefined {
  if (ids.length !== 2 || ids[0] === ids[1]) return "a Fireteam is two different models";
  const a = resolve(data, warband, ids[0]!);
  const b = resolve(data, warband, ids[1]!);
  if (!a || !b) return "a Fireteam's models must both be on the roster";
  if (!rule.anchor) return undefined;
  const [anchor, other] = isAnchor(rule, a.member, a.unit) ? [a, b] : isAnchor(rule, b.member, b.unit) ? [b, a] : [undefined, undefined];
  if (!anchor || !other) return `one of the two must be ${rule.anchor.upgrade ? `a model with ${rule.anchor.upgrade}` : rule.anchor.unitIds!.map((id) => data.unitsById.get(id)?.name ?? id).filter((n, i, all) => all.indexOf(n) === i).join(" or ")}`;
  const why = partnerProblem(data, warband, rule, other.member, other.unit);
  return why ? `${unitDisplayName(data, warband, other.unit, other.member)} ${why}` : undefined;
}

/** The team a member is in, and its partner's id. */
export function teamOf(warband: Pick<Warband, "fireteams">, memberId: string): { team: Fireteam; partnerId: string } | undefined {
  const team = (warband.fireteams ?? []).find((t) => t.memberIds.includes(memberId));
  return team ? { team, partnerId: team.memberIds.find((id) => id !== memberId)! } : undefined;
}

/** Everything wrong with the roster's Fireteams. */
export function fireteamProblems(data: RulesData, warband: Warband): FireteamProblem[] {
  const out: FireteamProblem[] = [];
  const rules = new Map(fireteamRules(data, warband).map((r) => [r.rule.id, r]));
  const seen = new Set<string>();
  const used = new Map<string, number>();
  for (const team of warband.fireteams ?? []) {
    const allowed = rules.get(team.rule);
    const rule = allowed?.rule ?? data.unitRules.file.fireteamRules.find((r) => r.id === team.rule);
    const first = team.memberIds[0];
    if (!allowed) {
      out.push({ code: "fireteam-invalid", memberId: first, message: rule ? `${rule.name}: this list cannot form that Fireteam (p${rule.page})` : `Unknown Fireteam rule "${team.rule}"` });
      continue;
    }
    for (const id of team.memberIds) {
      if (seen.has(id)) out.push({ code: "fireteam-invalid", memberId: id, message: "A model cannot be in more than 1 Fireteam (p17)" });
      seen.add(id);
    }
    const why = pairProblem(data, warband, allowed.rule, team.memberIds);
    if (why) out.push({ code: why.startsWith("a Fireteam") ? "fireteam-invalid" : "fireteam-partner", memberId: first, message: `${allowed.rule.name}: ${why} (p${allowed.rule.page})` });
    used.set(team.rule, (used.get(team.rule) ?? 0) + 1);
  }
  for (const [id, n] of used) {
    const { rule, max } = rules.get(id)!;
    if (max !== undefined && n > max) out.push({ code: "fireteam-limit", message: `${rule.name}: up to ${max} Fireteam${max === 1 ? "" : "s"}, not ${n} (p${rule.page})` });
  }
  return out;
}

export interface FireteamOffer {
  rule: FireteamRule;
  /** Teams this rule may still add: undefined when it is one per anchor. */
  room: number | undefined;
  /** Pairs of member ids that may form a team now, each pair once. */
  pairs: [string, string][];
}

/** The teams the roster may form now, per rule: members not in a team yet, paired as the rule allows. */
export function fireteamOffers(data: RulesData, warband: Warband): FireteamOffer[] {
  const free = warband.members.filter((m) => !teamOf(warband, m.id));
  return fireteamRules(data, warband).flatMap(({ rule, max }) => {
    const taken = (warband.fireteams ?? []).filter((t) => t.rule === rule.id).length;
    const room = max === undefined ? undefined : max - taken;
    if (room !== undefined && room <= 0) return [];
    const pairs: [string, string][] = [];
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) if (!pairProblem(data, warband, rule, [free[i]!.id, free[j]!.id])) pairs.push([free[i]!.id, free[j]!.id]);
    return pairs.length ? [{ rule, room, pairs }] : [];
  });
}

/** The roster without teams whose members are gone (a dismissed model frees its partner, Digital Rulebook p124). */
export function pruneFireteams<W extends Pick<Warband, "fireteams" | "members">>(warband: W): W {
  if (!warband.fireteams) return warband;
  const ids = new Set(warband.members.map((m) => m.id));
  const kept = warband.fireteams.filter((t) => t.memberIds.every((id) => ids.has(id)));
  if (kept.length === warband.fireteams.length) return warband;
  if (kept.length) return { ...warband, fireteams: kept };
  const { fireteams: _gone, ...rest } = warband;
  return rest as W;
}
