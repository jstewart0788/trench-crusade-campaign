import { describe, expect, it } from "vitest";
import { checkBattlekit, classifyItem, strongChoice, tallyBattlekit, type CarriedItem } from "../src/battlekit.js";
import { accessFor } from "../src/data.js";
import { validateWarband } from "../src/validate.js";
import { data, member, warband } from "./fixtures.js";

const carried = (unitId: string, itemIds: string[]): CarriedItem[] => {
  const d = data();
  const unit = d.unitsById.get(unitId)!;
  const counts = new Map<string, number>();
  for (const id of itemIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([itemId, count]) => ({ itemId, item: d.equipmentById.get(itemId)!, access: accessFor(unit, itemId)!, count }));
};

describe("classifyItem", () => {
  it("reads kind, hands and stipulations the way the validator does", () => {
    const d = data();
    const yeoman = d.unitsById.get("new-antioch/yeoman")!;
    const c = (id: string) => classifyItem(d.equipmentById.get(id)!, accessFor(yeoman, id), d.headgearItemIds);
    expect(c("bolt-action-rifle")).toMatchObject({ kind: "ranged", hands: 2, combo: false, headgear: false, bayonet: false });
    expect(c("submachine-gun")).toMatchObject({ kind: "ranged", hands: 2, combo: true });
    expect(c("pistol")).toMatchObject({ kind: "ranged", hands: 1 });
    expect(c("sword-axe")).toMatchObject({ kind: "melee", hands: 1 });
    expect(c("great-sword-axe")).toMatchObject({ kind: "melee", hands: 2, heavy: true });
    expect(c("bayonet")).toMatchObject({ kind: "melee", hands: 2, combo: true, bayonet: true });
    expect(c("bayonet").attachesTo).toContain("Bolt-Action Rifle");
    expect(c("trench-shield")).toMatchObject({ kind: "shield", hands: 1 });
    expect(c("standard-armour")).toMatchObject({ kind: "armour", hands: 0 });
    expect(c("combat-helmet")).toMatchObject({ kind: "other", hands: 0, headgear: true });
    expect(c("frag-grenades")).toMatchObject({ kind: "grenade", hands: 0 });
    expect(c("troop-flag")).toMatchObject({ kind: "held", hands: 1 });
    expect(c("medikit")).toMatchObject({ kind: "other", hands: 0 });
    expect(classifyItem(d.equipmentById.get("living-instrument")!, undefined, d.headgearItemIds)).toMatchObject({ kind: "held", hands: 2 });
    expect(classifyItem(d.equipmentById.get("machine-gun")!, undefined, d.headgearItemIds).heavy).toBe(true);
  });
});

describe("headgear by identity", () => {
  it("is the set of items any armoury files under headgear", () => {
    expect([...data().headgearItemIds].sort()).toEqual(["anfarro", "combat-helmet", "iron-capirote"]);
  });

  it("counts the Sin Eater's built-in Combat Helmet as Headgear though its row is in the direct group", () => {
    const d = data();
    const sinEater = d.unitsById.get("black-grail/sin-eater")!;
    const row = accessFor(sinEater, "combat-helmet")!;
    expect(row).toMatchObject({ group: "direct", fixed: true });
    expect(classifyItem(d.equipmentById.get("combat-helmet")!, row, d.headgearItemIds).headgear).toBe(true);
    expect(classifyItem(d.equipmentById.get("medikit")!, { group: "direct" }, d.headgearItemIds).headgear).toBe(false);
  });

  it("stops a Huscarl wearing its Combat Helmet (a free direct row, not built in) and an Iron Capirote", () => {
    const d = data();
    const huscarl = d.unitsById.get("trench-pilgrims/huscarl")!;
    expect(accessFor(huscarl, "combat-helmet")).toMatchObject({ group: "direct" });
    expect(accessFor(huscarl, "combat-helmet")!.fixed).toBeUndefined();
    const both = validateWarband(warband("trench-pilgrims", [member(huscarl.id, ["combat-helmet", "iron-capirote"])]), d);
    expect(both.errors.filter((e) => e.code === "battlekit-headgear").map((e) => e.message)).toEqual(["Huscarl: one piece of Headgear (has 2)"]);
    for (const one of ["combat-helmet", "iron-capirote"]) {
      expect(validateWarband(warband("trench-pilgrims", [member(huscarl.id, [one])]), d).errors.map((e) => e.code)).not.toContain("battlekit-headgear");
    }
  });

  it("lets a plain model with one bought Combat Helmet validate", () => {
    const v = validateWarband(warband("new-antioch", [member("new-antioch/lieutenant", ["sword-axe", "pistol", "combat-helmet"]), member("new-antioch/yeoman", ["bolt-action-rifle", "combat-helmet"])]), data());
    expect(v.errors).toEqual([]);
  });

  it("never makes a unit's own built-in kit break the one-headgear rule", () => {
    const d = data();
    for (const unit of d.units) {
      const fixed = unit.equipmentAccess.filter((a) => a.fixed).map((a) => a.itemId);
      const report = checkBattlekit(unit, carried(unit.id, fixed), d.headgearItemIds);
      expect(report.errors.filter((e) => e.code === "battlekit-headgear"), unit.id).toEqual([]);
    }
  });
});

