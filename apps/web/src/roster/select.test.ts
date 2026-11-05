import { evaluateGates, limitContext, loadRulesData, type RulesData, type Warband } from "@tc/rules";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createWarband, rosterReducer } from "./reducer.js";
import { armouryGroups, defaultKit, gateStatus, hiddenText, limitText, memberTitle, priceText, unitRows, upgradeRows } from "./select.js";

let data: RulesData;
beforeAll(() => {
  data = loadRulesData(resolve(import.meta.dirname, "../../../.."));
});

const antioch = (variantId?: string): Warband => createWarband({ name: "t", factionId: "new-antioch", ...(variantId ? { variantId } : {}) }, "w");
const withYeoman = (w: Warband, items: string[] = []) => rosterReducer(w, { type: "add-member", unitId: "new-antioch/yeoman", equipmentItemIds: items });
const ctxFor = (w: Warband) => limitContext(w, data);
const yeomanUnit = () => data.unitsById.get("new-antioch/yeoman")!;
const armouryNames = (w: Warband) => armouryGroups(w.members[0]!, yeomanUnit(), w, data, ctxFor(w)).groups.flatMap((g) => g.rows.map((r) => r.item.name));
const upgradeNames = (w: Warband) => upgradeRows(w.members[0]!, yeomanUnit(), w, data, ctxFor(w)).rows.map((r) => r.upgrade.name);

describe("gateStatus", () => {
  it("closes what the engine closes, hides what the engine cannot count, and ignores uncountable exclusions", () => {
    expect(gateStatus({ open: true, blockedBy: [], unresolved: [] })).toBe("open");
    expect(gateStatus({ open: false, blockedBy: [{ gate: "x", list: "onlyWith" }], unresolved: [] })).toBe("closed");
    expect(gateStatus({ open: true, blockedBy: [], unresolved: [{ gate: "Book of Golems [Campaign Rules]", list: "onlyWith" }] })).toBe("uncheckable");
    expect(gateStatus({ open: true, blockedBy: [], unresolved: [{ gate: "Remnants of Byzantium [New Antioch]", list: "onlyWithout" }] })).toBe("open");
    expect(gateStatus({ open: false, blockedBy: [{ gate: "v", list: "onlyWithout" }], unresolved: [{ gate: "x", list: "onlyWith" }] })).toBe("closed");
  });
});

describe("unitRows", () => {
  const names = (w: Warband) => unitRows(w, data, ctxFor(w)).rows.map((r) => r.unit.name);

  it("lists variant-locked units only under their variant", () => {
    expect(names(antioch())).not.toContain("Crimson Communicant");
    expect(names(antioch("new-antioch/the-red-brigade"))).toContain("Crimson Communicant");
    expect(names(antioch("new-antioch/expeditionary-forces-of-abyssinia"))).not.toContain("Sniper Priest");
    expect(names(antioch())).toContain("Sniper Priest");
  });

  it("lists a subfaction's own units instead of its faction's core list", () => {
    const raiders = createWarband({ name: "t", factionId: "heretic-legion", subfactionId: "heretic-naval-raiders" }, "w");
    const listed = names(raiders);
    expect(listed).toEqual(expect.arrayContaining(["Heretic Captain", "Heretic Raider", "Anointed Heretic Raider", "Sea Hag", "Abyssal Commando", "Drowned Chorister", "Wretched"]));
    expect(listed).not.toContain("Heretic Priest");
    expect(listed).not.toContain("Heretic Trooper");
    const core = names(createWarband({ name: "t", factionId: "heretic-legion" }, "w"));
    expect(core).toContain("Heretic Priest");
    expect(core).not.toContain("Heretic Captain");
    const shoal = createWarband({ name: "t", factionId: "heretic-legion", subfactionId: "heretic-naval-raiders", variantId: "heretic-naval-raiders/the-leviathan-shoal" }, "w");
    expect(unitRows(shoal, data, ctxFor(shoal)).rows.find((r) => r.unit.name === "Anointed Heretic Raider")).toMatchObject({ max: 4 });
    expect(unitRows(raiders, data, ctxFor(raiders)).rows.find((r) => r.unit.name === "Anointed Heretic Raider")).toMatchObject({ max: 2 });
  });

  it("leaves out units behind gates the data cannot count and only tallies them", () => {
    const listing = unitRows(antioch(), data, ctxFor(antioch()));
    const listed = listing.rows.map((r) => r.unit.name);
    expect(listed).not.toContain("Homunculus");
    expect(listed).not.toContain("Disciple of St. Roch");
    expect(listing.uncheckable).toBe(2);
    expect(listed.join()).not.toMatch(/not checked/);
  });

  it("leaves out a unit waiting on something the roster can count until it is there", () => {
    expect(names(antioch())).not.toContain("Trench Dog");
    const fed = withYeoman(antioch(), ["dog-food"]);
    const dog = unitRows(fed, data, ctxFor(fed)).rows.find((r) => r.unit.name === "Trench Dog");
    expect(dog).toMatchObject({ max: 1, atMax: false });
    expect(unitRows(fed, data, ctxFor(fed)).uncheckable).toBe(2);
  });

  it("counts members and reports the variant-adjusted limits", () => {
    let w = antioch();
    const lt = () => unitRows(w, data, ctxFor(w)).rows.find((r) => r.unit.name === "Lieutenant")!;
    expect(lt()).toMatchObject({ count: 0, min: 1, max: 1, atMax: false });
    w = rosterReducer(w, { type: "add-member", unitId: "new-antioch/lieutenant" });
    expect(lt()).toMatchObject({ count: 1, atMax: true });
    const prussia = antioch("new-antioch/stosstruppen-of-the-free-state-of-prussia");
    expect(unitRows(prussia, data, ctxFor(prussia)).rows.find((r) => r.unit.name === "Shocktrooper")).toMatchObject({ min: 2, max: 8 });
  });

  it("never lists a fireteam wrapper", () => {
    for (const faction of data.factions) {
      const w = createWarband({ name: "f", factionId: faction.id }, "f");
      expect(unitRows(w, data, ctxFor(w)).rows.some((r) => r.unit.kind === "fireteam")).toBe(false);
    }
  });
});

