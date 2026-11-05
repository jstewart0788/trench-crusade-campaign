import { describe, expect, it } from "vitest";
import { warbandCost } from "../src/cost.js";
import type { RulesData } from "../src/load.js";
import type { Warband, WarbandMember } from "../src/roster.js";
import { MAX_ELITES, validateWarband, type RosterErrorCode } from "../src/validate.js";
import { codes, data, member, newAntioch, warband, withMembers } from "./fixtures.js";

const validate = (w: Warband) => validateWarband(w, data());

/** Asserts the exact multiset of error codes, so an unrelated error cannot hide behind the expected one. */
const expectCode = (w: Warband, ...expected: RosterErrorCode[]) => {
  const result = validate(w);
  expect([...codes(result)].sort()).toEqual([...expected].sort());
  expect(result.ok).toBe(expected.length === 0);
  return result;
};

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
    expect(validate({ ...w, glory: 7 }).errors).toEqual([]);
  });

  it("over-glory: a new warband with no declared pool has no Glory to spend (p10)", () => {
    const w = withMembers([member("new-antioch/scripture-guardian")]);
    expect(w.glory).toBeUndefined();
    const result = expectCode(w, "over-glory");
    expect(result.errors[0]?.message).toContain("only 0 are available");
    expect(result.warnings).toEqual([]);
    // Later in a campaign the pool is state the roster may not carry: skip the check, but say so.
    const later = validate({ ...w, gameNumber: 2 });
    expect(later.errors).toEqual([]);
    expect(later.warnings).toEqual([{ code: "glory-unknown", message: expect.stringContaining("7 Glory Points") }]);
    expect(validate(newAntioch({ gameNumber: 2 })).warnings).toEqual([]);
  });

  it("over-threshold / over-glory: a variant with its own purse (Papal States: 500 ducats and 11 glory, p35)", () => {
    const papal = { variantId: "new-antioch/papal-states-intervention-force" };
    const cleric = member("new-antioch/trench-cleric", ["sword-axe"]);
    const yeomen = (n: number) => Array.from({ length: n }, () => member("new-antioch/yeoman", ["bolt-action-rifle", "standard-armour", "combat-helmet"]));
    const w = warband("new-antioch", [cleric, ...yeomen(9)], papal); // 64 + 9 x 55 = 559
    expect(warbandCost(w, data()).ducats).toBe(559);
    expect(expectCode(w, "over-threshold").errors[0]?.message).toContain("Threshold Value is 500");
    // "Their Threshold Value is reduced by 200" in every later game: 800 - 200 for game 2.
    expect(validate({ ...w, gameNumber: 2 }).errors).toEqual([]);
    const game2 = expectCode({ ...w, gameNumber: 2, members: [...w.members, ...yeomen(1)] }, "over-threshold");
    expect(game2.errors[0]?.message).toContain("Threshold Value is 600");

    const hired = warband("new-antioch", [cleric, member("new-antioch/scripture-guardian", ["sword-axe", "trench-club"])], papal);
    expect(warbandCost(hired, data()).glory).toBe(7);
    expect(validate(hired).errors).toEqual([]);
    expectCode({ ...hired, glory: 6 }, "over-glory");
    expectCode({ ...hired, variantId: undefined, members: [member("new-antioch/lieutenant"), hired.members[1]!] }, "over-glory");
  });

  it("unit-min: no Lieutenant", () => {
    const w = newAntioch();
    w.members = w.members.filter((m) => m.unitId !== "new-antioch/lieutenant");
    expectCode(w, "unit-min");
  });

  it("unit-min: only binds on a unit the roster can take", () => {
    // Matagot Hag (min 1) is The Great Hunger's leader; a standard Black Grail warband does not need one.
    const thralls = () => [member("black-grail/grail-thrall"), member("black-grail/grail-thrall")];
    expect(validate(warband("black-grail", [member("black-grail/lord-of-tumours", ["sword-axe"]), ...thralls()])).errors).toEqual([]);
    const hunger = expectCode(warband("black-grail", thralls(), { variantId: "black-grail/the-great-hunger" }), "unit-min");
    expect(hunger.errors[0]?.unitId).toBe("black-grail/matagot-hag");
    // Chieftain (min 1) is gated on a selection the data does not model; the War Prophet leads.
    expect(validate(warband("trench-pilgrims", [member("trench-pilgrims/war-prophet", ["sword-axe"]), member("trench-pilgrims/trench-pilgrim")])).errors).toEqual([]);
    // The Yüzbaşı (min 1) is excluded under Fida'i of Alamut and the House of Wisdom (p89, p94) but required otherwise.
    const azebs = () => [member("iron-sultanate/azeb", ["jezzail"]), member("iron-sultanate/azeb", ["jezzail"])];
    expect(expectCode(warband("iron-sultanate", azebs()), "unit-min").errors[0]?.unitId).toBe("iron-sultanate/yuzbasi-captain");
    expect(validate(warband("iron-sultanate", [member("iron-sultanate/sultanate-assassin", ["sword-axe"]), ...azebs()], { variantId: "iron-sultanate/fida-i-of-alamut-the-cabal-of-assassins" })).errors).toEqual([]);
  });

  it("unit-max: two leaders", () => {
    const result = expectCode(withMembers([member("new-antioch/lieutenant")]), "unit-max");
    expect(result.errors[0]?.unitId).toBe("new-antioch/lieutenant");
  });

  it("unit-max: a 0-1 unit whose own repeat clause names itself (Brazen Bull, p88)", () => {
    const bulls = (n: number) => Array.from({ length: n }, () => member("iron-sultanate/brazen-bull"));
    const lead = () => member("iron-sultanate/yuzbasi-captain", ["sword-axe"]);
    expect(validate(warband("iron-sultanate", [lead(), ...bulls(1)])).errors).toEqual([]);
    const result = expectCode(warband("iron-sultanate", [lead(), ...bulls(2)]), "unit-max");
    expect(result.errors[0]?.message).toContain("at most 1 per warband");
    expect(result.warnings.some((x) => x.unitId === "iron-sultanate/brazen-bull" && x.message.includes("repeat per Brazen Bull"))).toBe(true);
    expectCode(warband("iron-sultanate", [lead(), ...bulls(3)]), "unit-max");
  });

  it("mercenary-limit: the same 0-1 mercenary hired twice", () => {
    const w = withMembers([member("new-antioch/scripture-guardian"), member("mercenary/scripture-guardian")], { glory: 14 });
    expectCode(w, "mercenary-limit");
    expect(validate(withMembers([member("new-antioch/scripture-guardian")], { glory: 7 })).ok).toBe(true);
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
        // The Pilgrims' Witchburner comes with Combat Helmet and Reinforced Armour (fixed rows).
        member("trench-pilgrims/witchburner", ["combat-helmet", "reinforced-armour"]),
      ],
      glory: 5, // the Witchburner's hire price
    };
    const result = expectCode(w, "elite-cap");
    expect(result.errors.find((e) => e.code === "elite-cap")?.message).toContain(String(MAX_ELITES));
  });

  it("item-fixed-missing: a model without the kit its entry gives it", () => {
    // Black Grail Sin Eater: Combat Helmet, Reinforced Armour and Tenderizer Maul are fixed rows.
    const kit = ["combat-helmet", "reinforced-armour", "tenderizer-maul"];
    const full = warband("black-grail", [member("black-grail/sin-eater", kit)]);
    expect(validate(full).errors.filter((e) => e.code === "item-fixed-missing")).toEqual([]);
    const bare = member("black-grail/sin-eater", ["combat-helmet", "reinforced-armour"]);
    const result = validate(warband("black-grail", [bare]));
    expect(result.errors.filter((e) => e.code === "item-fixed-missing")).toEqual([
      { code: "item-fixed-missing", memberId: bare.id, unitId: "black-grail/sin-eater", itemId: "tenderizer-maul", message: "Sin Eater must carry Tenderizer Maul: it is part of the unit's kit" },
    ]);
  });

  it("item-fixed-missing binds only where the fixed row's gate is open", () => {
    // Anointed Heavy Infantry: Infernal Brand is fixed, but not under the Trench Ghosts variant.
    const aho = data().unitsById.get("heretic-legion/anointed-heavy-infantry")!;
    const brand = aho.equipmentAccess.find((a) => a.itemId === "infernal-brand")!;
    expect(brand.fixed).toBe(true);
    expect(brand.onlyWithout).toEqual(["heretic-legion/trench-ghosts"]);
    const others = aho.equipmentAccess.filter((a) => a.fixed && a.itemId !== "infernal-brand").map((a) => a.itemId);
    const missing = (w: Warband) => validate(w).errors.filter((e) => e.code === "item-fixed-missing").map((e) => e.itemId);
    expect(missing(warband("heretic-legion", [member(aho.id, others)]))).toEqual(["infernal-brand"]);
    expect(missing(warband("heretic-legion", [member(aho.id, others)], { variantId: "heretic-legion/trench-ghosts" }))).toEqual([]);
    // Technomancer: its fixed helmet and armour need Cadaver Corps, which the data cannot count, so they are not required.
    expect(missing(warband("heretic-legion", [member("heretic-legion/technomancer", [])]))).toEqual([]);
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
    const result = expectCode(withMembers([member("new-antioch/yeoman", ["gas-mask", "gas-mask"])]), "item-max-per-model", "battlekit-duplicate");
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
    // "A Berserker cannot have Armour" (p38) is a gate on the armour row, so the Lieutenant goes without
    w.members[0]!.equipmentItemIds = ["sword-axe", "pistol"];
    expectCode(w, "upgrade-variant-locked");
    expect(validate({ ...w, variantId: "new-antioch/eire-rangers" }).ok).toBe(true);
  });

  it("upgrade-duplicate: an upgrade bought twice for one model (p14)", () => {
    const berserker = data().unitsById.get("new-antioch/lieutenant")!.upgrades!.find((g) => g.name === "Berserker")!.bsId;
    const eire = { variantId: "new-antioch/eire-rangers" };
    expect(validate(warband("new-antioch", [member("new-antioch/lieutenant", [], [berserker])], eire)).errors).toEqual([]);
    // Berserker is also "max 1 per warband", so the second copy trips both rules.
    const twice = warband("new-antioch", [member("new-antioch/lieutenant", [], [berserker, berserker])], eire);
    const result = expectCode(twice, "upgrade-duplicate", "upgrade-max-per-warband");
    expect(result.errors[0]).toMatchObject({ code: "upgrade-duplicate", memberId: twice.members[0]!.id, unitId: "new-antioch/lieutenant" });
  });

  it("upgrade-duplicate: two upstream entries with one name are one upgrade answering to both ids (Janissary Veteran, p81)", () => {
    const veteran = data().unitsById.get("iron-sultanate/yuzbasi-captain")!.upgrades!.filter((g) => g.name === "Janissary Veteran");
    expect(veteran).toHaveLength(1);
    const ids = veteran[0]!.bsIds!;
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(veteran[0]!.bsId);
    const captain = (upgradeIds: string[]) => warband("iron-sultanate", [member("iron-sultanate/yuzbasi-captain", ["sword-axe"], upgradeIds)]);
    expect(validate(captain([ids[0]!])).errors).toEqual([]);
    expect(validate(captain([ids[1]!])).errors).toEqual([]);
    expectCode(captain(ids), "upgrade-duplicate");
  });

  it("upgrade-max-per-model: an entry that allows repeats caps them at its own max (no real entry does; data patched)", () => {
    const d = data();
    const unit = d.unitsById.get("new-antioch/shocktrooper")!;
    const forward = unit.upgrades!.find((g) => g.name === "Forward Positions")!;
    const patchedUnit = { ...unit, upgrades: unit.upgrades!.map((g) => (g === forward ? { ...g, limitsText: "max 2 per model; max 5 per warband" } : g)) };
    const patched: RulesData = {
      ...d,
      unitsById: new Map([...d.unitsById, [unit.id, patchedUnit]]),
      unitsByFaction: new Map([...d.unitsByFaction, ["new-antioch", d.unitsByFaction.get("new-antioch")!.map((u) => (u.id === unit.id ? patchedUnit : u))]]),
    };
    const w = (n: number) =>
      warband("new-antioch", [member("new-antioch/lieutenant"), member("new-antioch/shocktrooper"), member("new-antioch/shocktrooper", [], Array<string>(n).fill(forward.bsId))], {
        variantId: "new-antioch/stosstruppen-of-the-free-state-of-prussia",
      });
    expect(validateWarband(w(2), patched).errors).toEqual([]);
    expect(codes(validateWarband(w(3), patched))).toEqual(["upgrade-max-per-model"]);
    expect(codes(validateWarband(w(2), d))).toEqual(["upgrade-duplicate"]);
  });

  it("upgrade-max-per-warband: Forward Positions on more than 2 Shock Troopers (p41), more than 2 Trench Moles (p30)", () => {
    const forward = data().unitsById.get("new-antioch/shocktrooper")!.upgrades!.find((g) => g.name === "Forward Positions")!.bsId;
    const troopers = (n: number) => Array.from({ length: n }, () => member("new-antioch/shocktrooper", ["submachine-gun"], [forward]));
    const prussia = (n: number) => warband("new-antioch", [member("new-antioch/lieutenant"), ...troopers(n)], { variantId: "new-antioch/stosstruppen-of-the-free-state-of-prussia" });
    expect(validate(prussia(2)).errors).toEqual([]);
    const result = expectCode(prussia(4), "upgrade-max-per-warband");
    expect(result.errors[0]).toMatchObject({ unitId: "new-antioch/shocktrooper", message: expect.stringContaining("4 in the warband, limit 2") });

    const mole = data().unitsById.get("new-antioch/yeoman")!.upgrades!.find((g) => g.name === "Trench Mole")!.bsId;
    const moles = (n: number) => warband("new-antioch", [member("new-antioch/lieutenant"), ...Array.from({ length: n }, () => member("new-antioch/yeoman", [], [mole]))]);
    expect(validate(moles(2)).errors).toEqual([]);
    const third = expectCode(moles(5), "upgrade-max-per-warband");
    // A 3rd Trench Mole is allowed at 1,000+ ducats of other models, which the data only carries as text.
    expect(third.warnings.some((x) => x.unitId === "new-antioch/yeoman" && x.message.includes("1000"))).toBe(true);
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
    // the Heavy Ballistic Shield needs Machine Armour on the model (p25), which only ELITE and MHI can wear
    expectCode(warband("new-antioch", [member("new-antioch/lieutenant", ["machine-armour", "trench-shield", "heavy-ballistic-shield"])]), "battlekit-shield");
  });

  it("battlekit-headgear: two pieces of headgear", () => {
    expectCode(withMembers([member("new-antioch/yeoman", ["combat-helmet", "combat-helmet"])]), "battlekit-headgear", "battlekit-duplicate", "item-max-per-model");
  });

  it("battlekit-duplicate: the same equipment twice", () => {
    expectCode(withMembers([member("new-antioch/yeoman", ["shovel", "shovel"])]), "battlekit-duplicate", "item-max-per-model");
  });

  it("battlekit-heavy: two HEAVY pieces on a model that is not STRONG", () => {
    expectCode(withMembers([member("new-antioch/yeoman", ["machine-gun", "great-sword-axe"])]), "battlekit-heavy");
  });

  it("battlekit-hands: a shield with a 2-Handed weapon that lacks Shield Combo", () => {
    expectCode(withMembers([member("new-antioch/yeoman", ["trench-shield", "bolt-action-rifle"])]), "battlekit-hands");
    expectCode(withMembers([member("new-antioch/yeoman", ["trench-shield", "pistol", "pistol"])]), "battlekit-hands");
    const flag = { glory: 1 }; // a Troop Flag costs 1 Glory
    expectCode(withMembers([member("new-antioch/yeoman", ["troop-flag", "trench-shield", "sword-axe"])], flag), "battlekit-hands");
    expectCode(withMembers([member("new-antioch/yeoman", ["troop-flag", "polearm"])], flag), "battlekit-hands");
    expect(validate(withMembers([member("new-antioch/yeoman", ["troop-flag", "sword-axe", "pistol"])], flag)).ok).toBe(true);
  });

  it("accepts a Mamluk Faris with its Polearm and Trench Shield loadout (p179) and nothing outside it", () => {
    const faris = (kit: string[]) => warband("iron-sultanate", [member("iron-sultanate/yuzbasi-captain", ["sword-axe"]), member("iron-sultanate/mamluk-faris", kit)], { glory: 4 });
    const result = validate(faris(["polearm", "shield"]));
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((x) => x.message)).toEqual([expect.stringContaining("Polearm with a Shield relies on Shield Combo")]);
    expect(validate(faris(["great-sword-axe"])).errors).toEqual([]);
    expect(expectCode(faris(["polearm", "shield", "bolt-action-rifle"]), "item-not-available").errors[0]?.itemId).toBe("bolt-action-rifle");
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

// Rows whose availability depends on something the unit can never select
// (another unit's upgrade, a profile it lacks, a campaign item) are not in its
// armoury at all; rows that depend on one of its own selections are gated on it.
describe("validateWarband: armoury rows resolved from BattleScribe availability conditions", () => {
  const sultan = (m: WarbandMember, extra: Partial<Warband> = {}) => warband("iron-sultanate", [member("iron-sultanate/yuzbasi-captain", ["sword-axe"]), m], extra);
  const court = (m: WarbandMember, extra: Partial<Warband> = {}) => warband("court-of-the-seven-headed-serpent", [member("court-of-the-seven-headed-serpent/praetor", ["sword-axe"]), m], extra);
  const gone: Array<[string, Warband, string]> = [
    ["Jabirean Alchemist + Flame Cannon (Brazen Bull only, p74)", sultan(member("iron-sultanate/jabirean-alchemist", ["flame-cannon"])), "flame-cannon"],
    ["Azeb + M.U.R.A.D. Bombard (Brazen Bull only, p74)", sultan(member("iron-sultanate/azeb", ["murad-bombard"])), "murad-bombard"],
    ["Yüzbaşı + Titan Zulfiqar (Brazen Bull only, p74)", warband("iron-sultanate", [member("iron-sultanate/yuzbasi-captain", ["titan-zulfiqar"])]), "titan-zulfiqar"],
    ["Court Hell Knight + Misericordia (not in the Court armoury, p148)", court(member("court-of-the-seven-headed-serpent/hell-knight", ["misericordia"])), "misericordia"],
    ["Court Scripture Guardian + Halberd-Gun (not in the Court armoury, p148)", court(member("court-of-the-seven-headed-serpent/scripture-guardian", ["halberd-gun"]), { glory: 7 }), "halberd-gun"],
    ["Yeoman + Heavy Ballistic Shield (Models wearing Machine Armour only, p25)", withMembers([member("new-antioch/yeoman", ["heavy-ballistic-shield"])]), "heavy-ballistic-shield"],
  ];
  for (const [name, w, itemId] of gone) {
    it(`item-not-available: ${name}`, () => {
      expect(expectCode(w, "item-not-available").errors[0]?.itemId).toBe(itemId);
    });
  }

  it("the Brazen Bull keeps its own weapons (p74)", () => {
    expect(validate(sultan(member("iron-sultanate/brazen-bull", ["flame-cannon", "titan-zulfiqar"]))).errors).toEqual([]);
  });

  it("Heavy Ballistic Shield needs Machine Armour on the same model (p25)", () => {
    const lieutenant = (kit: string[]) => warband("new-antioch", [member("new-antioch/lieutenant", kit)]);
    expect(expectCode(lieutenant(["heavy-ballistic-shield"]), "item-variant-locked").errors[0]?.message).toContain("item:machine-armour");
    expect(validate(lieutenant(["machine-armour", "heavy-ballistic-shield"])).errors).toEqual([]);
    const elsewhere = warband("new-antioch", [member("new-antioch/lieutenant", ["heavy-ballistic-shield"]), member("new-antioch/sniper-priest", ["machine-armour"])]);
    expectCode(elsewhere, "item-variant-locked");
  });

  it("Court Praetor + Misericordia is Envious Eyes loot from the Trench Pilgrims armoury (p156, p50)", () => {
    const loot = data().unitsById.get("court-of-the-seven-headed-serpent/praetor")!.upgrades!.find((g) => g.name === "Misericordia")!;
    const praetor = (upgradeIds: string[]) => warband("court-of-the-seven-headed-serpent", [member("court-of-the-seven-headed-serpent/praetor", ["misericordia"], upgradeIds)]);
    expect(expectCode(praetor([]), "item-variant-locked").errors[0]?.message).toContain("upgrade:Misericordia");
    expect(validate(praetor([loot.bsId])).errors).toEqual([]);
  });

  it("Heretic Trooper + Musket is Knights of Avarice loot (p120), not base armoury (p105)", () => {
    const legion = (extra: Partial<Warband> = {}) => warband("heretic-legion", [member("heretic-legion/heretic-priest", ["sword-axe"]), member("heretic-legion/heretic-trooper", ["musket"])], extra);
    expect(expectCode(legion(), "item-variant-locked").errors[0]?.message).toContain("knights-of-avarice");
    expect(validate(legion({ variantId: "heretic-legion/knights-of-avarice" })).errors).toEqual([]);
  });

  it("Butcher Bayonet is Great Hunger kit on a Great Hunger rifle, with one gate, not two", () => {
    const row = data().unitsById.get("black-grail/corpse-guard")!.equipmentAccess.find((a) => a.itemId === "butcher-bayonet")!;
    expect(row.onlyWith).toEqual(["black-grail/the-great-hunger"]);
    expect(row.onlyWithout).toBeUndefined();
    for (const unit of data().units) {
      for (const a of [...unit.equipmentAccess, ...(unit.upgrades ?? [])]) {
        const both = (a.onlyWith ?? []).filter((v) => (a.onlyWithout ?? []).includes(v));
        expect(both, `${unit.id} ${"itemId" in a ? a.itemId : a.name}`).toEqual([]);
      }
    }
  });

  it("deprecated Fireteam wrappers are not units", () => {
    expectCode(withMembers([member("new-antioch/fireteam")]), "unit-unknown");
    expectCode(withMembers([member("new-antioch/mamluk-faris-fireteam")]), "unit-unknown");
    expect(data().units.some((u) => u.kind === "fireteam")).toBe(false);
  });
});

// One plainly legal starting warband per faction, built from the data: the
// leader each list must take plus two to four troops with basic kit.
describe("validateWarband: a legal starting warband for every faction", () => {
  const rifleman = (unitId: string) => member(unitId, ["bolt-action-rifle", "bayonet"]);
  const starters: Array<[string, Warband]> = [
    ["New Antioch", newAntioch()],
    ["Heretic Legion", warband("heretic-legion", [member("heretic-legion/heretic-priest", ["sword-axe", "pistol", "standard-armour"]), rifleman("heretic-legion/heretic-trooper"), rifleman("heretic-legion/heretic-trooper"), rifleman("heretic-legion/heretic-trooper")])],
    ["Iron Sultanate", warband("iron-sultanate", [member("iron-sultanate/yuzbasi-captain", ["sword-axe", "pistol", "reinforced-armour"]), member("iron-sultanate/azeb", ["jezzail"]), member("iron-sultanate/azeb", ["jezzail"]), member("iron-sultanate/janissary", ["sword-axe", "reinforced-armour"])])],
    ["Court of the Seven-Headed Serpent", warband("court-of-the-seven-headed-serpent", [member("court-of-the-seven-headed-serpent/praetor", ["sword-axe", "pistol"]), member("court-of-the-seven-headed-serpent/wretched", ["trench-knife"]), member("court-of-the-seven-headed-serpent/wretched", ["trench-knife"]), member("court-of-the-seven-headed-serpent/wretched", ["trench-knife"])])],
    ["Trench Pilgrims", warband("trench-pilgrims", [member("trench-pilgrims/war-prophet", ["sword-axe", "pistol"]), rifleman("trench-pilgrims/trench-pilgrim"), rifleman("trench-pilgrims/trench-pilgrim"), rifleman("trench-pilgrims/trench-pilgrim")])],
    ["Black Grail", warband("black-grail", [member("black-grail/lord-of-tumours", ["sword-axe", "pistol", "standard-armour"]), member("black-grail/grail-thrall"), member("black-grail/grail-thrall")])],
    ["Iron Sultanate, Fida'i of Alamut (p89): a Sultanate Assassin leads, no Yüzbaşı", warband("iron-sultanate", [member("iron-sultanate/sultanate-assassin", ["sword-axe", "pistol"]), member("iron-sultanate/azeb", ["jezzail"]), member("iron-sultanate/azeb", ["jezzail"])], { variantId: "iron-sultanate/fida-i-of-alamut-the-cabal-of-assassins" })],
    ["Iron Sultanate, House of Wisdom (p94): a Jabirean Alchemist leads, no Yüzbaşı", warband("iron-sultanate", [member("iron-sultanate/jabirean-alchemist", ["sword-axe"]), member("iron-sultanate/azeb", ["jezzail"]), member("iron-sultanate/azeb", ["jezzail"])], { variantId: "iron-sultanate/the-house-of-wisdom" })],
  ];

  for (const [name, w] of starters) {
    it(`${name}: no errors, within 700 ducats, no Glory`, () => {
      const result = validate(w);
      expect(result.errors).toEqual([]);
      expect(result.ok).toBe(true);
      const cost = warbandCost(w, data());
      expect(cost.ducats).toBeLessThanOrEqual(700);
      expect(cost.glory).toBe(0);
    });
  }

  it("New Antioch, Papal States Intervention Force (p35): a Trench Cleric leads, no Lieutenant, within 500 ducats", () => {
    const w = warband("new-antioch", [member("new-antioch/trench-cleric", ["sword-axe", "pistol", "standard-armour"]), rifleman("new-antioch/yeoman"), rifleman("new-antioch/yeoman"), rifleman("new-antioch/yeoman"), rifleman("new-antioch/yeoman")], {
      variantId: "new-antioch/papal-states-intervention-force",
    });
    const result = validate(w);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(warbandCost(w, data()).ducats).toBeLessThanOrEqual(500);
  });
});

// Subfactions recruit from their own list (Heretic Naval Raiders: Heretic-Naval-Raiders-Warband.pdf 1.0.2).
describe("validateWarband: subfactions", () => {
  const RAIDERS = { subfactionId: "heretic-naval-raiders" } as const;
  const LEGIONNAIRE = "332dc68d-9a98-5bc8-af04-e5d59f541e2d";
  const RANGED = "f87051a2-6b9a-53d0-b319-7e60180d97c0";
  const raiders = (members: WarbandMember[], extra: Partial<Warband> = {}) => warband("heretic-legion", members, { ...RAIDERS, ...extra });
  const captain = () => member("heretic-naval-raiders/heretic-captain", ["sword-axe", "pistol"]);
  const raider = () => member("heretic-naval-raiders/heretic-raider", ["bolt-action-rifle", "bayonet", "combat-helmet"]);
  const anointed = () => member("heretic-naval-raiders/anointed-heretic-raider", ["reinforced-armour", "infernal-brand", "great-sword-axe"]);

  // Sample list "Beachhead Assault Doctrine", p42-44: exactly 700 ducats.
  const beachhead = () =>
    raiders([
      member("heretic-naval-raiders/heretic-captain", ["submachine-gun", "sacrificial-blade", "trench-shield", "reinforced-armour", "combat-helmet", "infernal-brand"]),
      member("heretic-naval-raiders/drowned-chorister", ["sacrificial-blade", "sword-axe", "standard-armour", "combat-helmet"]),
      member("heretic-naval-raiders/heretic-raider", ["submachine-gun", "bayonet", "combat-helmet"], [LEGIONNAIRE, RANGED]),
      member("heretic-naval-raiders/heretic-raider", ["submachine-gun", "bayonet", "combat-helmet"], [LEGIONNAIRE, RANGED]),
      raider(),
      raider(),
      member("heretic-naval-raiders/anointed-heretic-raider", ["reinforced-armour", "infernal-brand", "machine-gun", "great-sword-axe", "combat-helmet"]),
    ]);

  it("Heretic Naval Raiders: the Beachhead Assault Doctrine sample list (p42-44) is legal at exactly 700 ducats", () => {
    const w = beachhead();
    const result = validate(w);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(warbandCost(w, data())).toMatchObject({ ducats: 700, glory: 0 });
  });

  it("Heretic Naval Raiders: a Heretic Captain must lead (p21), unless the Drowned Choir replaces them (p37)", () => {
    expect(expectCode(raiders([raider(), raider()]), "unit-min").errors[0]?.unitId).toBe("heretic-naval-raiders/heretic-captain");
    const chorister = (upgradeIds: string[] = []) => member("heretic-naval-raiders/drowned-chorister", ["sword-axe"], upgradeIds);
    const choir = raiders([chorister(["92816847-3df0-4cbf-84d2-56599afea0f0"]), chorister(), raider()], { variantId: "heretic-naval-raiders/the-drowned-choir" });
    expect(validate(choir).errors).toEqual([]);
    expectCode(raiders([captain(), chorister(["92816847-3df0-4cbf-84d2-56599afea0f0"]), raider()], { variantId: "heretic-naval-raiders/the-drowned-choir" }), "unit-max");
  });

  it("Heretic Naval Raiders: 0-2 Anointed Heretic Raiders (p32), 0-4 in a Leviathan Shoal (p39)", () => {
    expect(validate(raiders([captain(), anointed(), anointed()])).errors).toEqual([]);
    expectCode(raiders([captain(), anointed(), anointed(), anointed()]), "unit-max");
    const shoal = raiders([captain(), anointed(), anointed(), anointed(), anointed()], { variantId: "heretic-naval-raiders/the-leviathan-shoal" });
    expect(validate(shoal).errors).toEqual([]);
  });

  it("recruits only from the subfaction's list, and takes only its own variants", () => {
    const priest = member("heretic-legion/heretic-priest", ["sword-axe"]);
    expect(expectCode(raiders([captain(), priest]), "unit-faction").errors[0]?.unitId).toBe("heretic-legion/heretic-priest");
    expectCode(warband("heretic-legion", [member("heretic-legion/heretic-priest", ["sword-axe"]), captain()]), "unit-faction");
    expectCode(raiders([captain()], { variantId: "heretic-legion/trench-ghosts" }), "variant-unknown");
    expectCode(raiders([captain()], { subfactionId: "procession-of-the-sacred-affliction" }), "subfaction-unknown");
    expectCode(raiders([captain()], { subfactionId: "atlantis" }), "subfaction-unknown");
  });

  it("takes the parent faction's patrons", () => {
    expect(validate(raiders([captain()], { patronId: "infernal-noble" })).errors).toEqual([]);
    expectCode(raiders([captain()], { patronId: "temporal-lord" }), "patron-faction");
  });

  it("Wrecker's Torch is ELITE only, Shield Combo (p14): a Captain may pair it with a Trench Shield", () => {
    const torch = raiders([member("heretic-naval-raiders/heretic-captain", ["wrecker-s-torch", "trench-shield"])]);
    expect(validate(torch).errors).toEqual([]);
    expectCode(raiders([captain(), member("heretic-naval-raiders/heretic-raider", ["wrecker-s-torch"])]), "item-not-available");
  });

  it("prices kit from the subfaction's armoury (Submachine Gun 25 ducats, p13; base Heretic Legion 2 glory)", () => {
    const smg = (w: Warband) => warbandCost(w, data()).perMember[0]!.items[0]!;
    expect(smg(raiders([member("heretic-naval-raiders/heretic-raider", ["submachine-gun"])]))).toMatchObject({ ducats: 25, glory: 0 });
  });

  // No local copy of the Procession of the Sacred Affliction compendium: this
  // starter is built from the converted data only and is UNVERIFIED against the PDF.
  it("Procession of the Sacred Affliction (unverified, from data): a Lazarist Prophet leads", () => {
    const w = warband(
      "trench-pilgrims",
      [
        member("procession-of-the-sacred-affliction/lazarist-prophet", ["sword-axe", "pistol", "standard-armour"]),
        member("procession-of-the-sacred-affliction/leper-pilgrim", ["sword-axe"]),
        member("procession-of-the-sacred-affliction/leper-pilgrim", ["sword-axe"]),
        member("procession-of-the-sacred-affliction/leper-pilgrim", ["sword-axe"]),
      ],
      { subfactionId: "procession-of-the-sacred-affliction" },
    );
    const result = validate(w);
    expect(result.errors).toEqual([]);
    expect(warbandCost(w, data()).ducats).toBeLessThanOrEqual(700);
    expectCode({ ...w, members: w.members.slice(1) }, "unit-min");
  });
});
