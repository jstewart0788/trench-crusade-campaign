import {
  accessFor,
  checkBattlekit,
  type BattlekitErrorCode,
  classifyItem,
  hasKeyword,
  normaliseName,
  profileKit,
  resolveLimit,
  strongChoice,
  type CarriedItem,
  type ClassifiedItem,
  type EquipmentItem,
  type LimitContext,
  type RosterAccess,
  type RosterUnit,
  type RulesData,
  type Warband,
  type WarbandMember,
} from "@tc/rules/browser";
import type { Cap } from "./purse.js";
import { armouryGroups, type AccessRow } from "./select.js";
import { stagedKit, type PendingMember } from "./staging.js";

// The Armoury figure: where each piece of a model's kit sits, and what a
// slot can still take. Classification and legality come from the engine's
// battlekit module, so the figure never disagrees with the validator.

export type Zone = "head" | "torso" | "ranged" | "melee" | "offhand" | "grenade" | "inventory";
export type SlotId = "head" | "torso" | "ranged-a" | "ranged-b" | "melee-a" | "melee-b" | "offhand" | "grenade";

export interface SlotSpec {
  id: SlotId;
  zone: Zone;
  label: string;
  hint: string;
}

export const SLOTS: readonly SlotSpec[] = [
  { id: "head", zone: "head", label: "Head", hint: "one piece of Headgear" },
  { id: "torso", zone: "torso", label: "Torso", hint: "one suit of Armour" },
  { id: "ranged-a", zone: "ranged", label: "Ranged", hint: "one 2-Handed or two 1-Handed Ranged Weapons" },
  { id: "ranged-b", zone: "ranged", label: "Ranged", hint: "one 2-Handed or two 1-Handed Ranged Weapons" },
  { id: "melee-a", zone: "melee", label: "Melee", hint: "one 2-Handed or two 1-Handed Melee Weapons" },
  { id: "melee-b", zone: "melee", label: "Melee", hint: "one 2-Handed or two 1-Handed Melee Weapons" },
  { id: "offhand", zone: "offhand", label: "Off-hand", hint: "a Shield or HELD Battlekit" },
  { id: "grenade", zone: "grenade", label: "Grenades", hint: "one kind of Grenade" },
];

export const ZONE_LABELS: Record<Zone, string> = {
  head: "Head",
  torso: "Torso",
  ranged: "Ranged hands",
  melee: "Melee hands",
  offhand: "Off-hand",
  grenade: "Grenade pouch",
  inventory: "Inventory",
};

export function zoneOf(c: ClassifiedItem): Zone {
  if (c.headgear) return "head";
  if (c.bayonet) return "ranged";
  switch (c.kind) {
    case "armour":
      return "torso";
    case "shield":
    case "held":
      return "offhand";
    case "ranged":
      return "ranged";
    case "melee":
      return "melee";
    case "grenade":
      return "grenade";
    default:
      return "inventory";
  }
}

export interface KitEntry {
  /** Position in the staged kit: confirmed items first, pending additions after. */
  index: number;
  itemId: string;
  item: EquipmentItem;
  access: RosterAccess | undefined;
  classified: ClassifiedItem;
  pending?: "add" | "remove";
  /** Printed on the unit card (`builtInWeapons` / `builtInEquipment`), not a roster item. */
  card?: true;
}

/** The member's kit with pending changes marked; items the data does not know are left to the validator. */
export function kitEntries(member: WarbandMember, unit: RosterUnit, data: RulesData, pm: PendingMember | undefined): KitEntry[] {
  return stagedKit(member, pm).flatMap((e, index) => {
    const item = data.equipmentById.get(e.id);
    if (!item) return [];
    const access = accessFor(unit, e.id);
    const entry: KitEntry = { index, itemId: e.id, item, access, classified: classifyItem(item, access, data.headgearItemIds) };
    if (e.pending) entry.pending = e.pending;
    return [entry];
  });
}

export interface Occupant {
  entry: KitEntry;
  /** Takes both hands of its pair. */
  spans: boolean;
  /** A STRONG model wields this 2-Handed Melee Weapon in one hand (p57). */
  oneHandedByStrength: boolean;
  /** Bayonets fixed to this Ranged Weapon. */
  attachments: KitEntry[];
}

export interface SlotView extends SlotSpec {
  occupant?: Occupant;
  /** Taken by a two-handed item anchored elsewhere: the other hand of a 2-Handed weapon, or the melee pair under a fixed bayonet. */
  coveredBy?: KitEntry;
}

