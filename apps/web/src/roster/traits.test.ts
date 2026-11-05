import { limitContext, loadRulesData, profileKit, toWarbandExport, upgradeFor, type RulesData, type Warband } from "@tc/rules";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createWarband, rosterReducer } from "./reducer.js";
import { defaultKit } from "./select.js";
import { defaultUpgrades, isBuiltIn, isMandatoryUpgrade, lockedUpgradeIds, memberTraits } from "./traits.js";

let data: RulesData;
beforeAll(() => {
  data = loadRulesData(resolve(import.meta.dirname, "../../../.."));
});

const unit = (id: string) => data.unitsById.get(id)!;
const withMember = (factionId: string, unitId: string, items: string[], variantId?: string, upgradeIds?: string[]): Warband => {
  const w = createWarband({ name: "t", factionId, ...(variantId ? { variantId } : {}) }, "w");
  return rosterReducer(w, { type: "add-member", unitId, equipmentItemIds: items, ...(upgradeIds ? { upgradeIds } : {}) });
};
const traitsOf = (w: Warband) => memberTraits(w.members[0]!, unit(w.members[0]!.unitId), w, data, limitContext(w, data));

describe("isBuiltIn", () => {
  it("is true for fixed armoury rows only", () => {
    const sinEater = unit("black-grail/sin-eater");
    expect(isBuiltIn({ access: sinEater.equipmentAccess.find((a) => a.itemId === "tenderizer-maul") })).toBe(true);
    expect(isBuiltIn({ access: unit("new-antioch/yeoman").equipmentAccess.find((a) => a.itemId === "bolt-action-rifle") })).toBe(false);
    expect(isBuiltIn({ access: undefined })).toBe(false);
  });
});

describe("memberTraits: abilities", () => {
  it("lists the unit's abilities with their rule text, gated by the variant exactly as the TTS export gates them", () => {
    const plain = withMember("new-antioch", "new-antioch/lieutenant", []);
    expect(traitsOf(plain).abilities.map((t) => t.desc.name)).toEqual(["Hold Your Fire!", "Tough", "Leader"]);
    expect(traitsOf(plain).abilities.every((t) => t.desc.rules.length > 0)).toBe(true);
    const eire = withMember("new-antioch", "new-antioch/lieutenant", [], "new-antioch/eire-rangers");
    expect(traitsOf(eire).abilities.map((t) => t.desc.name)).toEqual(["Skirmisher", "Tough", "Leader"]);
    // Abilities gated on a subfaction's variant: the Heretic Captain is Strong only with the Leviathan Shoal.
    const raiders = (variantId?: string) => {
      const w = createWarband({ name: "r", factionId: "heretic-legion", subfactionId: "heretic-naval-raiders", ...(variantId ? { variantId } : {}) }, "r");
      return rosterReducer(w, { type: "add-member", unitId: "heretic-naval-raiders/heretic-captain", equipmentItemIds: [] });
    };
    expect(traitsOf(raiders("heretic-naval-raiders/the-leviathan-shoal")).abilities.map((t) => t.desc.name)).toContain("Strong");
    expect(traitsOf(raiders()).abilities.map((t) => t.desc.name)).not.toContain("Strong");
    for (const w of [plain, eire, raiders(), raiders("heretic-naval-raiders/the-leviathan-shoal")]) {
      const exported = toWarbandExport(w, data, { code: "T" }).members[0]!.abilities;
      expect(traitsOf(w).abilities.map((t) => ({ name: t.desc.name, text: t.desc.rules }))).toEqual(exported.map((a) => ({ name: a.name, text: a.text.trim() })));
    }
  });
});

describe("memberTraits: a gate that names a subfaction variant by name", () => {
  it("matches it through the subfaction's variants, as the export does (no such gate in today's data, so the case is built here)", () => {
    const captain = unit("heretic-naval-raiders/heretic-captain");
    const named = { ...captain, abilities: [...captain.abilities, { name: "Shoal Drill", text: "Only in the Shoal.", onlyWith: ["The Leviathan Shoal [Heretic Naval Raiders]"] }] };
    const raiders = (variantId?: string) => {
      const w = createWarband({ name: "r", factionId: "heretic-legion", subfactionId: "heretic-naval-raiders", ...(variantId ? { variantId } : {}) }, "r");
      return rosterReducer(w, { type: "add-member", unitId: captain.id, equipmentItemIds: [] });
    };
    const names = (w: Warband) => memberTraits(w.members[0]!, named, w, data, limitContext(w, data)).abilities.map((t) => t.desc.name);
    expect(names(raiders("heretic-naval-raiders/the-leviathan-shoal"))).toContain("Shoal Drill");
    expect(names(raiders())).not.toContain("Shoal Drill");
  });
});

