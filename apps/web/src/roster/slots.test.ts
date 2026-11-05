import { accessFor, classifyItem, limitContext, loadRulesData, type RulesData, type Warband, type WarbandMember } from "@tc/rules";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createWarband, rosterReducer } from "./reducer.js";
import { kitEntries, layoutFigure, pickerRows, zoneOf, type FigureView, type SlotId } from "./slots.js";
import type { PendingMember } from "./staging.js";

let data: RulesData;
beforeAll(() => {
  data = loadRulesData(resolve(import.meta.dirname, "../../../.."));
});

const unit = (id: string) => data.unitsById.get(id)!;
const pm = (adds: string[] = [], removes: string[] = []): PendingMember => ({ adds, removes, upgradeAdds: [], upgradeRemoves: [] });
const memberOf = (unitId: string, items: string[]): WarbandMember => ({ id: "m1", unitId, equipmentItemIds: items });
const figure = (unitId: string, items: string[], pending?: PendingMember): FigureView => layoutFigure(kitEntries(memberOf(unitId, items), unit(unitId), data, pending), unit(unitId));
const slot = (f: FigureView, id: SlotId) => f.slots.find((s) => s.id === id)!;
const name = (f: FigureView, id: SlotId) => slot(f, id).occupant?.entry.item.name;

const warbandWith = (factionId: string, members: [string, string[]][], variantId?: string): Warband => {
  let w = createWarband({ name: "t", factionId, ...(variantId ? { variantId } : {}) }, "w");
  for (const [unitId, items] of members) w = rosterReducer(w, { type: "add-member", unitId, equipmentItemIds: items });
  return w;
};
const picks = (zone: Parameters<typeof pickerRows>[0], w: Warband, memberIndex = 0, replacing?: string) => {
  const m = w.members[memberIndex]!;
  const u = data.unitsById.get(m.unitId)!;
  return pickerRows(zone, m, u, w, data, limitContext(w, data), replacing);
};
const pickNames = (...args: Parameters<typeof picks>) => picks(...args).rows.map((r) => r.item.name);

describe("zoneOf", () => {
  it("sends each kind of item to its slot, and the rest to the inventory", () => {
    const yeoman = unit("new-antioch/yeoman");
    const z = (id: string) => zoneOf(classifyItem(data.equipmentById.get(id)!, accessFor(yeoman, id)));
    expect(z("combat-helmet")).toBe("head");
    expect(z("standard-armour")).toBe("torso");
    expect(z("bolt-action-rifle")).toBe("ranged");
    expect(z("pistol")).toBe("ranged");
    expect(z("bayonet")).toBe("ranged");
    expect(z("sword-axe")).toBe("melee");
    expect(z("trench-shield")).toBe("offhand");
    expect(z("troop-flag")).toBe("offhand");
    expect(z("frag-grenades")).toBe("grenade");
    expect(z("medikit")).toBe("inventory");
    expect(z("ammo/armour-piercing-bullets")).toBe("inventory");
  });
});

