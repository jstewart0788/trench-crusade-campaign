import { describe, expect, it } from "vitest";
import { warbandCost } from "../src/cost.js";
import type { Warband } from "../src/roster.js";
import { MAX_ELITES, validateWarband } from "../src/validate.js";
import { codes, data, member, newAntioch, withMembers } from "./fixtures.js";

const validate = (w: Warband) => validateWarband(w, data());

describe("validateWarband: legal warbands", () => {
  it("accepts a starting New Antioch warband within 700 ducats", () => {
    const w = newAntioch();
    const result = validate(w);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(warbandCost(w, data()).ducats).toBeLessThanOrEqual(700);
  });

  it("accepts a variant warband with its variant-only unit and a sponsoring patron", () => {
    const w = withMembers([member("new-antioch/crimson-communicant", ["sword-axe"])], {
      variantId: "new-antioch/the-red-brigade",
      patronId: "temporal-lord",
    });
    expect(validate(w).errors).toEqual([]);
  });

  it("lets a STRONG model use a 2-Handed Melee Weapon as 1-Handed and carry two HEAVY pieces", () => {
    const strong = member("new-antioch/mechanized-heavy-infantry", ["great-sword-axe", "sword-axe", "grenade-launcher"]);
    expect(validate(withMembers([strong])).errors).toEqual([]);
    const weak = member("new-antioch/yeoman", ["great-sword-axe", "sword-axe", "grenade-launcher"]);
    expect(codes(validate(withMembers([weak])))).toEqual(expect.arrayContaining(["battlekit-melee", "battlekit-heavy"]));
  });

  it("allows a Shield with a Shield Combo weapon, warning that the shield side is assumed", () => {
    const w = withMembers([member("new-antioch/yeoman", ["trench-shield", "shotgun", "bayonet"])]);
    const result = validate(w);
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((x) => x.code)).toEqual(["unmodelled", "unmodelled"]);
    expect(result.warnings[0]?.message).toContain("Shield Combo");
  });

  it("drops the Lieutenant minimum for the Papal States variant via the limits text", () => {
    const w = newAntioch({ variantId: "new-antioch/papal-states-intervention-force" });
    w.members = w.members.filter((m) => m.unitId !== "new-antioch/lieutenant");
    w.members.push(member("new-antioch/trench-cleric", []));
    expect(codes(validate(w))).not.toContain("unit-min");
    expect(codes(validate(newAntioch({ members: w.members })))).toContain("unit-min");
  });

  it("uses the campaign threshold table for later games", () => {
    const many = Array.from({ length: 14 }, () => member("new-antioch/yeoman", ["semi-automatic-rifle", "combat-helmet", "gas-mask", "shovel"]));
    const w = withMembers(many, { gameNumber: 5 }); // 318 + 14 x 60 = 1158 > 1100
    expect(codes(validate(w))).toContain("over-threshold");
    expect(codes(validate({ ...w, gameNumber: 8 }))).not.toContain("over-threshold"); // 1400
    expect(codes(validateWarband(w, data(), { threshold: 2000 }))).not.toContain("over-threshold");
  });

  it("warns instead of failing when the threshold table runs out", () => {
    const result = validate(newAntioch({ gameNumber: 30 }));
    expect(result.ok).toBe(true);
    expect(result.warnings[0]?.message).toContain("Threshold table ends");
  });
});

