import { describe, expect, it } from "vitest";
import { foreignBuyable, foreignHoldings, lentBy } from "../src/armoury.js";
import { itemCost, warbandCost } from "../src/cost.js";
import { toWarbandExport } from "../src/export.js";
import { firstPurchase } from "../src/history.js";
import { accessFor } from "../src/load.js";
import type { Purchase, Warband, WarbandMember } from "../src/roster.js";
import { Warband as WarbandSchema } from "../src/roster.js";
import { validateWarband } from "../src/validate.js";
import { codes, data, member, warband } from "./fixtures.js";

// TC-003f against the real data: purchase history (Cold Steel, Supreme
// Blessing), lent Battlekit (Corrupt Merchants, Weapon Collections), the
// Grand Cannon battery, the Grail Devotee's currency and Mammon's Chosen.

const ALBA = "new-antioch/kingdom-of-alba-assault-detachment";
const KOA = "heretic-legion/knights-of-avarice";
const WISDOM = "iron-sultanate/the-house-of-wisdom";
const DEFENDERS = "iron-sultanate/defenders-of-the-iron-wall";
const unit = (id: string) => data().unitsById.get(id)!;
const errorsOf = (w: Warband) => codes(validateWarband(w, data()));
const bought = (memberId: string, itemId: string, game: number): Purchase => ({ itemId, memberId, game });
const upgradeId = (unitId: string, name: string, paid?: "glory") => unit(unitId).upgrades!.find((g) => g.name === name && (paid ? g.paysFor : !g.paysFor))!.bsId;

describe("purchase history: the schema", () => {
  it("is optional: a roster saved before it was kept still parses, and kit without a record counts as bought at creation", () => {
    const legacy = warband("new-antioch", [member("new-antioch/yeoman", ["sword-axe"])]);
    expect(WarbandSchema.safeParse(legacy).success).toBe(true);
    expect(firstPurchase(legacy, "sword-axe")).toEqual({ state: "held", copy: { memberId: legacy.members[0]!.id, within: 0 }, game: 1 });
    expect(WarbandSchema.safeParse({ ...legacy, purchases: [bought("m1", "sword-axe", 0)] }).success).toBe(false);
  });
});

describe("Cold Steel (p39): the first purchase of each Melee Weapon is halved, rounded up (Digital Rulebook p30)", () => {
  const yeoman = (id: string, items: string[]): WarbandMember => ({ id, unitId: "new-antioch/yeoman", equipmentItemIds: items });
  const alba = (members: WarbandMember[], purchases?: Purchase[]): Warband => ({ ...warband("new-antioch", members, { variantId: ALBA }), ...(purchases ? { purchases } : {}) });
  const swordCosts = (w: Warband) => warbandCost(w, data()).perMember.map((m) => m.items.find((i) => i.id === "sword-axe")?.ducats);

  it("the book's example: the first Sword/Axe is 2, any further 4; a Great Sword/Axe (7 under Claymore Smiths) is 4", () => {
    expect(swordCosts(alba([yeoman("a", ["sword-axe"]), yeoman("b", ["sword-axe"])]))).toEqual([2, 4]);
    expect(itemCost(data(), alba([]), "new-antioch/yeoman", "sword-axe").ducats).toBe(2);
    expect(itemCost(data(), alba([yeoman("a", ["sword-axe"])]), "new-antioch/yeoman", "sword-axe").ducats).toBe(4);
    expect(itemCost(data(), alba([]), "new-antioch/yeoman", "great-sword-axe").ducats).toBe(4);
    expect(swordCosts({ ...alba([yeoman("a", ["sword-axe"]), yeoman("b", ["sword-axe"])]), variantId: undefined })).toEqual([4, 4]);
    expect(itemCost(data(), alba([]), "new-antioch/yeoman", "bolt-action-rifle").ducats).toBe(5);
  });

  it("follows the record: the first one bought keeps the discount wherever it sits, and once it is gone nothing is first again", () => {
    const both = [yeoman("a", ["sword-axe"]), yeoman("b", ["sword-axe"])];
    expect(swordCosts(alba(both, [bought("b", "sword-axe", 1), bought("a", "sword-axe", 2)]))).toEqual([4, 2]);
    const gone = alba([yeoman("a", ["sword-axe"])], [bought("b", "sword-axe", 1), bought("a", "sword-axe", 2)]);
    expect(firstPurchase(gone, "sword-axe")).toEqual({ state: "gone" });
    expect(swordCosts(gone)).toEqual([4]);
    expect(itemCost(data(), gone, "new-antioch/yeoman", "sword-axe").ducats).toBe(4);
    // Lost and bought again by the same model: the copy held is the later one.
    expect(swordCosts(alba([yeoman("a", ["sword-axe"])], [bought("a", "sword-axe", 1), bought("a", "sword-axe", 3)]))).toEqual([4]);
  });
});

