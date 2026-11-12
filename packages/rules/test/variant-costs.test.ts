import { describe, expect, it } from "vitest";
import { itemCost, memberCost, unitCost, upgradeCost, warbandCost } from "../src/cost.js";
import { toWarbandExport } from "../src/export.js";
import { grantRoom, grantStates, isEliteMember, memberKeywords, purseAdjustment } from "../src/grants.js";
import { accessFor, buildRulesData, readRulesFiles, rosterUnits, type RulesData } from "../src/load.js";
import type { Warband, WarbandMember } from "../src/roster.js";
import { effectiveStats, limitContext, unitLimits, validateWarband, warbandThreshold } from "../src/validate.js";
import { codes, data, member, repoRoot, warband } from "./fixtures.js";

// unit-rules.json variantPrices, variantSubstituteUnits, freeKeywordGrants,
// freeAtCreation and purseAdjustments, against the real data. Pages are
// Warbands of Trench Crusade unless marked NR (Heretic Naval Raiders).

const PAPAL = "new-antioch/papal-states-intervention-force";
const ALBA = "new-antioch/kingdom-of-alba-assault-detachment";
const DEFENDERS = "iron-sultanate/defenders-of-the-iron-wall";
const WISDOM = "iron-sultanate/the-house-of-wisdom";
const FIDAI = "iron-sultanate/fida-i-of-alamut-the-cabal-of-assassins";
const KOA = "heretic-legion/knights-of-avarice";
const METHODIUS = "trench-pilgrims/war-pilgrimage-of-saint-methodius";
const CAVALCADE = "trench-pilgrims/cavalcade-of-the-tenth-plague";
const SIPAHI = "iron-sultanate/sipahi-automaton-cavalry";
const MAMLUK = "iron-sultanate/mamluk-faris";
const WARLOCK = "heretic-legion/goetic-warlock";

const errorsOf = (w: Warband, d: RulesData = data()) => codes(validateWarband(w, d));
const unit = (id: string) => data().unitsById.get(id)!;
/** The id a member stores for the upgrade of this name on this unit. */
const upgradeId = (unitId: string, name: string) => unit(unitId).upgrades!.find((g) => g.name === name)!.bsId;
const money = (c: { ducats: number; glory: number }) => ({ ducats: c.ducats, glory: c.glory });