export interface FigureView {
  slots: SlotView[];
  /** Equipment, ammunition and everything else that is not a slot item. */
  inventory: KitEntry[];
  /** Slot items with nowhere to go (a third weapon, a second shield…); the validator names the breach. */
  unplaced: KitEntry[];
  /** Pending removals whose slot has already gone to a replacement. */
  leaving: KitEntry[];
}

const pairOf = (zone: "ranged" | "melee"): [SlotId, SlotId] => (zone === "ranged" ? ["ranged-a", "ranged-b"] : ["melee-a", "melee-b"]);

/**
 * Card kit as figure entries, locked like fixed kit. An entry named like a
 * data item ("Combat Helmet" on the Mamluk Faris's card) is classified as
 * that item, so it goes to the slot the item would; otherwise its own
 * category and hands decide. Negative indices keep it apart from roster kit.
 */
export function cardKitEntries(unit: RosterUnit, data: RulesData): KitEntry[] {
  const byName = new Map(data.equipment.map((i) => [normaliseName(i.name), i]));
  return profileKit(unit).map((k, i) => {
    const item: EquipmentItem = { id: k.id, name: k.name, category: k.category, hands: k.hands, cost: { ducats: 0, glory: 0 }, range: k.range, keywords: k.keywords, rules: k.rules, modifiers: [], limits: null };
    const access = { itemId: k.id, group: "direct", fixed: true } as RosterAccess;
    const twin = byName.get(normaliseName(k.name));
    return { index: -(i + 1), itemId: k.id, item, access, classified: classifyItem(twin ?? item, access, data.headgearItemIds), card: true };
  });
}

/**
 * Seats the roster kit, then the card kit (`card`) in whatever natural slots
 * the roster kit left free. The validator does not count card kit against
 * battlekit limits, so card kit never displaces a purchase or lands under
 * "No room"; where it does not fit it is listed in Skills & abilities only.
 */
export function layoutFigure(kit: KitEntry[], unit: RosterUnit, card: KitEntry[] = []): FigureView {
  const slots = new Map<SlotId, SlotView>(SLOTS.map((s) => [s.id, { ...s }]));
  const inventory: KitEntry[] = [];
  const unplaced: KitEntry[] = [];
  const leaving: KitEntry[] = [];
  const strong = hasKeyword(unit.keywords, /^strong$/i);

  // The weapon a STRONG model takes one-handed, chosen among the active 2-Handed Melee Weapons as the engine does.
  const active = kit.filter((e) => e.pending !== "remove");
  const twoHandedMelee = active.filter((e) => e.classified.kind === "melee" && e.classified.hands === 2);
  const strongPick = strong && twoHandedMelee.length > 0 ? twoHandedMelee[strongChoice(twoHandedMelee.map((e) => e.classified))] : undefined;

  const free = (id: SlotId) => !slots.get(id)!.occupant && !slots.get(id)!.coveredBy;
  const reject = (e: KitEntry) => (e.pending === "remove" ? leaving : unplaced).push(e);

  const placeSingle = (id: SlotId, e: KitEntry) => {
    if (free(id)) slots.get(id)!.occupant = { entry: e, spans: false, oneHandedByStrength: false, attachments: [] };
    else reject(e);
  };

  const placeWeapon = (zone: "ranged" | "melee", e: KitEntry) => {
    const [a, b] = pairOf(zone);
    const oneHandedByStrength = e === strongPick;
    const needsBoth = e.classified.hands === 2 && !oneHandedByStrength;
    if (needsBoth) {
      if (free(a) && free(b)) {
        slots.get(a)!.occupant = { entry: e, spans: true, oneHandedByStrength: false, attachments: [] };
        slots.get(b)!.coveredBy = e;
      } else reject(e);
      return;
    }
    const target = free(a) ? a : free(b) ? b : undefined;
    if (target) slots.get(target)!.occupant = { entry: e, spans: false, oneHandedByStrength, attachments: [] };
    else reject(e);
  };

  const bayonets: KitEntry[] = [];
  // Active kit first, then pending removals into whatever is still empty, so a
  // plain removal stays in its slot (struck) while a swap's old item steps aside.
  for (const e of [...active, ...kit.filter((x) => x.pending === "remove")]) {
    const c = e.classified;
    if (c.bayonet) {
      bayonets.push(e);
      continue;
    }
    switch (zoneOf(c)) {
      case "head":
        placeSingle("head", e);
        break;
      case "torso":
        placeSingle("torso", e);
        break;
      case "offhand":
        placeSingle("offhand", e);
        break;
      case "grenade":
        placeSingle("grenade", e);
        break;
      case "ranged":
        placeWeapon("ranged", e);
        break;
      case "melee":
        placeWeapon("melee", e);
        break;
      default:
        inventory.push(e);
    }
  }

  // A bayonet hangs under the Ranged Weapon with the lug it fits and, being a
  // 2-Handed Melee Weapon, takes the melee pair when nothing else does.
  for (const b of bayonets) {
    const lugs = b.classified.attachesTo.map(normaliseName);
    const host = (["ranged-a", "ranged-b"] as const).map((id) => slots.get(id)!.occupant).find((o) => o && lugs.includes(normaliseName(o.entry.item.name)));
    if (!host) {
      reject(b);
      continue;
    }
    host.attachments.push(b);
    if (b.pending !== "remove" && free("melee-a") && free("melee-b")) {
      slots.get("melee-a")!.coveredBy = b;
      slots.get("melee-b")!.coveredBy = b;
    }
  }

  for (const e of card) {
    const zone = zoneOf(e.classified);
    if (zone === "ranged" || zone === "melee") {
      const [a, b] = pairOf(zone);
      if (e.classified.hands === 2) {
        if (free(a) && free(b)) {
          slots.get(a)!.occupant = { entry: e, spans: true, oneHandedByStrength: false, attachments: [] };
          slots.get(b)!.coveredBy = e;
        }
      } else {
        const target = free(a) ? a : free(b) ? b : undefined;
        if (target) slots.get(target)!.occupant = { entry: e, spans: false, oneHandedByStrength: false, attachments: [] };
      }
    } else if (zone !== "inventory") {
      const id = SLOTS.find((x) => x.zone === zone)!.id;
      if (free(id)) slots.get(id)!.occupant = { entry: e, spans: false, oneHandedByStrength: false, attachments: [] };
    }
  }

  return { slots: SLOTS.map((s) => slots.get(s.id)!), inventory, unplaced, leaving };
}

