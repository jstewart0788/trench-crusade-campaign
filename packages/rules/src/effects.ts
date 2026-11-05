import { upgradeFor, type RosterUnit, type RulesData } from "./data.js";
import type { WarbandMember } from "./roster.js";
import type { ModelEffect, StatChange } from "./unit-rules.js";

// What a model's upgrades (and a few items) do to its characteristics and
// keywords: upstream's own modifiers read from the converted notes, then
// unit-rules.json upgradeEffects. A staged upgrade is on the member the screens
// pass in, so its effect shows before Confirm.

type Stats = RosterUnit["stats"];

/** The effects that apply to this member: those of upgrades it has and items it carries. */
export function memberEffects(data: RulesData, unit: RosterUnit, member: WarbandMember | undefined): ModelEffect[] {
  if (!member) return [];
  const upgrades = new Set((member.upgradeIds ?? []).map((id) => upgradeFor(unit, id)?.name).filter((n): n is string => n !== undefined));
  const items = new Set(member.equipmentItemIds);
  return (data.unitRules.effectsByUnit.get(unit.id) ?? []).filter((e) => (e.upgrade !== undefined && upgrades.has(e.upgrade)) || (e.item !== undefined && items.has(e.item)));
}

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

/** "+0" plus 1 is "+1"; a characteristic the model does not have ("-", "n/a") stays as it is. */
function addDice(value: string, n: number): string {
  const m = /^([+-]?\d+)$/.exec(value.trim());
  return m ? signed(Number(m[1]) + n) : value;
}

function setMovement(raw: string): Stats["movement"] {
  const m = /^(\d+)"?\/?(\w+)?/.exec(raw.replace(/[”“]/g, '"'));
  const inches = m ? Number(m[1]) : 0;
  const type = (m?.[2] ?? "Infantry") as Stats["movement"]["type"];
  return { inches, raw: `${inches}"/${type}`, type };
}

/** Applies stat changes in order, set or add, to a copy of the stats. */
export function applyChanges(stats: Stats, changes: readonly StatChange[]): Stats {
  let s = { ...stats };
  for (const c of changes) {
    switch (c.stat) {
      case "ranged":
      case "melee":
        s = { ...s, [c.stat]: c.op === "set" ? String(c.value) : addDice(s[c.stat], Number(c.value)) };
        break;
      case "armour":
        s = { ...s, armour: c.op === "set" ? Number(c.value) : s.armour + Number(c.value) };
        break;
      case "base":
        if (c.op === "set") s = { ...s, base: String(c.value) };
        break;
      case "movement": {
        if (c.op === "set") s = { ...s, movement: setMovement(String(c.value)) };
        else if (s.movement.inches !== null) {
          const inches = s.movement.inches + Number(c.value);
          s = { ...s, movement: { ...s.movement, inches, raw: `${inches}"/${s.movement.type}` } };
        }
        break;
      }
    }
  }
  return s;
}

/** Keywords this member's upgrades and items give it. */
export function effectKeywords(data: RulesData, unit: RosterUnit, member: WarbandMember | undefined): string[] {
  return memberEffects(data, unit, member).flatMap((e) => e.keywords);
}
