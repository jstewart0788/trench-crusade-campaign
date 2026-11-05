import { describe, expect, it } from "vitest";
import { toWarbandExport } from "../src/export.js";
import { memberKeywords } from "../src/grants.js";
import { importRoster, type RosterSelection, type RosterTree } from "../src/import/newrecruit.js";
import { buildRulesData, readRulesFiles } from "../src/load.js";
import { listKeywords, unitDisplayName } from "../src/presentation.js";
import type { Warband, WarbandMember } from "../src/roster.js";
import { limitContext, unitLimits, validateWarband } from "../src/validate.js";
import { codes, data, member, repoRoot, warband } from "./fixtures.js";

// unit-rules.json variantRenames and variantKeywords against the real data.
// Pages are Warbands of Trench Crusade unless marked NR.

const DEFENDERS = "iron-sultanate/defenders-of-the-iron-wall";
const FIDAI = "iron-sultanate/fida-i-of-alamut-the-cabal-of-assassins";
const ALBA = "new-antioch/kingdom-of-alba-assault-detachment";
const YUZ = "iron-sultanate/yuzbasi-captain";
const JAN = "iron-sultanate/janissary";
const unit = (id: string) => data().unitsById.get(id)!;
const errorsOf = (w: Warband) => codes(validateWarband(w, data()));
const sultanate = (members: WarbandMember[], variantId?: string) => warband("iron-sultanate", members, variantId ? { variantId } : {});
const upgradeId = (unitId: string, name: string) => unit(unitId).upgrades!.find((g) => g.name === name)!.bsId;

describe("variantRenames: Silahdar (p99)", () => {
  it("the Yüzbaşı is the Silahdar in a Defenders warband and the Yüzbaşı anywhere else; the id does not change", () => {
    expect(unitDisplayName(data(), sultanate([], DEFENDERS), unit(YUZ))).toBe("Silahdar");
    expect(unitDisplayName(data(), sultanate([]), unit(YUZ))).toBe("Yüzbaşı");
    expect(unitDisplayName(data(), sultanate([], "iron-sultanate/the-house-of-wisdom"), unit(YUZ))).toBe("Yüzbaşı");
    expect(unit(YUZ).name).toBe("Yüzbaşı");
  });

  it("the export, its TTS text and validation messages all say Silahdar; the model is still the Yüzbaşı's", () => {
    const w = sultanate([member(YUZ, [])], DEFENDERS);
    const out = toWarbandExport(w, data(), { code: "T" }).members[0]!;
    expect(out.unit).toMatchObject({ id: YUZ, name: "Silahdar" });
    expect(out.displayName).toBe("Silahdar");
    expect(out.ttsDescription.split("\n")[0]).toContain("Silahdar");
    expect(out.ttsGmNotes.split("\n")[0]).toBe("Silahdar");
    expect(out.model?.nickname).toBe(toWarbandExport(sultanate([member(YUZ, [])]), data(), { code: "T" }).members[0]!.model?.nickname);
    const named = toWarbandExport(sultanate([{ ...member(YUZ, []), name: "Kara Mustafa" }], DEFENDERS), data(), { code: "T" }).members[0]!;
    expect(named.ttsGmNotes.split("\n")[0]).toBe("Kara Mustafa (Silahdar)");

    const missing = validateWarband(sultanate([member(JAN, [])], DEFENDERS), data()).errors.find((e) => e.code === "unit-min")!;
    expect(missing.message).toBe("0 x Silahdar; at least 1 required");
    expect(validateWarband(sultanate([member(JAN, [])]), data()).errors.find((e) => e.code === "unit-min")!.message).toBe("0 x Yüzbaşı; at least 1 required");
    expect(validateWarband(sultanate([member(YUZ, ["catherine-wheel"])], DEFENDERS), data()).errors.find((e) => e.code === "item-not-available")!.message).toBe("Catherine Wheel is not in the Silahdar armoury");
  });

  it("the Silahdar has STRONG instead of Mubarizun, and the Defenders armoury it may draw on (Alaybozan 9, Anqā Guard 10, Explosive Charges 35)", () => {
    const silahdar = (items: string[], variantId?: string) => sultanate([member(YUZ, items)], variantId);
    expect(listKeywords(data(), silahdar([], DEFENDERS), unit(YUZ))).toContain("Strong");
    expect(listKeywords(data(), silahdar([]), unit(YUZ))).not.toContain("Strong");
    const out = toWarbandExport(silahdar([], DEFENDERS), data(), { code: "T" }).members[0]!;
    expect(out.unit.keywords).toContain("Strong");
    expect(out.abilities.map((a) => a.name)).not.toContain("Mubarizun");
    expect(toWarbandExport(silahdar([]), data(), { code: "T" }).members[0]!.abilities.map((a) => a.name)).toContain("Mubarizun");

    const kit = silahdar(["alaybozan", "anqa-guard", "explosive-charges"], DEFENDERS);
    expect(toWarbandExport(kit, data(), { code: "T" }).members[0]!.equipment.map((e) => [e.id, e.cost.ducats])).toEqual([
      ["alaybozan", 9],
      ["anqa-guard", 10],
      ["explosive-charges", 35],
    ]);
    expect(errorsOf(kit)).not.toContain("item-variant-locked");
    expect(errorsOf(silahdar(["anqa-guard"]))).toContain("item-variant-locked");
  });

  it("a NewRecruit roster that names a Silahdar imports it as the Yüzbaşı entry", () => {
    const sel = (name: string, type: string, selections: RosterSelection[] = []): RosterSelection => ({ name, type, number: 1, costs: [], categories: [], selections });
    const tree: RosterTree = {
      name: "Iron Wall",
      gameSystemName: "Trench Crusade",
      costs: [],
      forces: [{ catalogueName: "Iron Sultanate", selections: [sel("Silahdar", "model", [sel("Alaybozan", "upgrade")]), sel("Defenders of the Iron Wall", "upgrade")] }],
    };
    const { warband: w, unresolved } = importRoster(tree, data(), { id: "w" });
    expect(w.variantId).toBe(DEFENDERS);
    expect(w.members.map((m) => [m.unitId, m.equipmentItemIds])).toEqual([[YUZ, ["alaybozan"]]]);
    expect(unresolved).toEqual([]);
  });
});

