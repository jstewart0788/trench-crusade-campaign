import { upgradeFor, type RosterScope, type RosterUnit, type RulesData } from "./data.js";
import type { WarbandMember } from "./roster.js";
import { appliesUnder, dataKeyword } from "./unit-rules.js";

// unit-rules.json variantRenames and variantKeywords: how a unit is named and
// which keywords it has under the roster's list. Ids never change, so model
// picks and saved rosters are unaffected; only what is shown and checked is.

/** A roster's list, as far as presentation needs it. */
export interface ListScope extends RosterScope {
  variantId?: string | undefined;
}

const hasUpgrade = (unit: RosterUnit, member: WarbandMember | undefined, name: string) =>
  (member?.upgradeIds ?? []).some((id) => upgradeFor(unit, id)?.name === name);

/**
 * The name the book gives the unit under this list (Silahdar for the Yüzbaşı in
 * the Defenders of the Iron Wall, p99). Renames that need an upgrade apply only
 * when a member is given and has it; the last matching rule in the file wins.
 */
export function unitDisplayName(data: RulesData, scope: ListScope, unit: RosterUnit, member?: WarbandMember): string {
  let name = unit.name;
  for (const rule of data.unitRules.file.variantRenames) {
    if (!rule.unitIds.includes(unit.id) || !appliesUnder(rule.under, scope)) continue;
    if (rule.withUpgrade && !hasUpgrade(unit, member, rule.withUpgrade)) continue;
    name = rule.name;
  }
  return name;
}

/** The unit's keywords under this list: its own, less any a variant removes, plus any it adds (some only with an upgrade the member has), in the data's spelling. */
export function listKeywords(data: RulesData, scope: ListScope, unit: RosterUnit, member?: WarbandMember): string[] {
  let keywords = [...unit.keywords];
  for (const rule of data.unitRules.file.variantKeywords) {
    if (!appliesUnder(rule.under, scope)) continue;
    if (rule.withUpgrade && !hasUpgrade(unit, member, rule.withUpgrade)) continue;
    if (rule.unitIds ? !rule.unitIds.includes(unit.id) : unit.mercenary || unit.kind === "fireteam") continue;
    const drop = new Set((rule.remove ?? []).map((k) => k.trim().toLowerCase()));
    keywords = keywords.filter((k) => !drop.has(k.toLowerCase()));
    for (const k of rule.add ?? []) if (!keywords.some((have) => have.toLowerCase() === k.trim().toLowerCase())) keywords.push(dataKeyword(k));
  }
  return keywords;
}

/** The unit as this list presents it: its name there and its keywords there (for screens and for battlekit checks such as STRONG). */
export function presentedUnit(data: RulesData, scope: ListScope, unit: RosterUnit, member?: WarbandMember): RosterUnit {
  return { ...unit, name: unitDisplayName(data, scope, unit, member), keywords: listKeywords(data, scope, unit, member) };
}

/** Names a roster selection may use for a unit of this list: its own and every name a variant of the list gives it. */
export function unitNamesInList(data: RulesData, unit: RosterUnit): string[] {
  const names = [unit.name];
  for (const rule of data.unitRules.file.variantRenames) if (rule.unitIds.includes(unit.id) && !rule.withUpgrade) names.push(rule.name);
  return names;
}
