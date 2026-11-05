import {
  abilityApplies,
  evaluateGates,
  profileAbilities,
  profileKit,
  resolveLimit,
  rosterVariants,
  upgradeFor,
  type LimitContext,
  type RosterUnit,
  type RulesData,
  type Upgrade,
  type Warband,
  type WarbandMember,
} from "@tc/rules/browser";
import { describeAbility, describeItem, describeUpgrade, type Description } from "./describe.js";
import { gateStatus } from "./select.js";
import { kitEntries, zoneOf, ZONE_LABELS, type KitEntry, type Zone } from "./slots.js";
import { stagedUpgrades, type PendingMember, type StagedEntry } from "./staging.js";

// What a model always has, as opposed to what was bought for it: the unit's
// abilities, its built-in kit and the upgrades it must carry. None of these
// are purchases, so nothing that lists them offers to remove them.

/** Kit the armoury marks `fixed`: the unit arrives with it, it costs nothing, and (63 of 64 rows) its row also says "min 1 per model". */
export function isBuiltIn(entry: { access?: { fixed?: boolean } | undefined }): boolean {
  return entry.access?.fixed === true;
}

/** An upgrade the model must take: its per-model minimum resolves to at least one (Atonement Bell). */
export function isMandatoryUpgrade(upgrade: Upgrade, ctx: LimitContext): boolean {
  return (resolveLimit(upgrade.limitsText, "min", "model", null, ctx, upgrade.name).value ?? 0) >= 1;
}

/** Mandatory upgrades open to this roster; a recruit is given them as it is given its built-in kit. */
export function defaultUpgrades(unit: RosterUnit, warband: Warband, data: RulesData, ctx: LimitContext): string[] {
  return (unit.upgrades ?? [])
    .filter((g) => isMandatoryUpgrade(g, ctx) && gateStatus(evaluateGates(g.onlyWith, g.onlyWithout, warband, data, ctx)) === "open")
    .map((g) => g.bsId);
}

export interface Trait {
  key: string;
  desc: Description;
  pending?: "add" | "remove";
  /** Built-in kit carried as an item: where it sits ("Torso", "Inventory"); profile kit has none. */
  where?: string;
  kit?: KitEntry;
  upgrade?: StagedEntry;
}

export interface MemberTraits {
  abilities: Trait[];
  builtIn: Trait[];
  skills: Trait[];
}

// Built-ins without a slot are not listed in the Inventory panel, so they are "Carried" rather than "Inventory".
const ZONE_PLACE: Record<Zone, string> = { ...ZONE_LABELS, ranged: "Ranged hands", melee: "Melee hands", inventory: "Carried" };

/**
 * Everything the member always has. `member` is the confirmed record (or a
 * recruit) and `pm` its pending changes, so a pending restore or removal of a
 * built-in shows as such; pass no `pm` for an already-applied member.
 */
export function memberTraits(member: WarbandMember, unit: RosterUnit, warband: Warband, data: RulesData, ctx: LimitContext, pm?: PendingMember): MemberTraits {
  // Same lookups as toWarbandExport, so the panel lists exactly what the TTS payload binds (subfaction variants included).
  const variantName = rosterVariants(data, warband).find((v) => v.id === warband.variantId)?.name;
  const abilities = [...unit.abilities.filter((a) => abilityApplies(a, warband.variantId, variantName)), ...profileAbilities(unit)].map((a, i) => ({ key: `a${i}`, desc: describeAbility(a) }));

  const builtIn: Trait[] = kitEntries(member, unit, data, pm)
    .filter(isBuiltIn)
    .map((e) => {
      const t: Trait = { key: `k${e.index}`, desc: describeItem(e.item), where: ZONE_PLACE[zoneOf(e.classified)], kit: e };
      if (e.pending) t.pending = e.pending;
      return t;
    });
  profileKit(unit).forEach((k) => builtIn.push({ key: k.id, desc: describeItem(k), where: "Profile" }));

  const skills: Trait[] = stagedUpgrades(member, pm).flatMap((u, i) => {
    const upgrade = upgradeFor(unit, u.id);
    if (!upgrade || !isMandatoryUpgrade(upgrade, ctx)) return [];
    const t: Trait = { key: `u${i}`, desc: describeUpgrade(upgrade), upgrade: u };
    if (u.pending) t.pending = u.pending;
    return [t];
  });

  return { abilities, builtIn, skills };
}

/** Upgrade ids on the member the Inventory must not offer to remove. */
export function lockedUpgradeIds(member: WarbandMember, unit: RosterUnit, ctx: LimitContext): Set<string> {
  return new Set((member.upgradeIds ?? []).filter((id) => {
    const g = upgradeFor(unit, id);
    return g !== undefined && isMandatoryUpgrade(g, ctx);
  }));
}