describe("layoutFigure", () => {
  it("lays the rulebook Yeoman out: rifle across both ranged hands with the bayonet under it, which also takes the melee pair", () => {
    const f = figure("new-antioch/yeoman", ["bolt-action-rifle", "bayonet", "combat-helmet", "frag-grenades", "medikit"]);
    expect(slot(f, "ranged-a").occupant).toMatchObject({ spans: true, oneHandedByStrength: false });
    expect(name(f, "ranged-a")).toBe("Bolt-Action Rifle");
    expect(slot(f, "ranged-a").occupant!.attachments.map((a) => a.item.name)).toEqual(["Bayonet"]);
    expect(slot(f, "ranged-b").coveredBy?.item.name).toBe("Bolt-Action Rifle");
    expect(slot(f, "melee-a").coveredBy?.item.name).toBe("Bayonet");
    expect(slot(f, "melee-b").coveredBy?.item.name).toBe("Bayonet");
    expect(name(f, "head")).toBe("Combat Helmet");
    expect(name(f, "grenade")).toBe("Frag Grenades");
    expect(f.inventory.map((e) => e.item.name)).toEqual(["Medikit"]);
    expect(f.unplaced).toEqual([]);
    expect(f.leaving).toEqual([]);
  });

  it("seats two 1-Handed weapons side by side and leaves a third weapon unplaced", () => {
    const two = figure("new-antioch/yeoman", ["pistol", "automatic-pistol"]);
    expect([name(two, "ranged-a"), name(two, "ranged-b")]).toEqual(["Pistol", "Automatic Pistol"]);
    expect(slot(two, "ranged-a").occupant!.spans).toBe(false);
    const three = figure("new-antioch/yeoman", ["bolt-action-rifle", "pistol"]);
    expect(name(three, "ranged-a")).toBe("Bolt-Action Rifle");
    expect(three.unplaced.map((e) => e.item.name)).toEqual(["Pistol"]);
    const lieutenant = figure("new-antioch/lieutenant", ["sword-axe", "pistol", "standard-armour"]);
    expect(name(lieutenant, "melee-a")).toBe("Sword/Axe");
    expect(name(lieutenant, "ranged-a")).toBe("Pistol");
    expect(name(lieutenant, "torso")).toBe("Standard Armour");
    expect(slot(lieutenant, "melee-b").occupant).toBeUndefined();
  });

  it("lets a STRONG model hold a 2-Handed Melee Weapon in one hand, the one without Shield Combo first", () => {
    const knight = unit("black-grail/plague-knight");
    const oneHanded = knight.equipmentAccess.find((a) => {
      const item = data.equipmentById.get(a.itemId);
      return item?.category === "melee" && item.hands === 1;
    })!;
    const pair = figure(knight.id, ["great-hammer-maul", oneHanded.itemId]);
    expect(slot(pair, "melee-a").occupant).toMatchObject({ spans: false, oneHandedByStrength: true });
    expect(name(pair, "melee-a")).toBe("Great Hammer/Maul");
    expect(name(pair, "melee-b")).toBe(data.equipmentById.get(oneHanded.itemId)!.name);
    expect(pair.unplaced).toEqual([]);

    // Maul (plain) before Polearm (Shield Combo): strength goes to the maul, so it sits in one hand and the polearm has nowhere to go.
    const both = figure(knight.id, ["great-hammer-maul", "polearm"]);
    expect(slot(both, "melee-a").occupant).toMatchObject({ spans: false, oneHandedByStrength: true });
    expect(name(both, "melee-a")).toBe("Great Hammer/Maul");
    expect(slot(both, "melee-b").occupant).toBeUndefined();
    expect(both.unplaced.map((e) => e.itemId)).toEqual(["polearm"]);

    const weak = figure("new-antioch/yeoman", ["great-sword-axe"]);
    expect(slot(weak, "melee-a").occupant).toMatchObject({ spans: true, oneHandedByStrength: false });
    expect(slot(weak, "melee-b").coveredBy?.item.name).toBe("Great Sword/Axe");
  });

  it("puts a shield or HELD item in the off-hand and one kind of grenade in the pouch", () => {
    const f = figure("new-antioch/yeoman", ["trench-shield", "sword-axe", "frag-grenades", "molotov-cocktail", "troop-flag"]);
    expect(name(f, "offhand")).toBe("Trench Shield");
    expect(name(f, "melee-a")).toBe("Sword/Axe");
    expect(name(f, "grenade")).toBe("Frag Grenades");
    expect(f.unplaced.map((e) => e.item.name)).toEqual(["Molotov Cocktail", "Troop Flag"]);
  });

  it("keeps a plain pending removal in its slot, struck, and sets a swapped-out item aside", () => {
    const removal = figure("new-antioch/yeoman", ["bolt-action-rifle"], pm([], ["bolt-action-rifle"]));
    expect(slot(removal, "ranged-a").occupant?.entry.pending).toBe("remove");
    expect(removal.leaving).toEqual([]);
    const swap = figure("new-antioch/yeoman", ["bolt-action-rifle"], pm(["pistol"], ["bolt-action-rifle"]));
    expect(slot(swap, "ranged-a").occupant?.entry).toMatchObject({ itemId: "pistol", pending: "add" });
    expect(swap.leaving.map((e) => e.itemId)).toEqual(["bolt-action-rifle"]);
    const bayonetGone = figure("new-antioch/yeoman", ["bolt-action-rifle", "bayonet"], pm([], ["bayonet"]));
    expect(slot(bayonetGone, "ranged-a").occupant!.attachments[0]?.pending).toBe("remove");
    expect(slot(bayonetGone, "melee-a").coveredBy).toBeUndefined();
  });

  it("leaves a bayonet with no lug weapon unplaced and skips items the data does not know", () => {
    const f = figure("new-antioch/yeoman", ["bayonet", "no-such-item"]);
    expect(f.unplaced.map((e) => e.itemId)).toEqual(["bayonet"]);
    expect(f.inventory).toEqual([]);
  });
});

