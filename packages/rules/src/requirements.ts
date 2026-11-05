import { upgradeFor, type RosterUnit, type RulesData, type Upgrade } from "./data.js";
import { memberKeywords } from "./grants.js";
import type { ListScope } from "./presentation.js";
import type { WarbandMember } from "./roster.js";
import type { UpgradeRequirement } from "./unit-rules.js";

// unit-rules.json upgradeRequirements: what an upgrade needs or rules out on
// the same model. A dependent upgrade whose prerequisite is removed stays and
// is reported, for the player to fix: no book rule says it is lost with it.

export type RequirementKind = "requires" | "excludes" | "one-of" | "keyword";

export interface RequirementProblem {
  rule: UpgradeRequirement;
  kind: RequirementKind;
  /** The upgrade (by name) the problem is about. */
  upgrade: string;
  /** Plain words, the whole complaint: "Ranged needs Heretic Raider Legionnaire first". */
  detail: string;
}

const list = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
const either = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`);

/** Problems with one upgrade (by name) on a model holding `held` upgrades (names, with repeats), these items, and these keywords. */
function problemsFor(rules: UpgradeRequirement[], name: string, held: string[], itemIds: readonly string[], keywords: readonly string[], itemName: (id: string) => string = (id) => id): RequirementProblem[] {
  const has = (n: string) => held.includes(n);
  const out: RequirementProblem[] = [];
  for (const rule of rules) {
    if (!rule.upgrades.includes(name)) continue;
    const missing = (rule.requires ?? []).filter((n) => !has(n));
    if (missing.length) out.push({ rule, kind: "requires", upgrade: name, detail: `${name} needs ${list(missing)} first` });
    if (!(rule.unless && has(rule.unless))) {
      const clash = (rule.excludes ?? []).filter(has);
      if (clash.length) out.push({ rule, kind: "excludes", upgrade: name, detail: `${name} cannot be taken with ${either(clash)}${rule.unless ? ` unless the model also has ${rule.unless}` : ""}` });
    }
    if (rule.maxOf !== undefined) {
      const taken = held.filter((n) => rule.upgrades.includes(n));
      if (taken.length > rule.maxOf) out.push({ rule, kind: "one-of", upgrade: name, detail: `only ${rule.maxOf === 1 ? "one" : rule.maxOf} of ${either(rule.upgrades)} on one model, not ${taken.join(" and ")}` });
    }
    const items = (rule.excludesItems ?? []).filter((id) => itemIds.includes(id));
    if (items.length) out.push({ rule, kind: "excludes", upgrade: name, detail: `${name} cannot be taken by a model with a ${either(items.map(itemName))}` });
    const kws = (rule.withoutKeywords ?? []).filter((k) => keywords.some((have) => have.toLowerCase() === k.toLowerCase()));
    if (kws.length) out.push({ rule, kind: "keyword", upgrade: name, detail: `${name} is only for models without the ${either(kws.map((k) => k.toUpperCase()))} Keyword` });
  }
  return out;
}

const rulesFor = (data: RulesData, unit: RosterUnit) => data.unitRules.file.upgradeRequirements.filter((r) => r.unitIds.includes(unit.id));

const heldNames = (member: WarbandMember, unit: RosterUnit) => (member.upgradeIds ?? []).map((id) => upgradeFor(unit, id)?.name).filter((n): n is string => n !== undefined);

/** Every requirement the member's upgrades break, one per upgrade and rule (a "one of" clash is reported on each upgrade past the first). */
export function requirementProblems(data: RulesData, scope: ListScope, member: WarbandMember, unit: RosterUnit): RequirementProblem[] {
  const rules = rulesFor(data, unit);
  if (!rules.length) return [];
  const held = heldNames(member, unit);
  const keywords = memberKeywords(member, unit, data, scope);
  const out: RequirementProblem[] = [];
  const seen = new Map<string, number>();
  for (const name of held) {
    const at = seen.get(name) ?? 0;
    seen.set(name, at + 1);
    if (at > 0) continue;
    // A "one of" clash belongs to the upgrades taken after the allowance, not the first.
    const before = held.slice(0, held.indexOf(name) + 1);
    for (const p of problemsFor(rules, name, held, member.equipmentItemIds, keywords, (id) => data.equipmentById.get(id)?.name ?? id)) {
      if (p.kind === "one-of" && before.filter((n) => p.rule.upgrades.includes(n)).length <= (p.rule.maxOf ?? 0)) continue;
      out.push(p);
    }
  }
  return out;
}

/** Whether the model may take this upgrade now, given what it holds (staged changes included): what the Armoury offers. */
export function upgradeAllowed(data: RulesData, scope: ListScope, member: WarbandMember, unit: RosterUnit, upgrade: Upgrade): boolean {
  const rules = rulesFor(data, unit);
  if (!rules.length) return true;
  const withIt = { ...member, upgradeIds: [...(member.upgradeIds ?? []), upgrade.bsId] };
  return problemsFor(rules, upgrade.name, heldNames(withIt, unit), member.equipmentItemIds, memberKeywords(withIt, unit, data, scope)).length === 0;
}

/** Items an upgrade the model holds rules out (Medicine: no Medi-kit, p94); the Armoury does not offer them. */
export function itemsRuledOut(data: RulesData, member: WarbandMember, unit: RosterUnit): Set<string> {
  const held = heldNames(member, unit);
  return new Set(rulesFor(data, unit).flatMap((r) => (r.upgrades.some((n) => held.includes(n)) ? (r.excludesItems ?? []) : [])));
}
