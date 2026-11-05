import type { RosterAccess, RosterUnit } from "./data.js";
import { normaliseName } from "./limits.js";
import type { EquipmentItem } from "./schema.js";

// Digital Rulebook p69 "Battlekit Limits" and "Shields"; HELD p55, HEAVY p55,
// STRONG p57; Headgear and Bayonet Lugs from Warbands of Trench Crusade p11.
// Pure so the roster tool can lay a model's kit out on a figure and ask what
// still fits with the same rules the validator applies.

// Access groups whose weapons carry the Shield Combo stipulation in every
// faction armoury (Warbands of Trench Crusade p24, p50, p74, p106, p129). The
// dataset has no stipulation field, so the BattleScribe group name stands in.
// A mercenary's `loadout` is its fixed kit, and the Mamluk Faris's Polearm
// comes paired with a Trench Shield (p179).
export const SHIELD_COMBO_GROUPS = new Set(["shield-combo", "shield-combos", "bayonet", "loadout"]);

export const hasKeyword = (keywords: string[], re: RegExp) => keywords.some((k) => re.test(k.trim()));

export interface CarriedItem {
  itemId: string;
  item: EquipmentItem;
  access: RosterAccess;
  count: number;
}

export type BattlekitKind = "ranged" | "melee" | "shield" | "armour" | "grenade" | "held" | "other";

export interface ClassifiedItem {
  kind: BattlekitKind;
  /** Hands the item occupies: weapons by profile, a Shield one, HELD Battlekit one (or its own count); the rest none. */
  hands: 0 | 1 | 2;
  /** Carries the Shield Combo stipulation (by access group). */
  combo: boolean;
  heavy: boolean;
  /** Counted as Headgear (by access group). */
  headgear: boolean;
  /** A bayonet: a 2-Handed Melee Weapon that needs a Ranged Weapon with a Bayonet Lug. */
  bayonet: boolean;
  /** Ranged Weapon names this bayonet fits. */
  attachesTo: string[];
}

/**
 * How the battlekit rules see one item on one unit's armoury row.
 * `headgearItemIds` is RulesData.headgearItemIds: Headgear is a property of
 * the item, not of the group one armoury happens to file it under.
 */
export function classifyItem(item: EquipmentItem, access: Pick<RosterAccess, "group" | "attachesTo"> | undefined, headgearItemIds: ReadonlySet<string>): ClassifiedItem {
  const group = access?.group;
  const base = {
    combo: group !== undefined && SHIELD_COMBO_GROUPS.has(group),
    heavy: hasKeyword(item.keywords, /^heavy(\s|$)/i),
    headgear: group === "headgear" || headgearItemIds.has(item.id),
    bayonet: group === "bayonet",
    attachesTo: access?.attachesTo ?? [],
  };
  switch (item.category) {
    case "shield":
      return { ...base, kind: "shield", hands: 1 };
    case "armour":
      return { ...base, kind: "armour", hands: 0 };
    case "grenade":
      return { ...base, kind: "grenade", hands: 0 };
    case "ranged":
      return { ...base, kind: "ranged", hands: item.hands ?? 0 };
    case "melee":
      return { ...base, kind: "melee", hands: item.hands ?? 0 };
    default:
      if (hasKeyword(item.keywords, /^held$/i)) return { ...base, kind: "held", hands: 1 };
      if (item.hands) return { ...base, kind: "held", hands: item.hands };
      return { ...base, kind: "other", hands: 0 };
  }
}

export interface TwoHanded {
  name: string;
  combo: boolean;
}

/** Which 2-Handed Melee Weapon a STRONG model wields one-handed (p57): the first without Shield Combo, since that is the one a shield blocks. */
export function strongChoice(twoHanded: readonly { combo: boolean }[]): number {
  return Math.max(0, twoHanded.findIndex((w) => !w.combo));
}

export interface BattlekitTally {
  strong: boolean;
  negateHeavy: boolean;
  shields: number;
  armour: number;
  headgear: number;
  heavy: number;
  heldHands: number;
  ranged1: number;
  melee1: number;
  ranged2: TwoHanded[];
  /** After the STRONG adjustment. */
  melee2: TwoHanded[];
  /** The 2-Handed Melee Weapon the model wields one-handed because it is STRONG. */
  strongOneHanded?: string;
  grenadeTypes: string[];
  rangedNames: string[];
  bayonets: CarriedItem[];
  /** Equipment taken more than once on the model. */
  duplicates: CarriedItem[];
}

export function tallyBattlekit(unit: RosterUnit, carried: CarriedItem[], headgearItemIds: ReadonlySet<string>): BattlekitTally {
  const strong = hasKeyword(unit.keywords, /^strong$/i);
  const t: BattlekitTally = {
    strong,
    negateHeavy: strong || hasKeyword(unit.keywords, /^negate heavy$/i),
    shields: 0,
    armour: 0,
    headgear: 0,
    heavy: 0,
    heldHands: 0,
    ranged1: 0,
    melee1: 0,
    ranged2: [],
    melee2: [],
    grenadeTypes: [],
    rangedNames: [],
    bayonets: [],
    duplicates: [],
  };

  for (const carriedItem of carried) {
    const { item, access, count } = carriedItem;
    const c = classifyItem(item, access, headgearItemIds);
    if (c.heavy) t.heavy += count;
    if (c.headgear) t.headgear += count;
    if (c.bayonet) t.bayonets.push(carriedItem);

    switch (c.kind) {
      case "shield":
        t.shields += count;
        break;
      case "armour":
        t.armour += count;
        break;
      case "grenade":
        t.grenadeTypes.push(item.name);
        break;
      case "ranged":
        t.rangedNames.push(item.name);
        if (c.hands === 2) for (let i = 0; i < count; i++) t.ranged2.push({ name: item.name, combo: c.combo });
        else if (c.hands === 1) t.ranged1 += count;
        break;
      case "melee":
        if (c.hands === 2) for (let i = 0; i < count; i++) t.melee2.push({ name: item.name, combo: c.combo });
        else if (c.hands === 1) t.melee1 += count;
        break;
      default:
        t.heldHands += c.hands * count;
        if (item.category === "equipment" && count > 1) t.duplicates.push(carriedItem);
    }
  }

  if (strong && t.melee2.length > 0) {
    const [picked] = t.melee2.splice(strongChoice(t.melee2), 1);
    t.strongOneHanded = picked!.name;
    t.melee1 += 1;
  }
  return t;
}

