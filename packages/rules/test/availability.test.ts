import { describe, expect, it } from "vitest";
import { buildRulesData, readRulesFiles, RulesDataError } from "../src/load.js";
import { evaluateGates, limitContext, patronsForFaction, unitLimits, validateWarband, warbandThreshold } from "../src/validate.js";
import { data, member, newAntioch, repoRoot, warband } from "./fixtures.js";

describe("buildRulesData", () => {
  it("builds the same indexes from already-parsed JSON as loadRulesData does from disk", () => {
    const built = buildRulesData(readRulesFiles(repoRoot));
    expect(built.units.length).toBe(data().units.length);
    expect([...built.unitsById.keys()]).toEqual([...data().unitsById.keys()]);
    expect(built.thresholdTable).toEqual(data().thresholdTable);
    expect(validateWarband(newAntioch(), built)).toEqual(validateWarband(newAntioch(), data()));
  });

  it("names the file that failed", () => {
    const files = readRulesFiles(repoRoot);
    expect(() => buildRulesData({ ...files, units: { $schema: "tc-rules-units-v1", source: {}, units: [{ id: 1 }] } })).toThrow(RulesDataError);
    try {
      buildRulesData({ ...files, equipment: {} });
    } catch (e) {
      expect((e as RulesDataError).file).toBe("data/rules/equipment.json");
    }
  });
});

describe("warbandThreshold", () => {
  it("reads the table row for the game number", () => {
    expect(warbandThreshold(newAntioch(), data())).toMatchObject({ value: 700, clamped: false, row: { game: 1 } });
    expect(warbandThreshold(newAntioch({ gameNumber: 3 }), data()).value).toBe(900);
  });

  it("keeps a smaller-purse variant's shortfall in later games", () => {
    const papal = { variantId: "new-antioch/papal-states-intervention-force" };
    expect(warbandThreshold(newAntioch(papal), data()).value).toBe(500);
    expect(warbandThreshold(newAntioch({ ...papal, gameNumber: 4 }), data()).value).toBe(800);
  });

  it("flags a game past the table", () => {
    const t = warbandThreshold(newAntioch({ gameNumber: 40 }), data());
    expect(t.clamped).toBe(true);
    expect(t.value).toBe(t.row.threshold);
  });
});

describe("patronsForFaction", () => {
  it("matches campaign.json's spellings to factions.json", () => {
    const names = (id: string) => patronsForFaction(data(), id).map((p) => p.name);
    expect(names("new-antioch")).toEqual(["Temporal Lord", "Warrior Saint", "Learned Saint"]);
    expect(names("heretic-legion")).toEqual(["Infernal Noble", "Mammon"]);
    expect(names("court-of-the-seven-headed-serpent")).toEqual(["Infernal Noble", "Mammon"]);
    expect(names("nobody")).toEqual([]);
  });
});

describe("unitLimits", () => {
  it("applies the variant's modifiers to the base limits", () => {
    const d = data();
    const shock = d.unitsById.get("new-antioch/shocktrooper")!;
    expect(unitLimits(shock, limitContext(newAntioch(), d))).toEqual({ min: 0, max: 5 });
    expect(unitLimits(shock, limitContext(newAntioch({ variantId: "new-antioch/stosstruppen-of-the-free-state-of-prussia" }), d))).toEqual({ min: 2, max: 8 });
    expect(unitLimits(d.unitsById.get("new-antioch/yeoman")!, limitContext(newAntioch(), d))).toEqual({ min: null, max: null });
  });

  it("takes the converter's maxPerWarband when it is the tighter cap", () => {
    const d = data();
    const yeoman = d.unitsById.get("new-antioch/yeoman")!;
    const ctx = limitContext(newAntioch(), d);
    expect(unitLimits({ ...yeoman, limits: { min: null, max: 3 }, maxPerWarband: 1 }, ctx)).toEqual({ min: null, max: 1 });
    expect(unitLimits({ ...yeoman, limits: { min: null, max: 3 }, maxPerWarband: 5 }, ctx)).toEqual({ min: null, max: 3 });
    expect(unitLimits({ ...yeoman, limits: { min: null, max: null }, maxPerWarband: 2 }, ctx)).toEqual({ min: null, max: 2 });
  });
});

describe("evaluateGates", () => {
  it("closes a variant-locked unit and names the variant", () => {
    const d = data();
    const crimson = d.unitsById.get("new-antioch/crimson-communicant")!;
    const plain = newAntioch();
    expect(evaluateGates(crimson.onlyWith, crimson.onlyWithout, plain, d, limitContext(plain, d))).toEqual({
      open: false,
      blockedBy: [{ gate: "new-antioch/the-red-brigade", list: "onlyWith" }],
      unresolved: [],
    });
    const red = newAntioch({ variantId: "new-antioch/the-red-brigade" });
    expect(evaluateGates(crimson.onlyWith, crimson.onlyWithout, red, d, limitContext(red, d)).open).toBe(true);
  });

  it("closes on an excluded variant and reports which entry matched", () => {
    const d = data();
    const sniper = d.unitsById.get("new-antioch/sniper-priest")!;
    const abyssinia = newAntioch({ variantId: "new-antioch/expeditionary-forces-of-abyssinia" });
    expect(evaluateGates(sniper.onlyWith, sniper.onlyWithout, abyssinia, d, limitContext(abyssinia, d))).toEqual({
      open: false,
      blockedBy: [{ gate: "new-antioch/expeditionary-forces-of-abyssinia", list: "onlyWithout" }],
      unresolved: [],
    });
  });

  it("leaves a gate the data cannot count open but reported", () => {
    const d = data();
    const homunculus = d.unitsById.get("new-antioch/homunculus")!;
    const plain = newAntioch();
    expect(evaluateGates(homunculus.onlyWith, homunculus.onlyWithout, plain, d, limitContext(plain, d))).toEqual({
      open: true,
      blockedBy: [],
      unresolved: [{ gate: "Book of Golems [Campaign Rules]", list: "onlyWith" }],
    });
  });

  it("evaluates same-model item gates against the member", () => {
    const d = data();
    const yeoman = d.unitsById.get("new-antioch/yeoman")!;
    const row = yeoman.equipmentAccess.find((a) => a.itemId === "ammo/armour-piercing-bullets")!;
    const eire = { variantId: "new-antioch/eire-rangers" };
    const rifleman = member("new-antioch/yeoman", ["bolt-action-rifle"]);
    const w = warband("new-antioch", [rifleman], eire);
    const result = evaluateGates(row.onlyWith, row.onlyWithout, w, d, limitContext(w, d), { member: rifleman, unit: yeoman });
    expect(result.open).toBe(false);
    expect(result.blockedBy).toEqual([{ gate: "item:bolt-action-rifle", list: "onlyWithout" }]);

    const unarmed = member("new-antioch/yeoman", []);
    const w2 = warband("new-antioch", [unarmed], eire);
    expect(evaluateGates(row.onlyWith, row.onlyWithout, w2, d, limitContext(w2, d), { member: unarmed, unit: yeoman }).open).toBe(true);
  });

  it("counts roster-wide gates the way the validator does", () => {
    const d = data();
    const dog = d.unitsById.get("new-antioch/trench-dog")!;
    const without = newAntioch();
    expect(evaluateGates(dog.onlyWith, dog.onlyWithout, without, d, limitContext(without, d)).open).toBe(false);
    const fed = newAntioch({ members: [member("new-antioch/yeoman", ["dog-food"])] });
    expect(evaluateGates(dog.onlyWith, dog.onlyWithout, fed, d, limitContext(fed, d)).open).toBe(true);
  });
});