describe("Corrupt Merchants (p120) and Weapon Collections (p95): Battlekit lent by another armoury", () => {
  const TROOPER = "heretic-legion/heretic-trooper";
  const PRIEST = "heretic-legion/heretic-priest";
  const koa = (members: WarbandMember[], extra: Partial<Warband> = {}) => warband("heretic-legion", [member(PRIEST, ["sword-axe"]), ...members], { variantId: KOA, ...extra });

  it("marks the converted variant rows that come from the other armouries, and only those", () => {
    expect(lentBy(data(), accessFor(unit(TROOPER), "musket"))?.id).toBe("koa-corrupt-merchants-iron-sultanate");
    expect(lentBy(data(), accessFor(unit(TROOPER), "heavy-shotgun"))?.id).toBe("koa-corrupt-merchants-new-antioch");
    expect(lentBy(data(), accessFor(unit(TROOPER), "coin-hammer"))).toBeUndefined();
    expect(lentBy(data(), accessFor(unit("iron-sultanate/janissary"), "punt-gun"))?.id).toBe("wisdom-weapon-collections-trench-pilgrims");
  });

  it("one piece from each armoury when the warband is created", () => {
    const one = koa([member(TROOPER, ["musket"]), member(TROOPER, ["heavy-shotgun"])]);
    expect(errorsOf(one)).not.toContain("foreign-armoury-limit");
    expect(foreignHoldings(data(), one).map((h) => [h.rule.id, h.itemId])).toEqual([
      ["koa-corrupt-merchants-iron-sultanate", "musket"],
      ["koa-corrupt-merchants-new-antioch", "heavy-shotgun"],
    ]);
    const two = koa([member(TROOPER, ["musket"]), member(TROOPER, ["jezzail"])]);
    expect(validateWarband(two, data()).errors.filter((e) => e.code === "foreign-armoury-limit").map((e) => e.itemId)).toEqual(["jezzail"]);
    const rule = lentBy(data(), accessFor(unit(TROOPER), "jezzail"))!;
    expect(foreignBuyable(data(), koa([]), rule, "jezzail").ok).toBe(true);
    expect(foreignBuyable(data(), koa([member(TROOPER, ["musket"])]), rule, "jezzail").ok).toBe(false);
  });

  it("after creation only to replace what was bought then; kit with no record counts as bought at creation", () => {
    const later = (purchases?: Purchase[]) => koa([{ id: "t", unitId: TROOPER, equipmentItemIds: ["musket"] }], { gameNumber: 3, ...(purchases ? { purchases } : {}) });
    expect(errorsOf(later())).not.toContain("foreign-armoury-after-creation");
    expect(errorsOf(later([bought("t", "musket", 3)]))).toContain("foreign-armoury-after-creation");
    expect(errorsOf(later([bought("t", "musket", 1), bought("t", "musket", 3)]))).not.toContain("foreign-armoury-after-creation");
    const rule = lentBy(data(), accessFor(unit(TROOPER), "musket"))!;
    expect(foreignBuyable(data(), koa([], { gameNumber: 3 }), rule, "musket")).toMatchObject({ ok: false });
    expect(foreignBuyable(data(), koa([], { gameNumber: 3, purchases: [bought("gone", "musket", 1)] }), rule, "musket").ok).toBe(true);
  });

  it("House of Wisdom: a Trench Pilgrim Punt Gun and a New Antioch rifle at creation", () => {
    const wisdom = warband("iron-sultanate", [member("iron-sultanate/jabirean-alchemist", []), member("iron-sultanate/janissary", ["punt-gun"]), member("iron-sultanate/janissary", ["automatic-rifle"])], { variantId: WISDOM });
    expect(errorsOf(wisdom)).not.toContain("foreign-armoury-limit");
    expect(errorsOf({ ...wisdom, members: [...wisdom.members, member("iron-sultanate/janissary", ["war-cross"])] })).toContain("foreign-armoury-limit");
  });
});