describe("variantPrices: a price that changes under a variant", () => {
  it("Claymore Smiths (p39): a Great Sword/Axe is 7 ducats in a Kingdom of Alba warband, 12 elsewhere", () => {
    const trooper = member("new-antioch/shocktrooper", ["great-sword-axe"]);
    const alba = warband("new-antioch", [trooper], { variantId: ALBA });
    expect(money(itemCost(data(), alba, "new-antioch/shocktrooper", "great-sword-axe"))).toEqual({ ducats: 7, glory: 0 });
    expect(money(itemCost(data(), { ...alba, variantId: undefined }, "new-antioch/shocktrooper", "great-sword-axe"))).toEqual({ ducats: 12, glory: 0 });
    // The first one bought is also halved by Cold Steel (p39, TC-003f): 7 -> 4, rounded up.
    expect(warbandCost(alba, data()).ducats).toBe(45 + 4);
    expect(warbandCost({ ...alba, variantId: undefined }, data()).ducats).toBe(45 + 12);
    expect(toWarbandExport(alba, data(), { code: "T" }).members[0]!.equipment.find((e) => e.id === "great-sword-axe")!.cost).toEqual({ ducats: 4, glory: 0 });
  });

  it("Knights of Avarice (p120): the first Goetic Warlock is 110 ducats, the second its normal 4 glory (p176), up to 2", () => {
    const koa = (n: number) => warband("heretic-legion", Array.from({ length: n }, () => member(WARLOCK, [])), { variantId: KOA });
    expect(money(unitCost(data(), koa(0), unit(WARLOCK)))).toEqual({ ducats: 110, glory: 0 });
    expect(money(unitCost(data(), koa(1), unit(WARLOCK)))).toEqual({ ducats: 0, glory: 4 });
    const two = koa(2);
    expect(warbandCost(two, data()).perMember.map((m) => money(m.unit))).toEqual([
      { ducats: 110, glory: 0 },
      { ducats: 0, glory: 4 },
    ]);
    expect(unitLimits(unit(WARLOCK), limitContext(two, data())).max).toBe(2);
    expect(errorsOf(two)).not.toContain("mercenary-limit");
    expect(errorsOf(koa(3))).toContain("mercenary-limit");
    expect(toWarbandExport(two, data(), { code: "T" }).warband.totals).toEqual({ ducats: 110, glory: 4 });
  });

  it("Stolen Communicants (p69): a Cavalcade Communicant costs 3 glory and no ducats", () => {
    const w = warband("trench-pilgrims", [member("trench-pilgrims/communicant", [])], { variantId: CAVALCADE });
    expect(money(warbandCost(w, data()))).toEqual({ ducats: 0, glory: 3 });
    expect(money(warbandCost({ ...w, variantId: undefined }, data()))).toEqual({ ducats: 100, glory: 0 });
    expect(errorsOf({ ...w, glory: 2 })).toContain("over-glory");
  });

  it("Methodius Armoury (p64): Machine Gun 50 ducats Limit 2 and Submachine Gun 30 ducats Limit 1 replace the 2-glory entries", () => {
    const pilgrim = (item: string) => member("trench-pilgrims/trench-pilgrim", [item]);
    const methodius = (items: string[]) => warband("trench-pilgrims", items.map(pilgrim), { variantId: METHODIUS });
    const mgs = methodius(["machine-gun", "machine-gun"]);
    expect(money(warbandCost(mgs, data()))).toEqual({ ducats: 2 * (30 + 50), glory: 0 });
    expect(errorsOf(mgs)).not.toContain("item-variant-locked");
    expect(errorsOf(mgs)).not.toContain("item-max-per-warband");
    expect(errorsOf(methodius(["machine-gun", "machine-gun", "machine-gun"]))).toContain("item-max-per-warband");
    expect(errorsOf(methodius(["submachine-gun", "submachine-gun"]))).toContain("item-max-per-warband");
    expect(money(warbandCost(methodius(["submachine-gun"]), data()))).toEqual({ ducats: 30 + 30, glory: 0 });
    // The core list keeps its own entries: 2 glory, no Limit.
    const core = { ...methodius(["machine-gun", "machine-gun", "machine-gun"]), variantId: undefined };
    expect(money(warbandCost(core, data()))).toEqual({ ducats: 3 * 30, glory: 6 });
    expect(errorsOf(core)).not.toContain("item-max-per-warband");
  });

  it("The Bereaved (p142) and A Wretched Chorus (NR p37): 30 ducats with the variant's profile", () => {
    const dirge = warband("black-grail", [member("black-grail/grail-thrall", [])], { variantId: "black-grail/dirge-of-the-great-hegemon" });
    expect(warbandCost(dirge, data()).ducats).toBe(30);
    expect(effectiveStats(unit("black-grail/grail-thrall"), dirge, data()).ranged).toBe("+0");
    expect(warbandCost({ ...dirge, variantId: undefined }, data()).ducats).toBe(25);

    const choir = warband("heretic-legion", [member("heretic-naval-raiders/wretched", [])], { subfactionId: "heretic-naval-raiders", variantId: "heretic-naval-raiders/the-drowned-choir" });
    expect(warbandCost(choir, data()).ducats).toBe(30);
    expect(effectiveStats(unit("heretic-naval-raiders/wretched"), choir, data()).melee).toBe("+0");
    expect(warbandCost({ ...choir, variantId: undefined }, data()).ducats).toBe(25);
  });

  it("entries that keep their cost under a variant keep it (Light Melee p41, Lost Souls p118)", () => {
    const stoss = warband("new-antioch", [], { variantId: "new-antioch/stosstruppen-of-the-free-state-of-prussia" });
    expect(unitCost(data(), stoss, unit("new-antioch/shocktrooper")).ducats).toBe(45);
    const ghosts = warband("heretic-legion", [], { variantId: "heretic-legion/trench-ghosts" });
    expect(unitCost(data(), ghosts, unit("heretic-legion/anointed-heavy-infantry")).ducats).toBe(95);
  });

  it("reprices an upgrade too, and the file is checked: an unknown target or a list that does not exist is refused", () => {
    const files = readRulesFiles(repoRoot);
    const rules = JSON.parse(JSON.stringify(files.unitRules));
    rules.variantPrices.push({ id: "t", under: ["new-antioch/eire-rangers"], kind: "upgrade", targets: ["Fianna"], cost: { ducats: 0, glory: 1 }, page: 37, source: "Warbands-of-Trench-Crusade.pdf", text: "test" });
    const d = buildRulesData({ ...files, unitRules: rules });
    const fianna = d.unitsById.get("new-antioch/shocktrooper")!.upgrades!.find((g) => g.name === "Fianna")!;
    const w = warband("new-antioch", [member("new-antioch/shocktrooper", [], [fianna.bsId])], { variantId: "new-antioch/eire-rangers" });
    expect(money(upgradeCost(d, w, d.unitsById.get("new-antioch/shocktrooper")!, fianna))).toEqual({ ducats: 0, glory: 1 });
    expect(money(memberCost(d, w, w.members[0]!))).toEqual({ ducats: 45, glory: 1 });

    const bad = JSON.parse(JSON.stringify(files.unitRules));
    bad.variantPrices[0].targets = ["laser"];
    bad.variantPrices[1].under = ["nowhere"];
    expect(() => buildRulesData({ ...files, unitRules: bad })).toThrow(/no unit under new-antioch\/kingdom-of-alba-assault-detachment offers item "laser"[\s\S]*"nowhere" is not a variant, subfaction or faction/);
  });
});