describe("variantRenames and variantKeywords: Fida'i Dervishes (p90)", () => {
  it("Janissaries are Dervishes, 0-4, without STRONG and with IGNORE OFF-HAND WEAPON, and no Reinforced Armour", () => {
    const fidai = (members: WarbandMember[]) => sultanate(members, FIDAI);
    expect(unitDisplayName(data(), fidai([]), unit(JAN))).toBe("Dervish");
    const kw = listKeywords(data(), fidai([]), unit(JAN));
    expect(kw).not.toContain("Strong");
    expect(kw).toContain("Ignore Off-Hand Weapon");
    expect(unitLimits(unit(JAN), limitContext(fidai([]), data())).max).toBe(4);
    expect(unitLimits(unit(JAN), limitContext(sultanate([]), data())).max).toBe(6);
    const five = fidai(Array.from({ length: 5 }, () => member(JAN, [])));
    expect(validateWarband(five, data()).errors.find((e) => e.code === "unit-max")!.message).toBe("5 x Dervish; at most 4 per warband");
    expect(errorsOf(fidai([member(JAN, ["reinforced-armour"])]))).toContain("item-variant-locked");
  });

  it("without STRONG a Dervish cannot take a Great Sword/Axe as a one-handed weapon; a Janissary elsewhere can", () => {
    const kit = ["great-sword-axe", "sword-axe"];
    expect(errorsOf(sultanate([member(YUZ, []), member(JAN, kit)]))).not.toContain("battlekit-melee");
    expect(errorsOf(sultanate([member(JAN, kit)], FIDAI))).toContain("battlekit-melee");
  });
});