describe("pickerRows", () => {
  it("offers only what the slot takes and what the engine would still accept", () => {
    const rifleman = warbandWith("new-antioch", [["new-antioch/yeoman", ["bolt-action-rifle"]]]);
    expect(pickNames("ranged", rifleman)).toEqual([]);
    expect(picks("ranged", rifleman).attachments.map((r) => r.item.name)).toEqual(["Bayonet"]);
    expect(picks("ranged", warbandWith("new-antioch", [["new-antioch/yeoman", ["pistol"]]])).attachments).toEqual([]);
    expect(picks("ranged", warbandWith("new-antioch", [["new-antioch/yeoman", ["bolt-action-rifle", "bayonet"]]])).attachments).toEqual([]);
    expect(pickNames("melee", rifleman)).toEqual(expect.arrayContaining(["Sword/Axe", "Great Sword/Axe"]));
    expect(pickNames("offhand", rifleman)).not.toContain("Trench Shield");
    expect(pickNames("head", rifleman)).toEqual(["Combat Helmet"]);
    expect(pickNames("inventory", rifleman)).toEqual(expect.arrayContaining(["Medikit", "Shovel"]));
    expect(pickNames("inventory", rifleman)).not.toContain("Bayonet");
    for (const row of picks("ranged", rifleman).rows) expect(row.zone).toBe("ranged");
  });

  it("applies the shield rules through the engine: no 2-Handed weapon with a shield unless Shield Combo", () => {
    const smg = warbandWith("new-antioch", [["new-antioch/yeoman", ["submachine-gun"]]]);
    expect(pickNames("offhand", smg)).toContain("Trench Shield");
    const shielded = warbandWith("new-antioch", [["new-antioch/yeoman", ["trench-shield"]]]);
    expect(pickNames("ranged", shielded)).toContain("Submachine Gun");
    expect(pickNames("ranged", shielded)).toContain("Pistol");
    expect(pickNames("ranged", shielded)).not.toContain("Bolt-Action Rifle");
    expect(pickNames("melee", shielded)).toContain("Sword/Axe");
    expect(pickNames("melee", shielded)).not.toContain("Great Sword/Axe");
    const shieldAndSword = warbandWith("new-antioch", [["new-antioch/yeoman", ["trench-shield", "sword-axe"]]]);
    expect(pickNames("melee", shieldAndSword)).toEqual([]);
  });

  it("enforces one kind of grenade, one suit of armour, one headgear and the fixed-bayonet melee pair", () => {
    const kitted = warbandWith("new-antioch", [["new-antioch/yeoman", ["bolt-action-rifle", "bayonet", "frag-grenades", "standard-armour", "combat-helmet"]]]);
    expect(pickNames("grenade", kitted)).toEqual([]);
    expect(pickNames("torso", kitted)).toEqual([]);
    expect(pickNames("head", kitted)).toEqual([]);
    expect(pickNames("melee", kitted)).toEqual([]);
    expect(pickNames("ranged", kitted)).toEqual([]);
  });

  it("swaps: the item being replaced does not count against the pick", () => {
    const rifleman = warbandWith("new-antioch", [["new-antioch/yeoman", ["bolt-action-rifle"]]]);
    const names = pickNames("ranged", rifleman, 0, "bolt-action-rifle");
    expect(names).toEqual(expect.arrayContaining(["Pistol", "Submachine Gun", "Machine Gun"]));
    expect(names).not.toContain("Bolt-Action Rifle");
    expect(names).not.toContain("Bayonet");
    // The bayonet is judged against the kit as it is, so it stays attachable while the rifle is still carried.
    expect(picks("ranged", rifleman, 0, "bolt-action-rifle").attachments.map((r) => r.item.name)).toEqual(["Bayonet"]);
  });

  it("drops items at their warband-wide cap and reports the counts", () => {
    const kits: [string, string[]][] = Array.from({ length: 4 }, () => ["new-antioch/yeoman", ["mountaineer-kit"]]);
    const full = warbandWith("new-antioch", [...kits, ["new-antioch/yeoman", []]]);
    expect(pickNames("inventory", full, 4)).not.toContain("Mountaineer Kit");
    const room = warbandWith("new-antioch", [...kits.slice(0, 3), ["new-antioch/yeoman", []]]);
    const row = picks("inventory", room, 3).rows.find((r) => r.item.name === "Mountaineer Kit")!;
    expect(row).toMatchObject({ warbandCount: 3, warbandMax: 4 });
    expect(picks("inventory", room, 3).uncheckable).toBeGreaterThanOrEqual(0);
  });

  it("keeps the TC-010b availability rule: variant-locked and uncountable rows never appear", () => {
    const plain = warbandWith("new-antioch", [["new-antioch/yeoman", []]]);
    expect(pickNames("inventory", plain)).not.toContain("Holy Water of Lalibela");
    const abyssinia = warbandWith("new-antioch", [["new-antioch/yeoman", []]], "new-antioch/expeditionary-forces-of-abyssinia");
    expect(pickNames("inventory", abyssinia)).toContain("Holy Water of Lalibela");
  });
});