describe("variantSubstituteUnits: an entry built from another's profile", () => {
  it("Sipahi (p99): its own Defenders row at 110 ducats, 0-1, beside a Mamluk Faris mercenary", () => {
    const sipahi = unit(SIPAHI);
    expect(sipahi).toMatchObject({ name: "Sipahi Automaton Cavalry", cost: { ducats: 110, glory: 0 }, stats: unit(MAMLUK).stats, substituteOf: MAMLUK });
    const defenders = (members: WarbandMember[], variantId: string | null = DEFENDERS) => warband("iron-sultanate", members, variantId ? { variantId } : {});
    expect(rosterUnits(data(), defenders([])).filter((u) => u.id === SIPAHI || u.id === MAMLUK)).toHaveLength(2);

    const both = defenders([member(SIPAHI, ["great-sword-axe"]), member(MAMLUK, ["great-sword-axe"])]);
    expect(money(warbandCost(both, data()))).toEqual({ ducats: 110, glory: 4 });
    expect(errorsOf(both)).not.toContain("mercenary-limit");
    expect(errorsOf(both)).not.toContain("unit-max");
    expect(errorsOf(defenders([member(SIPAHI, []), member(SIPAHI, [])]))).toContain("mercenary-limit");
    expect(errorsOf(defenders([member(SIPAHI, [])], null))).toContain("variant-locked");
    expect(errorsOf(defenders([member(SIPAHI, [])], WISDOM))).toContain("variant-locked");
  });

  it("Sipahi: the battlekit cannot be changed: its loadout is the Mamluk's, permanent once chosen, and nothing else fits", () => {
    const sipahi = unit(SIPAHI);
    expect(sipahi.equipmentAccess.map((a) => a.itemId)).toEqual(unit(MAMLUK).equipmentAccess.map((a) => a.itemId));
    expect(sipahi.equipmentAccess.every((a) => a.permanent === true && a.group === "loadout")).toBe(true);
    expect(unit(MAMLUK).equipmentAccess.some((a) => a.permanent)).toBe(false);
    expect(errorsOf(warband("iron-sultanate", [member(SIPAHI, ["great-sword-axe", "bolt-action-rifle"])], { variantId: DEFENDERS }))).toContain("item-not-available");
  });

  it("Sipahi exports under its own name with the Mamluk's model until it has one", () => {
    const out = toWarbandExport(warband("iron-sultanate", [member(SIPAHI, ["great-sword-axe"])], { variantId: DEFENDERS }), data(), { code: "T" });
    expect(out.members[0]!.unit).toMatchObject({ id: SIPAHI, name: "Sipahi Automaton Cavalry" });
    expect(out.members[0]!.model?.nickname).toBe(data().models?.byUnitId.get(MAMLUK)?.nickname);
  });

  it("Noble Guardians (p94): 0-2 Fāris on the Janissary entry with ELITE; Janissaries are barred from a House of Wisdom (p94)", () => {
    const faris = unit("iron-sultanate/faris");
    expect(faris).toMatchObject({ name: "Fāris", elite: true, cost: { ducats: 55, glory: 0 }, stats: unit("iron-sultanate/janissary").stats });
    expect(faris.keywords).toContain("Elite");
    const wisdom = (members: WarbandMember[]) => warband("iron-sultanate", members, { variantId: WISDOM });
    expect(errorsOf(wisdom([member("iron-sultanate/faris", []), member("iron-sultanate/faris", [])]))).not.toContain("unit-max");
    expect(errorsOf(wisdom([member("iron-sultanate/faris", []), member("iron-sultanate/faris", []), member("iron-sultanate/faris", [])]))).toContain("unit-max");
    expect(errorsOf(wisdom([member("iron-sultanate/janissary", [])]))).toContain("variant-excluded");
  });
});