describe("variantKeywords: lists that give keywords for nothing", () => {
  it("Highland Strength (p39): an Alba Shock Trooper is STRONG, so a Great Sword/Axe counts as 1-Handed beside a Sword", () => {
    const trooper = member("new-antioch/shocktrooper", ["great-sword-axe", "sword-axe"]);
    const alba = warband("new-antioch", [member("new-antioch/lieutenant", []), trooper], { variantId: ALBA });
    expect(memberKeywords(trooper, unit("new-antioch/shocktrooper"), data(), alba)).toContain("Strong");
    expect(errorsOf(alba)).not.toContain("battlekit-melee");
    expect(errorsOf({ ...alba, variantId: undefined })).toContain("battlekit-melee");
    expect(toWarbandExport(alba, data(), { code: "T" }).members[1]!.unit.keywords).toEqual(expect.arrayContaining(["Strong", "Ignore Defended Obstacle"]));
  });

  it("the other overlays, each only under its list", () => {
    const has = (factionId: string, unitId: string, keyword: string, scope: Partial<Warband>) => listKeywords(data(), warband(factionId, [], scope), unit(unitId)).includes(keyword);
    const cases: [string, string, string, Partial<Warband>][] = [
      ["new-antioch", "new-antioch/trench-cleric", "Leader", { variantId: "new-antioch/papal-states-intervention-force" }],
      ["new-antioch", "new-antioch/lieutenant", "Skirmisher", { variantId: "new-antioch/eire-rangers" }],
      ["new-antioch", "new-antioch/yeoman", "Ignore Defended Obstacle", { variantId: ALBA }],
      ["trench-pilgrims", "trench-pilgrims/castigator", "Tough", { variantId: "trench-pilgrims/cavalcade-of-the-tenth-plague" }],
      ["heretic-legion", "heretic-legion/heretic-trooper", "Negate Gas", { variantId: "heretic-legion/trench-ghosts" }],
      ["heretic-legion", "heretic-legion/heretic-trooper", "Fear", { variantId: "heretic-legion/trench-ghosts" }],
      ["heretic-legion", "heretic-naval-raiders/heretic-captain", "Strong", { subfactionId: "heretic-naval-raiders", variantId: "heretic-naval-raiders/the-leviathan-shoal" }],
    ];
    for (const [f, u, k, scope] of cases) {
      expect([u, k, has(f, u, k, scope)]).toEqual([u, k, true]);
      const bare: Partial<Warband> = scope.subfactionId ? { subfactionId: scope.subfactionId } : {};
      expect([u, k, has(f, u, k, bare)]).toEqual([u, k, false]);
    }
    // "Models in a Kingdom of Alba warband" leaves out its Mercenaries (p172: they do not benefit from your warband's special rules).
    expect(listKeywords(data(), warband("new-antioch", [], { variantId: ALBA }), unit("new-antioch/mamluk-faris"))).not.toContain("Ignore Defended Obstacle");
  });
});

describe("variantRenames that need the upgrade", () => {
  it("a Trench Ghosts Chorister with the Banshee upgrade is a Barbed Wire Banshee (p118); without it, a Chorister", () => {
    const CH = "heretic-legion/chorister";
    const w = warband("heretic-legion", [member(CH, [], [upgradeId(CH, "Banshee")]), member(CH, [])], { variantId: "heretic-legion/trench-ghosts" });
    expect(toWarbandExport(w, data(), { code: "T" }).members.map((m) => m.unit.name)).toEqual(["Barbed Wire Banshee", "Chorister"]);
  });

  it("Master Assassin (p90) and Executor (p142) name the model that took the upgrade", () => {
    const AS = "iron-sultanate/sultanate-assassin";
    const fidai = sultanate([member(AS, [], [upgradeId(AS, "Master Assassin")])], FIDAI);
    expect(toWarbandExport(fidai, data(), { code: "T" }).members[0]!.unit.name).toBe("Master Assassin");
    const PK = "black-grail/plague-knight";
    const dirge = warband("black-grail", [member(PK, [], [upgradeId(PK, "The Executor")]), member("black-grail/grail-thrall", [])], { variantId: "black-grail/dirge-of-the-great-hegemon" });
    expect(toWarbandExport(dirge, data(), { code: "T" }).members.map((m) => m.unit.name)).toEqual(["Executor", "Bereaved"]);
  });

  it("the file is checked: a rename that names an upgrade the unit lacks, or a unit outside its list, is refused", () => {
    const files = readRulesFiles(repoRoot);
    const bad = JSON.parse(JSON.stringify(files.unitRules));
    bad.variantRenames.find((r: { id: string }) => r.id === "trench-ghosts-barbed-wire-banshee").withUpgrade = "Wailing";
    bad.variantKeywords[0].unitIds = ["iron-sultanate/janissary"];
    expect(() => buildRulesData({ ...files, unitRules: bad })).toThrow(/heretic-legion\/chorister has no upgrade "Wailing"[\s\S]*iron-sultanate\/janissary is not in the new-antioch\/papal-states-intervention-force list/);
  });
});