describe("armouryGroups", () => {
  it("groups a Yeoman's armoury with faction prices, weapons first, variant-locked rows absent", () => {
    const w = withYeoman(antioch());
    const listing = armouryGroups(w.members[0]!, yeomanUnit(), w, data, ctxFor(w));
    expect(listing.groups.map((g) => g.label).slice(0, 3)).toEqual(["Ranged, 1-handed", "Ranged, 2-handed", "Bayonets"]);
    const all = listing.groups.flatMap((g) => g.rows);
    expect(all.find((r) => r.item.name === "Bolt-Action Rifle")?.cost).toEqual({ id: "bolt-action-rifle", ducats: 5, glory: 0 });
    expect(all.map((r) => r.item.name)).not.toContain("Holy Water of Lalibela");
    expect(all.map((r) => r.item.name)).not.toContain("Armour Piercing Bullets");
    expect(all.map((r) => r.item.name)).toContain("Bayonet");
  });

  it("re-evaluates same-model gates per member: a row blocked by this model's kit disappears and comes back", () => {
    const eire = "new-antioch/eire-rangers";
    expect(armouryNames(withYeoman(antioch(eire), ["bolt-action-rifle"]))).not.toContain("Armour Piercing Bullets");
    expect(armouryNames(withYeoman(antioch(eire)))).toContain("Armour Piercing Bullets");
  });

  it("judges same-model gates by this member's kit, not by what the rest of the roster carries", () => {
    const eire = "new-antioch/eire-rangers";
    const two = withYeoman(withYeoman(antioch(eire), ["bolt-action-rifle"]));
    const names = (member: (typeof two.members)[number]) => armouryGroups(member, yeomanUnit(), two, data, ctxFor(two)).groups.flatMap((g) => g.rows.map((r) => r.item.name));
    expect(names(two.members[0]!)).not.toContain("Armour Piercing Bullets");
    expect(names(two.members[1]!)).toContain("Armour Piercing Bullets");

    const lieutenant = data.unitsById.get("new-antioch/lieutenant")!;
    let w = rosterReducer(antioch(), { type: "add-member", unitId: "new-antioch/lieutenant" });
    w = rosterReducer(w, { type: "add-member", unitId: "new-antioch/yeoman", equipmentItemIds: ["machine-armour"] });
    const forLieutenant = armouryGroups(w.members[0]!, lieutenant, w, data, ctxFor(w)).groups.flatMap((g) => g.rows.map((r) => r.item.name));
    expect(forLieutenant).not.toContain("Heavy Ballistic Shield");
  });

  it("shows a same-model requirement only once the model meets it", () => {
    const lieutenant = data.unitsById.get("new-antioch/lieutenant")!;
    const shield = lieutenant.equipmentAccess.find((a) => a.itemId === "heavy-ballistic-shield")!;
    expect(shield.onlyWith?.some((g) => g.startsWith("item:"))).toBe(true);
    const names = (items: string[]) => {
      const w = rosterReducer(antioch(), { type: "add-member", unitId: "new-antioch/lieutenant", equipmentItemIds: items });
      return armouryGroups(w.members[0]!, lieutenant, w, data, ctxFor(w)).groups.flatMap((g) => g.rows.map((r) => r.item.name));
    };
    expect(names([])).not.toContain("Heavy Ballistic Shield");
    expect(names(["machine-armour"])).toContain("Heavy Ballistic Shield");
  });

  it("leaves out rows gated on campaign selections and tallies them", () => {
    const w = withYeoman(antioch());
    const uncheckableRows = yeomanUnit().equipmentAccess.filter(
      (a) => gateStatus(evaluateGates(a.onlyWith, a.onlyWithout, w, data, ctxFor(w), { member: w.members[0]!, unit: yeomanUnit() })) === "uncheckable",
    );
    const listing = armouryGroups(w.members[0]!, yeomanUnit(), w, data, ctxFor(w));
    expect(listing.uncheckable).toBe(uncheckableRows.length);
    for (const a of uncheckableRows) expect(listing.groups.flatMap((g) => g.rows.map((r) => r.item.id))).not.toContain(a.itemId);
  });

  it("tracks per-model counts against the row's limit", () => {
    const row = (w: Warband) => armouryGroups(w.members[0]!, yeomanUnit(), w, data, ctxFor(w)).groups.flatMap((g) => g.rows).find((r) => r.item.name === "Standard Armour")!;
    expect(row(withYeoman(antioch()))).toMatchObject({ count: 0, max: 1, atMax: false });
    expect(row(withYeoman(antioch(), ["standard-armour"]))).toMatchObject({ count: 1, max: 1, atMax: true });
  });
});