describe("freeKeywordGrants: up to N models take a keyword for free", () => {
  const LT = "new-antioch/lieutenant";
  const swiss = (m: WarbandMember) => ({ ...m, upgradeIds: [upgradeId(m.unitId, "Swiss Guard")] });
  const papal = (members: WarbandMember[]) =>
    warband("new-antioch", [member("new-antioch/trench-cleric", ["supreme-blessing"]), ...members], { variantId: PAPAL });

  it("Swiss Guard (p35): the Lieutenant and up to 4 models, 5 at most, NEGATE FEAR for nothing", () => {
    const five = papal([swiss(member(LT, [])), ...Array.from({ length: 4 }, () => swiss(member("new-antioch/yeoman", [])))]);
    expect(errorsOf(five)).not.toContain("grant-cap");
    expect(errorsOf(five)).not.toContain("upgrade-max-per-warband");
    expect(warbandCost(five, data()).ducats).toBe(warbandCost({ ...five, members: five.members.map((m) => ({ ...m, upgradeIds: [] })) }, data()).ducats);

    const six = { ...five, members: [...five.members, swiss(member("new-antioch/shocktrooper", []))] };
    expect(errorsOf(six).filter((c) => c === "grant-cap")).toHaveLength(1);
    // Without the Lieutenant, still 4 others at most.
    const noLt = papal(Array.from({ length: 5 }, () => swiss(member("new-antioch/yeoman", []))));
    expect(errorsOf(noLt)).toContain("grant-cap");
    const state = grantStates(five, data()).find((s) => s.rule.id === "swiss-guard")!;
    expect(grantRoom(state, LT)).toEqual({ count: 1, max: 1 });
    expect(grantRoom(state, "new-antioch/yeoman")).toEqual({ count: 4, max: 4 });
  });

  it("Swiss Guard shows on the model's keywords and the export, and only in a Papal States warband", () => {
    const w = papal([swiss(member("new-antioch/yeoman", []))]);
    const yeoman = w.members[1]!;
    expect(memberKeywords(yeoman, unit("new-antioch/yeoman"), data())).toContain("Negate Fear");
    expect(toWarbandExport(w, data(), { code: "T" }).members[1]!.unit.keywords).toContain("Negate Fear");
    expect(toWarbandExport(w, data(), { code: "T" }).members[1]!.ttsDescription).toContain("Negate Fear");
    expect(errorsOf({ ...w, variantId: undefined })).toContain("upgrade-variant-locked");
  });

  it("Janissary Officers (p99): 0-2 Janissaries ELITE at no cost, in Defenders only", () => {
    const officer = () => member("iron-sultanate/janissary", [], ["grant/janissary-officers"]);
    const defenders = (members: WarbandMember[]) => warband("iron-sultanate", [member("iron-sultanate/yuzbasi-captain", []), ...members], { variantId: DEFENDERS });
    const two = defenders([officer(), officer()]);
    expect(errorsOf(two)).not.toContain("grant-cap");
    expect(warbandCost(two, data()).ducats).toBe(70 + 2 * 55);
    expect(errorsOf(defenders([officer(), officer(), officer()]))).toContain("grant-cap");
    expect(isEliteMember(two.members[1]!, unit("iron-sultanate/janissary"), data())).toBe(true);
    expect(toWarbandExport(two, data(), { code: "T" }).members[1]!.unit).toMatchObject({ elite: true, keywords: expect.arrayContaining(["Elite"]) });
    expect(errorsOf(warband("iron-sultanate", [member("iron-sultanate/yuzbasi-captain", []), officer()]))).toContain("upgrade-variant-locked");
  });

  it("Janissary Officers count toward the 6-ELITE cap (Warbands p10: any model with the ELITE Keyword)", () => {
    // Six ELITE entries (the extra Alchemists also break their own 0-1; that is a separate error).
    const elites = [member("iron-sultanate/yuzbasi-captain", []), ...Array.from({ length: 5 }, () => member("iron-sultanate/jabirean-alchemist", []))];
    const w = warband("iron-sultanate", [...elites, member("iron-sultanate/janissary", [])], { variantId: DEFENDERS });
    expect(errorsOf(w)).not.toContain("elite-cap");
    const promoted = { ...w, members: [...elites, member("iron-sultanate/janissary", [], ["grant/janissary-officers"])] };
    expect(errorsOf(promoted)).toContain("elite-cap");
    expect(validateWarband(promoted, data()).errors.find((e) => e.code === "elite-cap")!.message).toMatch(/^7 ELITE models/);
  });

  it("Only the Strong Survive (NR p39): one Anointed Heretic Raider ELITE, using upstream's own toggle", () => {
    const AHR = "heretic-naval-raiders/anointed-heretic-raider";
    const shoal = (n: number) =>
      warband("heretic-legion", Array.from({ length: n }, () => member(AHR, [], [upgradeId(AHR, "Leviathan Elite")])), { subfactionId: "heretic-naval-raiders", variantId: "heretic-naval-raiders/the-leviathan-shoal" });
    expect(unit(AHR).upgrades!.find((g) => g.name === "Leviathan Elite")!.grant).toBe("leviathan-only-the-strong-survive");
    expect(errorsOf(shoal(1))).not.toContain("grant-cap");
    expect(errorsOf(shoal(2))).toContain("grant-cap");
    expect(toWarbandExport(shoal(1), data(), { code: "T" }).members[0]!.unit.elite).toBe(true);
  });

  // Killing Squad (p90) is a Fireteam rule since TC-003k: test/fireteams.test.ts.
});