describe("strongChoice", () => {
  it("prefers the weapon without Shield Combo, else the first", () => {
    expect(strongChoice([{ combo: true }, { combo: false }])).toBe(1);
    expect(strongChoice([{ combo: true }, { combo: true }])).toBe(0);
    expect(strongChoice([{ combo: false }, { combo: false }])).toBe(0);
  });
});

describe("tallyBattlekit", () => {
  it("counts hands per pair and names the weapon a STRONG model takes one-handed", () => {
    const plain = tallyBattlekit(data().unitsById.get("new-antioch/yeoman")!, carried("new-antioch/yeoman", ["bolt-action-rifle", "bayonet", "pistol"]), data().headgearItemIds);
    expect(plain).toMatchObject({ strong: false, ranged1: 1, melee1: 0, rangedNames: ["Bolt-Action Rifle", "Pistol"] });
    expect(plain.ranged2).toEqual([{ name: "Bolt-Action Rifle", combo: false }]);
    expect(plain.melee2).toEqual([{ name: "Bayonet", combo: true }]);
    expect(plain.bayonets.map((b) => b.itemId)).toEqual(["bayonet"]);
    expect(plain.strongOneHanded).toBeUndefined();

    const bull = data().unitsById.get("iron-sultanate/brazen-bull")!;
    const twoHanders = bull.equipmentAccess.filter((a) => data().equipmentById.get(a.itemId)?.category === "melee" && data().equipmentById.get(a.itemId)?.hands === 2);
    expect(twoHanders.length).toBeGreaterThan(0);
    const strong = tallyBattlekit(bull, carried(bull.id, [twoHanders[0]!.itemId]), data().headgearItemIds);
    expect(strong.strong).toBe(true);
    expect(strong.strongOneHanded).toBe(data().equipmentById.get(twoHanders[0]!.itemId)!.name);
    expect(strong.melee2).toEqual([]);
    expect(strong.melee1).toBe(1);
  });
});

describe("checkBattlekit", () => {
  it("reports exactly what validateWarband reports for the model, minus the ids it adds", () => {
    const d = data();
    const kits: [string, string[]][] = [
      ["new-antioch/yeoman", ["bolt-action-rifle", "bayonet"]],
      ["new-antioch/yeoman", ["bolt-action-rifle", "bolt-action-rifle"]],
      ["new-antioch/yeoman", ["trench-shield", "bolt-action-rifle"]],
      ["new-antioch/yeoman", ["trench-shield", "submachine-gun"]],
      ["new-antioch/yeoman", ["frag-grenades", "molotov-cocktail"]],
      ["new-antioch/yeoman", ["standard-armour", "standard-armour"]],
      ["new-antioch/yeoman", ["bayonet"]],
      ["new-antioch/yeoman", ["troop-flag", "trench-shield", "pistol"]],
      ["new-antioch/yeoman", ["machine-gun", "trench-shield"]],
    ];
    for (const [unitId, items] of kits) {
      const unit = d.unitsById.get(unitId)!;
      const m = member(unitId, items);
      const full = validateWarband(warband("new-antioch", [m]), d);
      const report = checkBattlekit(unit, carried(unitId, items), d.headgearItemIds);
      const battlekit = (codes: { code: string }[]) => codes.map((e) => e.code).filter((c) => c.startsWith("battlekit-") || c === "bayonet-lug");
      expect(battlekit(report.errors)).toEqual(battlekit(full.errors));
      expect(report.errors.map((e) => e.message)).toEqual(full.errors.filter((e) => e.code.startsWith("battlekit-") || e.code === "bayonet-lug").map((e) => e.message));
      const memberWarnings = full.warnings.filter((w) => w.memberId === m.id).map((w) => w.message);
      for (const w of report.warnings) expect(memberWarnings).toContain(w.message);
      expect(memberWarnings.filter((w) => w.includes("Shield Combo"))).toEqual(report.warnings.map((w) => w.message));
      for (const e of full.errors.filter((e) => e.code.startsWith("battlekit-") || e.code === "bayonet-lug")) expect(e).toMatchObject({ memberId: m.id, unitId: unit.id });
    }
  });

  it("is clean for the rulebook's example kits", () => {
    expect(checkBattlekit(data().unitsById.get("new-antioch/lieutenant")!, carried("new-antioch/lieutenant", ["sword-axe", "pistol", "standard-armour"]), data().headgearItemIds)).toEqual({ errors: [], warnings: [] });
    expect(checkBattlekit(data().unitsById.get("new-antioch/yeoman")!, carried("new-antioch/yeoman", ["bolt-action-rifle", "bayonet", "combat-helmet", "frag-grenades", "medikit"]), data().headgearItemIds)).toEqual({ errors: [], warnings: [] });
  });
});
