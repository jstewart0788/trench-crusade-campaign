import { limitContext, loadRulesData, type RulesData, type Warband } from "@tc/rules";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createWarband, rosterReducer } from "./reducer.js";
import { armouryGroups, defaultKit, gateLabel, limitText, priceText, unitRows, upgradeRows } from "./select.js";

let data: RulesData;
beforeAll(() => {
  data = loadRulesData(resolve(import.meta.dirname, "../../../.."));
});

const antioch = (variantId?: string): Warband => createWarband({ name: "t", factionId: "new-antioch", ...(variantId ? { variantId } : {}) }, "w");
const withYeoman = (w: Warband, items: string[] = []) => rosterReducer(w, { type: "add-member", unitId: "new-antioch/yeoman", equipmentItemIds: items });
const ctxFor = (w: Warband) => limitContext(w, data);

describe("unitRows", () => {
  it("hides variant-locked units until the variant is chosen", () => {
    const names = (w: Warband) => unitRows(w, data, ctxFor(w)).map((r) => r.unit.name);
    expect(names(antioch())).not.toContain("Crimson Communicant");
    expect(names(antioch("new-antioch/the-red-brigade"))).toContain("Crimson Communicant");
    expect(names(antioch("new-antioch/expeditionary-forces-of-abyssinia"))).not.toContain("Sniper Priest");
    expect(names(antioch())).toContain("Sniper Priest");
  });

  it("keeps units behind gates the data cannot count, with a note", () => {
    const row = unitRows(antioch(), data, ctxFor(antioch())).find((r) => r.unit.name === "Homunculus")!;
    expect(row.gate).toEqual({ hidden: false, disabled: false, notes: ["needs Book of Golems — not checked here"] });
  });

  it("disables a unit waiting on something the roster can count", () => {
    const w = antioch();
    const dog = unitRows(w, data, ctxFor(w)).find((r) => r.unit.name === "Trench Dog")!;
    expect(dog.gate).toMatchObject({ hidden: false, disabled: true, notes: ["needs Dog Food"] });
    expect(dog).toMatchObject({ max: 0, atMax: true });
    const fed = withYeoman(w, ["dog-food"]);
    expect(unitRows(fed, data, ctxFor(fed)).find((r) => r.unit.name === "Trench Dog")).toMatchObject({ max: 1, atMax: false, gate: { disabled: false } });
  });

  it("counts members and reports the variant-adjusted limits", () => {
    let w = antioch();
    const lt = () => unitRows(w, data, ctxFor(w)).find((r) => r.unit.name === "Lieutenant")!;
    expect(lt()).toMatchObject({ count: 0, min: 1, max: 1, atMax: false });
    w = rosterReducer(w, { type: "add-member", unitId: "new-antioch/lieutenant" });
    expect(lt()).toMatchObject({ count: 1, atMax: true });
    const prussia = antioch("new-antioch/stosstruppen-of-the-free-state-of-prussia");
    expect(unitRows(prussia, data, ctxFor(prussia)).find((r) => r.unit.name === "Shocktrooper")).toMatchObject({ min: 2, max: 8 });
  });
});

