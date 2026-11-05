import type { RosterUnit } from "./data.js";
import type { EquipmentCategory } from "./schema.js";
import type { z } from "zod";

// Kit and abilities printed on a unit's card rather than bought from its
// armoury: the converter keeps them as `builtInWeapons` / `builtInEquipment`
// (passthrough fields). Entries typed "Ability" or "Spell (Cost N)" are
// abilities, not kit; everything else is kit the model always carries.

type Category = z.infer<typeof EquipmentCategory>;

export interface ProfileKitEntry {
  /** Stable within a unit: "profile/<slug of the name>". */
  id: string;
  name: string;
  category: Category;
  hands: 1 | 2 | null;
  range: string | null;
  keywords: string[];
  rules: string;
}

export interface ProfileAbility {
  name: string;
  text: string;
}

interface RawEntry {
  name: string;
  type: string;
  range: string;
  keywords: string[];
  rules: string;
}

const clean = (s: string) => (s.trim() === "-" ? "" : s.trim());
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function rawEntries(unit: RosterUnit): RawEntry[] {
  const lists = [unit.builtInWeapons, unit.builtInEquipment];
  return lists.flatMap((v) => (Array.isArray(v) ? (v as unknown[]) : [])).flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const o = v as Record<string, unknown>;
    if (typeof o.name !== "string") return [];
    return [
      {
        name: o.name,
        type: typeof o.type === "string" ? o.type.trim() : "",
        range: typeof o.range === "string" ? clean(o.range) : "",
        keywords: Array.isArray(o.keywords) ? o.keywords.filter((k): k is string => typeof k === "string") : [],
        rules: typeof o.rules === "string" ? clean(o.rules) : "",
      },
    ];
  });
}

const isAbility = (e: RawEntry) => /^(ability|spell)\b/i.test(e.type);

function category(e: RawEntry): Category {
  const type = e.type.toLowerCase();
  if (type === "armour") return "armour";
  if (/melee/i.test(e.range)) return "melee";
  if (/\d/.test(e.range)) return "ranged";
  if (type === "melee") return "melee";
  return "equipment";
}

/** The card's kit, shaped like the export's equipment entries. */
export function profileKit(unit: RosterUnit): ProfileKitEntry[] {
  return rawEntries(unit)
    .filter((e) => !isAbility(e))
    .map((e) => {
      const hands = /^1-handed/i.test(e.type) ? 1 : /^2-handed/i.test(e.type) ? 2 : null;
      return { id: `profile/${slug(e.name)}`, name: e.name, category: category(e), hands, range: e.range || null, keywords: e.keywords, rules: e.rules };
    });
}

/** The card's abilities and spells; a spell keeps its cost in front of its text. */
export function profileAbilities(unit: RosterUnit): ProfileAbility[] {
  return rawEntries(unit)
    .filter(isAbility)
    .map((e) => ({ name: e.name, text: /^spell/i.test(e.type) ? [e.type.replace(/\.$/, ""), e.rules].filter(Boolean).join(": ") : e.rules }));
}