describe("freeAtCreation: Supreme Blessing (p35)", () => {
  const crucifix = (n: number, extra: Partial<Warband> = {}) =>
    warband("new-antioch", [member("new-antioch/trench-cleric", ["supreme-blessing"]), ...Array.from({ length: n - 1 }, () => member("new-antioch/yeoman", ["supreme-blessing"]))], { variantId: PAPAL, ...extra });

  it("the Crucifix taken at creation is free; one bought later is 3 glory", () => {
    expect(money(warbandCost(crucifix(1), data()))).toEqual({ ducats: 60, glory: 0 });
    expect(money(itemCost(data(), warband("new-antioch", [], { variantId: PAPAL }), "new-antioch/trench-cleric", "supreme-blessing"))).toEqual({ ducats: 0, glory: 0 });
    expect(money(itemCost(data(), crucifix(1), "new-antioch/trench-cleric", "supreme-blessing"))).toEqual({ ducats: 0, glory: 3 });
    // Kit with no purchase record was bought at creation, so it stays free at game 2 (TC-003f);
    // a replacement recorded as bought for game 2 is paid for normally.
    expect(money(warbandCost(crucifix(1, { gameNumber: 2 }), data()))).toEqual({ ducats: 60, glory: 0 });
    const lost = crucifix(1, { gameNumber: 2 });
    lost.purchases = [{ itemId: "supreme-blessing", memberId: lost.members[0]!.id, game: 1 }, { itemId: "supreme-blessing", memberId: lost.members[0]!.id, game: 2 }];
    expect(money(warbandCost(lost, data()))).toEqual({ ducats: 60, glory: 3 });
    expect(toWarbandExport(crucifix(1), data(), { code: "T" }).members[0]!.equipment.find((e) => e.id === "supreme-blessing")!.cost).toEqual({ ducats: 0, glory: 0 });
  });

  it("must be given to one model at creation; a second is paid for and breaks Limit: 1", () => {
    const none = warband("new-antioch", [member("new-antioch/trench-cleric", [])], { variantId: PAPAL });
    expect(errorsOf(none)).toContain("free-at-creation-missing");
    expect(errorsOf({ ...none, gameNumber: 2 })).not.toContain("free-at-creation-missing");
    expect(errorsOf({ ...none, variantId: undefined })).not.toContain("free-at-creation-missing");
    expect(errorsOf(crucifix(1))).toEqual([]);
    expect(warbandCost(crucifix(2), data()).glory).toBe(3);
    expect(errorsOf(crucifix(2))).toContain("item-max-per-warband");
  });
});