describe("validateWarband: one failing case per error code", () => {
  const expectCode = (w: Warband, code: string) => {
    const result = validate(w);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain(code);
    return result;
  };

  it("roster-invalid", () => {
    expectCode({ ...newAntioch(), gameNumber: 0 }, "roster-invalid");
  });

  it("faction-unknown", () => {
    expectCode(newAntioch({ factionId: "atlantis" }), "faction-unknown");
  });

  it("variant-unknown", () => {
    expectCode(newAntioch({ variantId: "heretic-legion/trench-ghosts" }), "variant-unknown");
  });

  it("patron-unknown / patron-faction", () => {
    expectCode(newAntioch({ patronId: "nobody" }), "patron-unknown");
    expectCode(newAntioch({ patronId: "order-of-the-fly" }), "patron-faction");
    expect(validate(newAntioch({ patronId: "warrior-saint" })).ok).toBe(true);
  });

  it("unit-unknown", () => {
    expectCode(withMembers([member("new-antioch/dragoon")]), "unit-unknown");
  });

  it("unit-faction: a unit from another faction", () => {
    expect(data().unitsById.has("heretic-legion/heretic-trooper")).toBe(true);
    const result = expectCode(withMembers([member("heretic-legion/heretic-trooper")]), "unit-faction");
    expect(result.errors[0]?.unitId).toBe("heretic-legion/heretic-trooper");
  });

  it("over-threshold: a starting warband over 700 ducats", () => {
    const w = withMembers(Array.from({ length: 7 }, () => member("new-antioch/yeoman", ["semi-automatic-rifle", "combat-helmet", "gas-mask", "shovel"]))); // 318 + 7 x 60
    const result = expectCode(w, "over-threshold");
    expect(result.errors[0]?.message).toContain("738");
    expect(result.errors[0]?.message).toContain("700");
  });

  it("over-glory: Glory Point spend above the pool", () => {
    const w = withMembers([member("new-antioch/scripture-guardian")], { glory: 6 });
    expectCode(w, "over-glory");
    expect(codes(validate({ ...w, glory: 7 }))).not.toContain("over-glory");
    expect(codes(validate({ ...w, glory: undefined }))).not.toContain("over-glory");
  });

  it("unit-min: no Lieutenant", () => {
    const w = newAntioch();
    w.members = w.members.filter((m) => m.unitId !== "new-antioch/lieutenant");
    expectCode(w, "unit-min");
  });

  it("unit-max: two leaders", () => {
    const result = expectCode(withMembers([member("new-antioch/lieutenant")]), "unit-max");
    expect(result.errors.filter((e) => e.code === "unit-max")).toHaveLength(1);
    expect(result.errors[0]?.unitId).toBe("new-antioch/lieutenant");
  });

  it("mercenary-limit: the same 0-1 mercenary hired twice", () => {
    const w = withMembers([member("new-antioch/scripture-guardian"), member("mercenary/scripture-guardian")]);
    const result = expectCode(w, "mercenary-limit");
    expect(codes(result)).not.toContain("unit-max");
    expect(validate(withMembers([member("new-antioch/scripture-guardian")])).ok).toBe(true);
  });

  it("variant-locked: a variant-only unit without the variant", () => {
    const result = expectCode(withMembers([member("new-antioch/crimson-communicant")]), "variant-locked");
    expect(result.errors[0]?.message).toContain("the-red-brigade");
  });

  it("variant-excluded: a unit the variant removes", () => {
    const w = withMembers([member("new-antioch/sniper-priest")], { variantId: "new-antioch/expeditionary-forces-of-abyssinia" });
    expectCode(w, "variant-excluded");
    expect(validate(withMembers([member("new-antioch/sniper-priest")])).ok).toBe(true);
  });

  it("elite-cap: more than six ELITE models", () => {
    // Trench Pilgrims can field 7 ELITE: Castigator, Communicant, War Prophet, 3 Huscarls, Witchburner.
    const w: Warband = {
      id: "w2",
      name: "Pilgrims",
      factionId: "trench-pilgrims",
      gameNumber: 1,
      members: [
        member("trench-pilgrims/castigator"),
        member("trench-pilgrims/communicant"),
        member("trench-pilgrims/war-prophet"),
        member("trench-pilgrims/huscarl"),
        member("trench-pilgrims/huscarl"),
        member("trench-pilgrims/huscarl"),
        member("trench-pilgrims/witchburner"),
      ],
    };
    const result = expectCode(w, "elite-cap");
    expect(result.errors.find((e) => e.code === "elite-cap")?.message).toContain(String(MAX_ELITES));
  });

  it("item-unknown", () => {
    expectCode(withMembers([member("new-antioch/yeoman", ["laser-sword"])]), "item-unknown");
  });

  it("item-not-available: equipment not in the unit's armoury", () => {
    const result = expectCode(withMembers([member("new-antioch/yeoman", ["iron-wall-kalkan"])]), "item-not-available");
    expect(result.errors[0]).toMatchObject({ itemId: "iron-wall-kalkan", unitId: "new-antioch/yeoman" });
  });

  it("item-variant-locked: an item the armoury only opens for a variant", () => {
    expectCode(withMembers([member("new-antioch/trench-cleric", ["holy-smoke"])]), "item-variant-locked");
    const ok = withMembers([member("new-antioch/trench-cleric", ["holy-smoke"])], { variantId: "new-antioch/stosstruppen-of-the-free-state-of-prussia" });
    expect(codes(validate(ok))).not.toContain("item-variant-locked");
    const excluded = withMembers([member("new-antioch/yeoman", ["great-hammer-maul"])], { variantId: "new-antioch/eire-rangers" });
    expectCode(excluded, "item-variant-locked");
  });

  it("item-max-per-model", () => {
    const result = expectCode(withMembers([member("new-antioch/yeoman", ["gas-mask", "gas-mask"])]), "item-max-per-model");
    expect(result.errors[0]?.itemId).toBe("gas-mask");
  });

  it("item-max-per-warband: Limit X across the whole warband", () => {
    const w = withMembers([member("new-antioch/yeoman", ["automatic-rifle"]), member("new-antioch/yeoman", ["automatic-rifle"])]);
    const result = expectCode(w, "item-max-per-warband");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain("limit 1");
    expect(validate(withMembers([member("new-antioch/yeoman", ["automatic-rifle"])])).ok).toBe(true);
  });

  it("upgrade-unknown / upgrade-variant-locked", () => {
    expectCode(withMembers([member("new-antioch/yeoman", [], ["not-an-upgrade"])]), "upgrade-unknown");
    const berserker = data().unitsById.get("new-antioch/lieutenant")!.upgrades!.find((g) => g.name === "Berserker")!;
    const w = newAntioch();
    w.members[0]!.upgradeIds = [berserker.bsId];
    expectCode(w, "upgrade-variant-locked");
    expect(validate({ ...w, variantId: "new-antioch/eire-rangers" }).ok).toBe(true);
  });

  it("battlekit-ranged: two 2-Handed ranged weapons", () => {
    expectCode(withMembers([member("new-antioch/yeoman", ["bolt-action-rifle", "shotgun"])]), "battlekit-ranged");
    expectCode(withMembers([member("new-antioch/yeoman", ["bolt-action-rifle", "pistol"])]), "battlekit-ranged");
    expectCode(withMembers([member("new-antioch/yeoman", ["pistol", "pistol", "pistol"])]), "battlekit-ranged");
    expect(validate(withMembers([member("new-antioch/yeoman", ["pistol", "pistol"])])).ok).toBe(true);
  });

  it("battlekit-melee: two 2-Handed melee weapons", () => {
    expectCode(withMembers([member("new-antioch/yeoman", ["great-sword-axe", "polearm"])]), "battlekit-melee");
    expect(validate(withMembers([member("new-antioch/yeoman", ["sword-axe", "trench-knife"])])).ok).toBe(true);
  });

  it("battlekit-grenade: two types of grenade", () => {
    expectCode(withMembers([member("new-antioch/yeoman", ["frag-grenades", "incendiary-grenades"])]), "battlekit-grenade");
  });

  it("battlekit-armour: two suits of armour", () => {
    expectCode(withMembers([member("new-antioch/sniper-priest", ["standard-armour", "reinforced-armour"])]), "battlekit-armour");
  });

  it("battlekit-shield: two shields", () => {
    expectCode(withMembers([member("new-antioch/yeoman", ["trench-shield", "heavy-ballistic-shield"])]), "battlekit-shield");
  });

  it("battlekit-headgear: two pieces of headgear", () => {
    expectCode(withMembers([member("new-antioch/yeoman", ["combat-helmet", "combat-helmet"])]), "battlekit-headgear");
  });

  it("battlekit-duplicate: the same equipment twice", () => {
    expectCode(withMembers([member("new-antioch/yeoman", ["shovel", "shovel"])]), "battlekit-duplicate");
  });

  it("battlekit-heavy: two HEAVY pieces on a model that is not STRONG", () => {
    expectCode(withMembers([member("new-antioch/yeoman", ["machine-gun", "great-sword-axe"])]), "battlekit-heavy");
  });

  it("battlekit-hands: a shield with a 2-Handed weapon that lacks Shield Combo", () => {
    expectCode(withMembers([member("new-antioch/yeoman", ["trench-shield", "bolt-action-rifle"])]), "battlekit-hands");
    expectCode(withMembers([member("new-antioch/yeoman", ["trench-shield", "pistol", "pistol"])]), "battlekit-hands");
    expectCode(withMembers([member("new-antioch/yeoman", ["troop-flag", "trench-shield", "sword-axe"])]), "battlekit-hands");
    expectCode(withMembers([member("new-antioch/yeoman", ["troop-flag", "polearm"])]), "battlekit-hands");
    expect(validate(withMembers([member("new-antioch/yeoman", ["troop-flag", "sword-axe", "pistol"])])).ok).toBe(true);
  });

  it("bayonet-lug: a bayonet without a weapon to mount it on", () => {
    expectCode(withMembers([member("new-antioch/yeoman", ["bayonet"])]), "bayonet-lug");
    expectCode(withMembers([member("new-antioch/yeoman", ["bayonet", "pistol"])]), "bayonet-lug");
  });
});

describe("validateWarband: unmodelled rules surface as warnings, not errors", () => {
  it("does not block a unit gated on a campaign-rules selection the data lacks", () => {
    const result = validate(withMembers([member("new-antioch/homunculus")]));
    expect(codes(result)).not.toContain("variant-locked");
    expect(result.warnings.some((w) => w.unitId === "new-antioch/homunculus" && w.message.includes("Book of Golems"))).toBe(true);
  });

  it("names the unresolved modifier when a limit error might be lifted by it", () => {
    const w = withMembers(Array.from({ length: 5 }, () => member("new-antioch/shocktrooper", [])));
    const result = validate(w);
    expect(codes(result)).toContain("unit-max");
    expect(result.warnings.some((x) => x.unitId === "new-antioch/shocktrooper" && x.message.includes("Organized Shocktroopers"))).toBe(true);
  });

  it("resolves a limit that depends on an item in the roster (Trench Dog needs Dog Food)", () => {
    expect(codes(validate(withMembers([member("new-antioch/trench-dog")])))).toContain("mercenary-limit");
    const fed = withMembers([member("new-antioch/trench-dog"), member("new-antioch/yeoman", ["dog-food"])]);
    expect(codes(validate(fed))).not.toContain("mercenary-limit");
  });
});