export interface PickerRow extends AccessRow {
  zone: Zone;
  classified: ClassifiedItem;
  /** Copies across the whole staged roster, and the warband-wide cap when the row has one. */
  warbandCount: number;
  warbandMax: number | null;
  /** Set when the model or the warband already has as many as it may: shown, priced, not buyable. */
  cap?: Cap;
}

export interface PickerListing {
  rows: PickerRow[];
  /** Bayonets that can be fixed to a Ranged Weapon the model carries; picked without replacing anything. */
  attachments: PickerRow[];
  /** Rows of this zone hidden because their gate names a campaign selection the data cannot count. */
  uncheckable: number;
  /** Rows of this zone the kit cannot take, by the battlekit problem the engine would raise. */
  unfit: Partial<Record<UnfitReason, number>>;
}

/**
 * Why a row is hidden from a picker. The engine raises `bayonet-lug` both for
 * a bayonet with no lug weapon and for a swap that takes the lug weapon away;
 * the second is about the bayonet already fitted, so it is worded apart.
 */
export type UnfitReason = BattlekitErrorCode | "bayonet-stranded";

const UNFIT_WORDS: Record<UnfitReason, { one: string; many: string }> = {
  "battlekit-hands": { one: "needs a free hand", many: "need a free hand" },
  "battlekit-ranged": { one: "needs a free hand", many: "need a free hand" },
  "battlekit-melee": { one: "needs a free hand", many: "need a free hand" },
  "battlekit-armour": { one: "would be a second suit of armour", many: "would be a second suit of armour" },
  "battlekit-shield": { one: "would be a second shield", many: "would be a second shield" },
  "battlekit-headgear": { one: "would be a second piece of headgear", many: "would be a second piece of headgear" },
  "battlekit-grenade": { one: "is another kind of grenade; one kind per model", many: "are other kinds of grenade; one kind per model" },
  "battlekit-heavy": { one: "would be a second HEAVY item", many: "would be a second HEAVY item" },
  "battlekit-duplicate": { one: "is already carried", many: "are already carried" },
  "bayonet-lug": { one: "needs a ranged weapon with a bayonet lug", many: "need a ranged weapon with a bayonet lug" },
  "bayonet-stranded": { one: "would leave the fitted bayonet without a lug weapon", many: "would leave the fitted bayonet without a lug weapon" },
};