describe("memberTraits: built-in kit", () => {
  it("lists fixed kit with where it sits, and profile kit from the unit card", () => {
    const grail = createWarband({ name: "g", factionId: "black-grail" }, "g");
    const sinEater = unit("black-grail/sin-eater");
    const w = rosterReducer(grail, { type: "add-member", unitId: sinEater.id, equipmentItemIds: defaultKit(sinEater, grail, data, limitContext(grail, data)) });
    expect(traitsOf(w).builtIn.map((t) => [t.desc.name, t.where])).toEqual([
      // In the data's `direct` group, not `headgear`, so the engine does not count it as Headgear.
      ["Combat Helmet", "Carried"],
      ["Reinforced Armour", "Torso"],
      ["Tenderizer Maul", "Melee hands"],
    ]);
    // The card's kit is built in; the card's "Ability" entries are abilities, as in the TTS export.
    const witchburner = withMember("new-antioch", "new-antioch/witchburner", ["combat-helmet", "reinforced-armour"]);
    expect(traitsOf(witchburner).builtIn.map((t) => [t.desc.name, t.where])).toEqual([
      ["Combat Helmet", "Carried"],
      ["Reinforced Armour", "Torso"],
      ["Gavel of Justice", "Profile"],
    ]);
    expect(traitsOf(witchburner).abilities.map((t) => t.desc.name)).toEqual(expect.arrayContaining(["Dignified Conduct", "Divine Judgement"]));
    const exported = toWarbandExport(witchburner, data, { code: "T" }).members[0]!;
    expect(traitsOf(witchburner).abilities.map((t) => t.desc.name)).toEqual(exported.abilities.map((a) => a.name));
    expect(profileKit(unit("new-antioch/yeoman"))).toEqual([]);
  });

  it("carries pending state, so a staged removal of built-in kit shows and can be kept", () => {
    const grail = createWarband({ name: "g", factionId: "black-grail" }, "g");
    const w = rosterReducer(grail, { type: "add-member", unitId: "black-grail/sin-eater", equipmentItemIds: ["combat-helmet", "reinforced-armour", "tenderizer-maul"] });
    const t = memberTraits(w.members[0]!, unit("black-grail/sin-eater"), w, data, limitContext(w, data), { adds: [], removes: ["tenderizer-maul"], upgradeAdds: [], upgradeRemoves: [] });
    expect(t.builtIn.find((x) => x.desc.name === "Tenderizer Maul")!.pending).toBe("remove");
  });

  it("ignores purchased kit", () => {
    expect(traitsOf(withMember("new-antioch", "new-antioch/yeoman", ["bolt-action-rifle", "bayonet"])).builtIn).toEqual([]);
  });
});

describe("mandatory upgrades", () => {
  it("are upgrades with a per-model minimum of one: the Atonement Bell, not Trench Mole or a conditional Leader", () => {
    const red = withMember("new-antioch", "new-antioch/crimson-communicant", [], "new-antioch/the-red-brigade");
    const ctx = limitContext(red, data);
    const communicant = unit("new-antioch/crimson-communicant");
    const bell = communicant.upgrades!.find((g) => g.name === "Atonement Bell")!;
    expect(isMandatoryUpgrade(bell, ctx)).toBe(true);
    expect(isMandatoryUpgrade(unit("new-antioch/yeoman").upgrades!.find((g) => g.name === "Trench Mole")!, ctx)).toBe(false);
    expect(isMandatoryUpgrade(unit("black-grail/plague-knight").upgrades!.find((g) => g.name === "Leader")!, ctx)).toBe(false);
    expect(defaultUpgrades(communicant, red, data, ctx)).toEqual([bell.bsId]);
    expect(defaultUpgrades(unit("new-antioch/yeoman"), red, data, ctx)).toEqual([]);
  });

  it("show under skills, and are the upgrades the Inventory must not offer to remove", () => {
    const communicant = unit("new-antioch/crimson-communicant");
    const bell = communicant.upgrades!.find((g) => g.name === "Atonement Bell")!;
    const w = withMember("new-antioch", communicant.id, [], "new-antioch/the-red-brigade", [bell.bsId]);
    const t = traitsOf(w);
    expect(t.skills.map((s) => s.desc.name)).toEqual(["Atonement Bell"]);
    expect(t.skills[0]!.desc.rules.length).toBeGreaterThan(0);
    expect([...lockedUpgradeIds(w.members[0]!, communicant, limitContext(w, data))]).toEqual([bell.bsId]);
    expect(upgradeFor(communicant, bell.bsId)?.name).toBe("Atonement Bell");
    const yeoman = withMember("new-antioch", "new-antioch/yeoman", [], undefined, ["9886-5b15-fa46-8d84"]);
    expect(traitsOf(yeoman).skills).toEqual([]);
    expect(lockedUpgradeIds(yeoman.members[0]!, unit("new-antioch/yeoman"), limitContext(yeoman, data)).size).toBe(0);
  });
});