describe("armouryGroups", () => {
  it("groups a Yeoman's armoury with faction prices, weapons first, variant-locked rows hidden", () => {
    const w = withYeoman(antioch());
    const member = w.members[0]!;
    const unit = data.unitsById.get("new-antioch/yeoman")!;
    const groups = armouryGroups(member, unit, w, data, ctxFor(w));
    expect(groups.map((g) => g.label).slice(0, 3)).toEqual(["Ranged, 1-handed", "Ranged, 2-handed", "Bayonets"]);
    const all = groups.flatMap((g) => g.rows);
    expect(all.find((r) => r.item.name === "Bolt-Action Rifle")?.cost).toEqual({ id: "bolt-action-rifle", ducats: 5, glory: 0 });
    expect(all.map((r) => r.item.name)).not.toContain("Holy Water of Lalibela");
    expect(all.map((r) => r.item.name)).not.toContain("Armour Piercing Bullets");
  });

  it("disables a row blocked by something on the same model and re-enables it when that goes", () => {
    const eire = "new-antioch/eire-rangers";
    const armed = withYeoman(antioch(eire), ["bolt-action-rifle"]);
    const unit = data.unitsById.get("new-antioch/yeoman")!;
    const find = (w: Warband) => armouryGroups(w.members[0]!, unit, w, data, ctxFor(w)).flatMap((g) => g.rows).find((r) => r.item.name === "Armour Piercing Bullets")!;
    expect(find(armed).gate).toEqual({ hidden: false, disabled: true, notes: ["not with Bolt-Action Rifle"] });
    expect(find(withYeoman(antioch(eire))).gate).toEqual({ hidden: false, disabled: false, notes: [] });
  });

  it("tracks per-model counts against the row's limit", () => {
    const unit = data.unitsById.get("new-antioch/yeoman")!;
    const bare = withYeoman(antioch());
    const armoured = withYeoman(antioch(), ["standard-armour"]);
    const row = (w: Warband) => armouryGroups(w.members[0]!, unit, w, data, ctxFor(w)).flatMap((g) => g.rows).find((r) => r.item.name === "Standard Armour")!;
    expect(row(bare)).toMatchObject({ count: 0, max: 1, atMax: false });
    expect(row(armoured)).toMatchObject({ count: 1, max: 1, atMax: true });
  });
});

describe("upgradeRows", () => {
  it("hides variant-locked upgrades and counts the ones taken", () => {
    const unit = data.unitsById.get("new-antioch/yeoman")!;
    const plain = withYeoman(antioch());
    const names = (w: Warband) => upgradeRows(w.members[0]!, unit, w, data, ctxFor(w)).map((r) => r.upgrade.name);
    expect(names(plain)).toContain("Trench Mole");
    expect(names(plain)).not.toContain("Blood Cloak");
    const red = withYeoman(antioch("new-antioch/the-red-brigade"));
    expect(names(red)).toContain("Blood Cloak");
    const cloaked = rosterReducer(red, { type: "add-upgrade", memberId: "m1", upgradeId: "114b-97a7-6011-55c2" });
    const row = upgradeRows(cloaked.members[0]!, unit, cloaked, data, ctxFor(cloaked)).find((r) => r.upgrade.name === "Blood Cloak")!;
    expect(row).toMatchObject({ count: 1, max: 1, atMax: true, cost: { ducats: 5, glory: 0 } });
  });
});

describe("defaultKit", () => {
  it("lists a unit's fixed rows", () => {
    const grail = createWarband({ name: "g", factionId: "black-grail" }, "g");
    const sinEater = data.unitsById.get("black-grail/sin-eater")!;
    expect(defaultKit(sinEater, grail, data, ctxFor(grail))).toEqual(["combat-helmet", "reinforced-armour", "tenderizer-maul"]);
    expect(defaultKit(data.unitsById.get("new-antioch/yeoman")!, antioch(), data, ctxFor(antioch()))).toEqual([]);
  });
});

describe("labels", () => {
  it("renders gates, limits and prices for people", () => {
    expect(gateLabel("new-antioch/eire-rangers", data)).toBe("Eire Rangers");
    expect(gateLabel("item:bolt-action-rifle", data)).toBe("Bolt-Action Rifle");
    expect(gateLabel("upgrade:Machine Armour", data)).toBe("Machine Armour");
    expect(gateLabel("Remnants of Byzantium [New Antioch]", data)).toBe("Remnants of Byzantium");
    expect(limitText(1, 1)).toBe("1");
    expect(limitText(0, 5)).toBe("0–5");
    expect(limitText(null, 2)).toBe("0–2");
    expect(limitText(null, null)).toBe("any");
    expect(limitText(2, null)).toBe("2+");
    expect(priceText({ ducats: 30, glory: 0 })).toBe("30d");
    expect(priceText({ ducats: 0, glory: 7 })).toBe("7g");
    expect(priceText({ ducats: 110, glory: 4 })).toBe("110d + 4g");
    expect(priceText({ ducats: 0, glory: 0 })).toBe("0d");
  });
});