describe("Grand Cannon gun battery (p99): held by the warband, not a model", () => {
  const BULL = "iron-sultanate/brazen-bull";
  const defenders = (members: WarbandMember[], armoury: string[], variantId: string | null = DEFENDERS) =>
    warband("iron-sultanate", [member("iron-sultanate/yuzbasi-captain", []), ...members], { ...(variantId ? { variantId } : {}), armoury });

  it("costs 60 ducats, counts toward the 2 in total, and only the Defenders may hold one", () => {
    const one = defenders([], ["sultanate-grand-cannon"]);
    expect(warbandCost(one, data())).toMatchObject({ ducats: 70 + 60, armoury: [{ id: "sultanate-grand-cannon", ducats: 60, glory: 0 }] });
    expect(errorsOf(one)).toEqual([]);
    expect(errorsOf(defenders([member(BULL, ["sultanate-grand-cannon"])], ["sultanate-grand-cannon"]))).not.toContain("item-max-per-warband");
    expect(errorsOf(defenders([member(BULL, ["sultanate-grand-cannon"])], ["sultanate-grand-cannon", "sultanate-grand-cannon"]))).toContain("item-max-per-warband");
    expect(errorsOf(defenders([], ["sultanate-grand-cannon"], null))).toContain("armoury-item-not-allowed");
    expect(errorsOf(defenders([], ["sword-axe"]))).toContain("armoury-item-not-allowed");
  });

  it("no more than 1 given to a Brazen Bull", () => {
    expect(errorsOf(defenders([member(BULL, ["sultanate-grand-cannon", "sultanate-grand-cannon"])], []))).toContain("item-max-per-model");
  });

  it("exports as a warband-level entry, and not at all when the warband holds nothing", () => {
    const out = toWarbandExport(defenders([], ["sultanate-grand-cannon"]), data(), { code: "T" });
    expect(out.warband.armoury).toEqual([expect.objectContaining({ id: "sultanate-grand-cannon", name: "Sultanate Grand Cannon", cost: { ducats: 60, glory: 0 } })]);
    expect(out.members.flatMap((m) => m.equipment.map((e) => e.id))).not.toContain("sultanate-grand-cannon");
    expect("armoury" in toWarbandExport(defenders([], []), data(), { code: "T" }).warband).toBe(false);
  });
});

describe("Grail Devotee (p131): 15 ducats or 2 glory, the second always glory", () => {
  const PK = "black-grail/plague-knight";
  const knight = (ids: string[]) => member(PK, [], ids);
  const grail = (members: WarbandMember[]) => warband("black-grail", members, { glory: 10 });

  it("offers the first at either price; the choice is the upgrade taken", () => {
    const options = unit(PK).upgrades!.filter((g) => g.name === "Grail Devotee").map((g) => g.cost);
    expect(options).toEqual([
      { ducats: 15, glory: 0 },
      { ducats: 0, glory: 2 },
    ]);
    expect(warbandCost(grail([knight([upgradeId(PK, "Grail Devotee", "glory")])]), data())).toMatchObject({ ducats: 60, glory: 2 });
    expect(warbandCost(grail([knight([upgradeId(PK, "Grail Devotee", "glory"), upgradeId(PK, "Second Grail Devotee")])]), data())).toMatchObject({ ducats: 60, glory: 4 });
    expect(errorsOf(grail([knight([upgradeId(PK, "Grail Devotee", "glory"), upgradeId(PK, "Second Grail Devotee")])]))).toEqual([]);
  });

  it("one first Devotee per model, a second needs a first, and the Limit counts models whichever way they paid", () => {
    expect(errorsOf(grail([knight([upgradeId(PK, "Grail Devotee"), upgradeId(PK, "Grail Devotee", "glory")])]))).toContain("upgrade-duplicate");
    expect(errorsOf(grail([knight([upgradeId(PK, "Second Grail Devotee")])]))).toContain("upgrade-variant-locked");
    const three = grail([knight([upgradeId(PK, "Grail Devotee")]), knight([upgradeId(PK, "Grail Devotee", "glory")]), member("black-grail/lord-of-tumours", [], [upgradeId("black-grail/lord-of-tumours", "Grail Devotee", "glory")])]);
    expect(errorsOf(three)).toContain("upgrade-max-per-warband");
  });
});

describe("Mammon's Chosen (p120): no model under 80 ducats with its kit, but a Wretched", () => {
  const TROOPER = "heretic-legion/heretic-trooper";
  const koa = (members: WarbandMember[]) => warband("heretic-legion", [member("heretic-legion/heretic-priest", ["sword-axe"]), ...members], { variantId: KOA });

  it("a bare Heretic Trooper (30) is refused, the same Trooper kitted to 80 is not, and a Wretched is never held to it", () => {
    const bare = validateWarband(koa([member(TROOPER, [])]), data()).errors.find((e) => e.code === "model-under-minimum")!;
    expect(bare.message).toBe("Mammon's Chosen: Heretic Trooper with its kit costs 30 ducats; every model but a Wretched must cost at least 80 (p120)");
    // 30 + Sniper Rifle 35 + Standard Armour 15 = 80: "less than 80" is refused, 80 is not.
    expect(errorsOf(koa([member(TROOPER, ["sniper-rifle", "standard-armour"])]))).not.toContain("model-under-minimum");
    expect(errorsOf(koa([member(TROOPER, ["sniper-rifle", "gas-mask", "combat-helmet"])]))).toContain("model-under-minimum");
    expect(errorsOf(koa([member("heretic-legion/wretched", [])]))).not.toContain("model-under-minimum");
    expect(errorsOf({ ...koa([member(TROOPER, [])]), variantId: undefined })).not.toContain("model-under-minimum");
  });

  it("a Goetic Warlock bought for glory has no ducat cost to measure and is not held to it", () => {
    const two = koa([member("heretic-legion/goetic-warlock", []), member("heretic-legion/goetic-warlock", [])]);
    expect(errorsOf(two)).not.toContain("model-under-minimum");
  });
});