describe("upgradeRows", () => {
  it("lists variant-locked upgrades only under their variant and counts the ones taken", () => {
    expect(upgradeNames(withYeoman(antioch()))).toContain("Trench Mole");
    expect(upgradeNames(withYeoman(antioch()))).not.toContain("Blood Cloak");
    const red = withYeoman(antioch("new-antioch/the-red-brigade"));
    expect(upgradeNames(red)).toContain("Blood Cloak");
    const cloaked = rosterReducer(red, { type: "add-upgrade", memberId: "m1", upgradeId: "114b-97a7-6011-55c2" });
    const row = upgradeRows(cloaked.members[0]!, yeomanUnit(), cloaked, data, ctxFor(cloaked)).rows.find((r) => r.upgrade.name === "Blood Cloak")!;
    expect(row).toMatchObject({ count: 1, max: 1, atMax: true, cost: { ducats: 5, glory: 0 } });
  });

  it("leaves out upgrades that need a campaign selection, keeps ones that only exclude one", () => {
    const plain = withYeoman(antioch());
    const listing = upgradeRows(plain.members[0]!, yeomanUnit(), plain, data, ctxFor(plain));
    const names = listing.rows.map((r) => r.upgrade.name);
    expect(names).not.toContain("Phosphorous Rounds");
    expect(names).not.toContain("Menaulatoi");
    expect(names).toContain("Trench Mole");
    expect(listing.uncheckable).toBeGreaterThanOrEqual(2);
    const abyssinia = withYeoman(antioch("new-antioch/expeditionary-forces-of-abyssinia"));
    expect(upgradeNames(abyssinia)).toContain("Vanguard");
    expect(upgradeNames(plain)).not.toContain("Vanguard");
  });
});

describe("defaultKit", () => {
  it("lists a unit's fixed rows", () => {
    const grail = createWarband({ name: "g", factionId: "black-grail" }, "g");
    const sinEater = data.unitsById.get("black-grail/sin-eater")!;
    expect(defaultKit(sinEater, grail, data, ctxFor(grail))).toEqual(["combat-helmet", "reinforced-armour", "tenderizer-maul"]);
    expect(defaultKit(yeomanUnit(), antioch(), data, ctxFor(antioch()))).toEqual([]);
  });
});

describe("labels", () => {
  it("renders limits, prices, titles and the hidden-options line for people", () => {
    expect(limitText(1, 1)).toBe("1");
    expect(limitText(0, 5)).toBe("0–5");
    expect(limitText(null, 2)).toBe("0–2");
    expect(limitText(null, null)).toBe("any");
    expect(limitText(2, null)).toBe("2+");
    expect(priceText({ ducats: 30, glory: 0 })).toBe("30d");
    expect(priceText({ ducats: 0, glory: 7 })).toBe("7g");
    expect(priceText({ ducats: 110, glory: 4 })).toBe("110d + 4g");
    expect(priceText({ ducats: 0, glory: 0 })).toBe("0d");
    const lieutenant = data.unitsById.get("new-antioch/lieutenant")!;
    expect(memberTitle({ id: "m1", unitId: lieutenant.id, equipmentItemIds: [] }, lieutenant)).toBe("Lieutenant");
    expect(memberTitle({ id: "m1", unitId: lieutenant.id, equipmentItemIds: [], name: "Captain Vane" }, lieutenant)).toBe("Captain Vane (Lieutenant)");
    expect(hiddenText(1)).toBe("1 option hidden by campaign rules we can't check yet");
    expect(hiddenText(3)).toBe("3 options hidden by campaign rules we can't check yet");
  });
});