/** One quiet line per reason, in plain words: "2 items need a free hand". */
export function unfitLines(unfit: PickerListing["unfit"]): string[] {
  const lines: string[] = [];
  for (const code of Object.keys(UNFIT_WORDS) as UnfitReason[]) {
    const n = unfit[code];
    if (!n) continue;
    const words = UNFIT_WORDS[code];
    lines.push(n === 1 ? `1 item ${words.one}` : `${n} items ${words.many}`);
  }
  return lines;
}

function toCarried(ids: string[], unit: RosterUnit, data: RulesData): CarriedItem[] {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  const carried: CarriedItem[] = [];
  for (const [itemId, count] of counts) {
    const item = data.equipmentById.get(itemId);
    const access = accessFor(unit, itemId);
    if (item && access) carried.push({ itemId, item, access, count });
  }
  return carried;
}

function problemCounts(unit: RosterUnit, ids: string[], data: RulesData): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of checkBattlekit(unit, toCarried(ids, unit, data), data.headgearItemIds).errors) counts.set(e.code, (counts.get(e.code) ?? 0) + 1);
  return counts;
}

function withoutLast(ids: string[], id: string): string[] {
  const at = ids.lastIndexOf(id);
  return at === -1 ? ids : [...ids.slice(0, at), ...ids.slice(at + 1)];
}

/**
 * What the picker for a zone offers this member: the TC-010b available rows
 * for the zone, minus anything at its per-model or per-warband cap, minus
 * anything whose addition would give the model a battlekit problem it does
 * not already have (hands, Shields, HELD, STRONG, HEAVY, grenade kinds,
 * bayonet lugs: all judged by the engine on the hypothetical kit).
 * `replacing` is the item the pick would swap out first.
 */
export function pickerRows(
  zone: Zone,
  member: WarbandMember,
  unit: RosterUnit,
  warband: Warband,
  data: RulesData,
  ctx: LimitContext,
  replacing?: string,
): PickerListing {
  const listing = armouryGroups(member, unit, warband, data, ctx);
  const baseIds = replacing ? withoutLast(member.equipmentItemIds, replacing) : member.equipmentItemIds;
  const before = problemCounts(unit, member.equipmentItemIds, data);
  const unfit: PickerListing["unfit"] = {};
  // The first battlekit problem adding the item would raise that the kit does not already have; undefined when it fits.
  const blocker = (ids: string[], itemId: string): BattlekitErrorCode | undefined => {
    const after = problemCounts(unit, [...ids, itemId], data);
    for (const [code, n] of after) if (n > (before.get(code) ?? 0)) return code as BattlekitErrorCode;
    return undefined;
  };
  const offer = (list: PickerRow[], ids: string[], row: PickerRow) => {
    const code = blocker(ids, row.item.id);
    const reason: UnfitReason | undefined = code === "bayonet-lug" && !row.classified.bayonet ? "bayonet-stranded" : code;
    if (reason) unfit[reason] = (unfit[reason] ?? 0) + 1;
    else list.push(row);
  };
  const rows: PickerRow[] = [];
  const attachments: PickerRow[] = [];
  for (const group of listing.groups) {
    for (const row of group.rows) {
      const classified = classifyItem(row.item, row.access, data.headgearItemIds);
      if (zoneOf(classified) !== zone) continue;
      if (row.item.id === replacing) continue;
      const warbandMax = resolveLimit(row.access.limitsText ?? row.item.limits ?? undefined, "max", "warband", row.access.maxPerWarband ?? null, ctx, row.item.name).value;
      const warbandCount = ctx.count(row.item.name) ?? 0;
      const cap: Cap | undefined = row.atMax
        ? { count: row.count, max: row.max, scope: "model" }
        : warbandMax !== null && warbandCount >= warbandMax
          ? { count: warbandCount, max: warbandMax, scope: "warband" }
          : undefined;
      if (cap) {
        // At its limit: stays on the shelf, priced and blocked, rather than vanishing.
        (classified.bayonet ? attachments : rows).push({ ...row, zone, classified, warbandCount, warbandMax, cap });
        continue;
      }
      const pickerRow: PickerRow = { ...row, zone, classified, warbandCount, warbandMax };
      if (classified.bayonet) offer(attachments, member.equipmentItemIds, pickerRow);
      else offer(rows, baseIds, pickerRow);
    }
  }
  const uncheckable = listing.uncheckableRows.filter((h) => zoneOf(classifyItem(h.item, h.access, data.headgearItemIds)) === zone).length;
  return { rows, attachments, uncheckable, unfit };
}
