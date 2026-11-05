import { findUnit, upgradeFor, type RosterUnit, type RulesData } from "./data.js";
import type { Warband, WarbandMember } from "./roster.js";
import { effectKeywords } from "./effects.js";
import { listKeywords, type ListScope } from "./presentation.js";
import { appliesUnder, dataKeyword, type FreeKeywordGrant, type PurseAdjustment } from "./unit-rules.js";

// unit-rules.json freeKeywordGrants and purseAdjustments: what a roster's
// toggles grant its members, and what a list gains at campaign events.

/** The grant rules whose toggle (a `grant` upgrade) the member has taken. */
export function memberGrants(member: WarbandMember, unit: RosterUnit, data: RulesData): FreeKeywordGrant[] {
  const ids = new Set((member.upgradeIds ?? []).map((id) => upgradeFor(unit, id)?.grant).filter((g): g is string => g !== undefined));
  return [...ids].map((id) => data.unitRules.grantsById.get(id)).filter((g): g is FreeKeywordGrant => g !== undefined);
}

/** The member's keywords: the unit's under the list (variantKeywords, when a scope is given), then any granted, in the data's spelling. */
export function memberKeywords(member: WarbandMember, unit: RosterUnit, data: RulesData, scope?: ListScope): string[] {
  const keywords = scope ? listKeywords(data, scope, unit, member) : [...unit.keywords];
  for (const kw of [...effectKeywords(data, unit, member), ...memberGrants(member, unit, data).map((g) => g.keyword)]) {
    const k = dataKeyword(kw);
    if (!keywords.some((have) => have.toLowerCase() === k.toLowerCase())) keywords.push(k);
  }
  return keywords;
}

/** ELITE by its entry, its list or a grant (Janissary Officers); Warbands p10 caps them all alike. */
export function isEliteMember(member: WarbandMember, unit: RosterUnit, data: RulesData, scope?: ListScope): boolean {
  if (unit.elite) return true;
  return memberKeywords(member, unit, data, scope).some((k) => k.toLowerCase() === "elite");
}

export interface GrantPoolState {
  unitIds?: string[] | undefined;
  max: number;
  /** Members counted against this pool, in roster order. */
  memberIds: string[];
}

export interface GrantState {
  rule: FreeKeywordGrant;
  pools: GrantPoolState[];
  /** Members that took the grant but fit no pool with room. */
  over: string[];
}

const fits = (pool: { unitIds?: string[] | undefined }, unitId: string) => !pool.unitIds || pool.unitIds.includes(unitId);

/**
 * Each grant's takers shared out over its pools, narrowest pools first as the
 * file lists them (Swiss Guard: the Lieutenant, then up to 4 others).
 */
export function grantStates(warband: Warband, data: RulesData): GrantState[] {
  return data.unitRules.file.freeKeywordGrants.map((rule) => {
    const takers: { id: string; unitId: string }[] = [];
    for (const m of warband.members) {
      const unit = findUnit(data, warband, m.unitId);
      if (unit && memberGrants(m, unit, data).includes(rule)) takers.push({ id: m.id, unitId: unit.id });
    }
    const pools: GrantPoolState[] = rule.pools.map((p) => ({ unitIds: p.unitIds, max: p.max, memberIds: [] }));
    const over: string[] = [];
    for (const t of takers) {
      const pool = pools.find((p) => fits(p, t.unitId) && p.memberIds.length < p.max);
      if (pool) pool.memberIds.push(t.id);
      else over.push(t.id);
    }
    return { rule, pools, over };
  });
}

/** How many of a grant a unit's models can still draw on: takers and room across the pools that admit the unit. */
export function grantRoom(state: GrantState, unitId: string): { count: number; max: number } {
  const open = state.pools.filter((p) => fits(p, unitId));
  return { count: open.reduce((n, p) => n + p.memberIds.length, 0), max: open.reduce((n, p) => n + p.max, 0) };
}

/** Ducats and glory the roster's list gains at a campaign event (Papal States: +4 glory per Reinforcements, Warbands p35). */
export function purseAdjustment(warband: Pick<Warband, "factionId" | "subfactionId" | "variantId">, data: RulesData, event: PurseAdjustment["event"]): { ducats: number; glory: number; rules: PurseAdjustment[] } {
  const rules = data.unitRules.file.purseAdjustments.filter((r) => r.event === event && appliesUnder(r.under, warband));
  return { ducats: rules.reduce((n, r) => n + (r.ducats ?? 0), 0), glory: rules.reduce((n, r) => n + (r.glory ?? 0), 0), rules };
}