describe("purse: Specialist Force (p35)", () => {
  it("starts with 500 ducats and 11 glory: Threshold 500 at game 1, 200 under the table after", () => {
    const w = warband("new-antioch", [member("new-antioch/trench-cleric", ["supreme-blessing"])], { variantId: PAPAL });
    expect(warbandThreshold(w, data()).value).toBe(500);
    expect(warbandThreshold({ ...w, gameNumber: 2 }, data()).value).toBe(600);
    const scripture = member("new-antioch/scripture-guardian", ["sword-axe", "trench-club"]);
    const sg = unitCost(data(), w, unit("new-antioch/scripture-guardian")).glory;
    expect(sg).toBe(7);
    expect(errorsOf({ ...w, members: [...w.members, scripture] })).not.toContain("over-glory");
    const yeomanGlory = { ...w, members: [...w.members, scripture, member("new-antioch/yeoman", ["supreme-blessing"])] };
    expect(warbandCost(yeomanGlory, data()).glory).toBe(10);
    expect(errorsOf(yeomanGlory)).not.toContain("over-glory");
  });

  it("one-off game: 200 ducats off the agreed size, and the 11 glory to spend", () => {
    const w = warband("new-antioch", [member("new-antioch/trench-cleric", ["supreme-blessing"])], { variantId: PAPAL });
    expect(warbandThreshold(w, data(), 1000).value).toBe(800);
    expect(warbandThreshold({ ...w, variantId: undefined }, data(), 1000).value).toBe(1000);
    const yeomen = Array.from({ length: 13 }, () => member("new-antioch/yeoman", ["bolt-action-rifle", "standard-armour", "combat-helmet"]));
    const big = { ...w, members: [...w.members, ...yeomen] }; // 60 + 13 x 55 = 775
    expect(warbandCost(big, data()).ducats).toBe(775);
    expect(errorsOf(big)).toContain("over-threshold");
    expect(codes(validateWarband(big, data(), { threshold: 1000 }))).not.toContain("over-threshold");
    expect(validateWarband(big, data(), { threshold: 950 }).errors.find((e) => e.code === "over-threshold")!.message).toBe("Warband costs 775 ducats; Threshold Value is 750");
    expect(codes(validateWarband({ ...big, members: [...big.members, ...yeomen.slice(0, 1)] }, data(), { threshold: 1000 }))).toContain("over-threshold");
    const hired = { ...big, members: [...big.members, member("new-antioch/scripture-guardian", ["sword-axe", "trench-club"])] }; // 7 glory of 11
    expect(codes(validateWarband(hired, data(), { threshold: 1100 }))).toEqual([]);
    expect(codes(validateWarband({ ...hired, glory: 6 }, data(), { threshold: 1100 }))).toContain("over-glory");
  });

  it("gains 4 glory each time it calls for Reinforcements; other lists gain nothing", () => {
    const papal = purseAdjustment({ factionId: "new-antioch", variantId: PAPAL }, data(), "reinforcements");
    expect({ ducats: papal.ducats, glory: papal.glory }).toEqual({ ducats: 0, glory: 4 });
    expect(papal.rules.map((r) => [r.name, r.page])).toEqual([["Specialist Force", 35]]);
    expect(purseAdjustment({ factionId: "new-antioch" }, data(), "reinforcements")).toMatchObject({ ducats: 0, glory: 0 });
  });
});

describe("Grail Devotee (p131): the second on a model is paid in glory", () => {
  it("one costs 15 ducats; the second adds 2 glory", () => {
    const PK = "black-grail/plague-knight";
    const first = upgradeId(PK, "Grail Devotee");
    const second = upgradeId(PK, "Second Grail Devotee");
    const knight = (ids: string[]) => warband("black-grail", [member(PK, [], ids)]);
    expect(money(warbandCost(knight([first]), data()))).toEqual({ ducats: 75, glory: 0 });
    expect(money(warbandCost(knight([first, second]), data()))).toEqual({ ducats: 75, glory: 2 });
    expect(accessFor(unit(PK), "grail-devotee")).toBeUndefined();
  });
});