export type BattlekitErrorCode =
  | "battlekit-ranged"
  | "battlekit-melee"
  | "battlekit-grenade"
  | "battlekit-armour"
  | "battlekit-shield"
  | "battlekit-headgear"
  | "battlekit-duplicate"
  | "battlekit-heavy"
  | "battlekit-hands"
  | "bayonet-lug";

export interface BattlekitProblem {
  code: BattlekitErrorCode;
  itemId?: string;
  message: string;
}

export interface BattlekitReport {
  errors: BattlekitProblem[];
  warnings: { itemId?: string; message: string }[];
}

/** The battlekit problems of one model's kit; the validator attaches the member and unit ids. */
export function checkBattlekit(unit: RosterUnit, carried: CarriedItem[], headgearItemIds: ReadonlySet<string>): BattlekitReport {
  const errors: BattlekitProblem[] = [];
  const warnings: BattlekitReport["warnings"] = [];
  const t = tallyBattlekit(unit, carried, headgearItemIds);

  for (const d of t.duplicates) {
    errors.push({ code: "battlekit-duplicate", itemId: d.item.id, message: `${d.item.name} taken ${d.count} times; one piece of Equipment with the same name per model` });
  }

  const slotViolation = (two: number, one: number) => two > 1 || (two === 1 && one > 0) || one > 2;
  if (slotViolation(t.ranged2.length, t.ranged1)) {
    errors.push({ code: "battlekit-ranged", message: `${unit.name}: one 2-Handed or two 1-Handed Ranged Weapons (has ${t.ranged2.length} x 2H, ${t.ranged1} x 1H)` });
  }
  if (slotViolation(t.melee2.length, t.melee1)) {
    errors.push({ code: "battlekit-melee", message: `${unit.name}: one 2-Handed or two 1-Handed Melee Weapons (has ${t.melee2.length} x 2H, ${t.melee1} x 1H)` });
  }
  if (t.grenadeTypes.length > 1) {
    errors.push({ code: "battlekit-grenade", message: `${unit.name}: one type of Grenade (has ${t.grenadeTypes.join(", ")})` });
  }
  if (t.armour > 1) errors.push({ code: "battlekit-armour", message: `${unit.name}: one suit of Armour (has ${t.armour})` });
  if (t.shields > 1) errors.push({ code: "battlekit-shield", message: `${unit.name}: one Shield (has ${t.shields})` });
  if (t.headgear > 1) errors.push({ code: "battlekit-headgear", message: `${unit.name}: one piece of Headgear (has ${t.headgear})` });
  if (t.heavy > 1 && !t.negateHeavy) {
    errors.push({ code: "battlekit-heavy", message: `${unit.name}: one piece of HEAVY Battlekit unless STRONG (has ${t.heavy})` });
  }

  const occupied = t.shields + t.heldHands;
  const weapons = t.ranged1 + t.melee1 + t.ranged2.length + t.melee2.length;
  if (occupied > 2) {
    errors.push({ code: "battlekit-hands", message: `${unit.name}: Shields and HELD Battlekit need ${occupied} hands; a model has two` });
  } else if (occupied > 0) {
    if (t.heldHands > 0 && t.shields > 0 && weapons > 0) {
      errors.push({ code: "battlekit-hands", message: `${unit.name}: a model with HELD Battlekit cannot carry both a Weapon and a Shield` });
    } else if (occupied >= 2 && weapons > 0) {
      errors.push({ code: "battlekit-hands", message: `${unit.name}: both hands are taken by Shields/HELD Battlekit; no Weapons can be carried` });
    } else {
      if (t.ranged1 > 1 || t.melee1 > 1) {
        errors.push({ code: "battlekit-hands", message: `${unit.name}: with a Shield or HELD Battlekit, at most one 1-Handed Melee and one 1-Handed Ranged Weapon` });
      }
      for (const w of [...t.ranged2, ...t.melee2]) {
        if (t.shields > 0 && t.heldHands === 0 && w.combo) {
          warnings.push({ message: `${w.name} with a Shield relies on Shield Combo; the Shield's own stipulation is not encoded in the data, so it is assumed` });
        } else {
          errors.push({ code: "battlekit-hands", message: `${unit.name}: ${w.name} is 2-Handed and cannot be carried with a Shield or HELD Battlekit${w.combo ? "" : " (no Shield Combo)"}` });
        }
      }
    }
  }

  for (const b of t.bayonets) {
    const lugs = (b.access.attachesTo ?? []).map(normaliseName);
    if (!t.rangedNames.some((n) => lugs.includes(normaliseName(n)))) {
      errors.push({ code: "bayonet-lug", itemId: b.item.id, message: `${b.item.name} needs a Ranged Weapon with a Bayonet Lug (${(b.access.attachesTo ?? []).join(", ")})` });
    }
  }

  return { errors, warnings };
}
