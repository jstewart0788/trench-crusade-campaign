import { describe, expect, it } from "vitest";
import { toWarbandExport } from "../src/export.js";
import { memberKeywords } from "../src/grants.js";
import { buildRulesData, readRulesFiles } from "../src/load.js";
import type { Warband, WarbandMember } from "../src/roster.js";
import { effectiveStats, validateWarband } from "../src/validate.js";
import { codes, data, member, repoRoot, warband } from "./fixtures.js";

// Stat and keyword changes from upgrades (upstream's own, read from the
// converted notes, and unit-rules.json upgradeEffects / variantKeywords
// withUpgrade) and from variants (statOverrides), against the real data.

const RAIDER = "heretic-naval-raiders/heretic-raider";
const PK = "black-grail/plague-knight";
const unit = (id: string) => data().unitsById.get(id)!;
const id = (unitId: string, name: string) => unit(unitId).upgrades!.find((g) => g.name === name && !g.paysFor)!.bsId;
const exported = (w: Warband, i = 0) => toWarbandExport(w, data(), { code: "T" }).members[i]!;
const stats = (w: Warband, m: WarbandMember) => effectiveStats(unit(m.unitId), w, data(), undefined, m);

describe("Legionnaires (NR p28, p112): the +1 shows wherever the stat line does", () => {
  const raiders = (ids: string[]) => warband("heretic-legion", [member(RAIDER, [], ids)], { subfactionId: "heretic-naval-raiders" });

  it("a Raider Legionnaire with Ranged exports Ranged +1 in its stats, description and GM notes; taking it away restores +0", () => {
    const leg = raiders([id(RAIDER, "Heretic Raider Legionnaire"), id(RAIDER, "Ranged")]);
    const out = exported(leg);
    expect(out.stats).toMatchObject({ ranged: "+1", melee: "+0" });
    expect(out.ttsDescription).toContain("[b]Rng[/b] +1");
    expect(out.ttsGmNotes.split("\n")[1]).toBe("Mov 6\"/Infantry | Rng +1 | Mel +0 | Arm 0 | Base 25mm");
    expect(exported(raiders([id(RAIDER, "Heretic Raider Legionnaire")])).stats).toMatchObject({ ranged: "+0", melee: "+0" });
  });

  it("a Heretic Legionnaire with Melee is Melee +1", () => {
    const T = "heretic-legion/heretic-trooper";
    const w = warband("heretic-legion", [member(T, [], [id(T, "Legionnaire"), id(T, "Melee")])]);
    expect(stats(w, w.members[0]!)).toMatchObject({ ranged: "+0", melee: "+1" });
  });
});

describe("Executor and Plague Knight Ranks (p142, p128)", () => {
  const dirge = (ids: string[]) => warband("black-grail", [member(PK, [], ids)], { variantId: "black-grail/dirge-of-the-great-hegemon" });

  it("the Executor is Ranged +1 with LEADER and TOUGH; a Plague Knight without it is neither", () => {
    const out = exported(dirge([id(PK, "The Executor")]));
    expect(out.stats.ranged).toBe("+1");
    expect(out.unit.keywords).toEqual(expect.arrayContaining(["Leader", "Tough"]));
    const plain = exported(dirge([]));
    expect(plain.stats.ranged).toBe("+0");
    expect(plain.unit.keywords).not.toContain("Leader");
  });

  it("Knight Companion of the Fly adds +1 DICE to the characteristic chosen", () => {
    const w = warband("black-grail", [member(PK, [], [id(PK, "Knight Companion of the Fly"), id(PK, "Melee")])]);
    expect(stats(w, w.members[0]!)).toMatchObject({ ranged: "+0", melee: "+3" });
  });
});

describe("other upgrades that change a model", () => {
  it("Takwin Homunculus formulas (p96-97): Inhuman Strength is Melee +1, 32mm and STRONG, so a 2-Handed Melee Weapon goes beside another; Wings is 8\"/Flying and FLYING", () => {
    const T = "iron-sultanate/takwin-homunculus";
    const wisdom = (ids: string[], items: string[] = []) => warband("iron-sultanate", [member("iron-sultanate/jabirean-alchemist", []), member(T, items, ids)], { variantId: "iron-sultanate/the-house-of-wisdom" });
    const strong = wisdom([id(T, "Human Hands"), id(T, "Inhuman Strength")], ["great-sword-axe", "sword-axe"]);
    expect(stats(strong, strong.members[1]!)).toMatchObject({ melee: "+1", base: "32mm" });
    expect(memberKeywords(strong.members[1]!, unit(T), data(), strong)).toContain("Strong");
    expect(codes(validateWarband(strong, data()))).not.toContain("battlekit-melee");
    expect(codes(validateWarband(wisdom([id(T, "Human Hands")], ["great-sword-axe", "sword-axe"]), data()))).toContain("battlekit-melee");
    const winged = wisdom([id(T, "Wings")]);
    expect(stats(winged, winged.members[1]!).movement).toEqual({ inches: 8, raw: "8\"/Flying", type: "Flying" });
    expect(exported(winged, 1).unit.keywords).toContain("Flying");
  });

  it("Thunderbolt of Alamut (p90) adds 2\" of Movement; a Master Assassin has LEADER and TOUGH", () => {
    const AS = "iron-sultanate/sultanate-assassin";
    const w = warband("iron-sultanate", [member(AS, [], [id(AS, "Master Assassin"), id(AS, "Thunderbolt of Alamut")])], { variantId: "iron-sultanate/fida-i-of-alamut-the-cabal-of-assassins" });
    expect(exported(w).stats.movement.raw).toBe("8\"/Infantry");
    expect(exported(w).unit.keywords).toEqual(expect.arrayContaining(["Leader", "Tough"]));
  });

  it("a Fly Thrall (Winged, p137) is 6\"/Flying with FLYING; a Berserker (p37) has NEGATE FEAR; Unseen Advance (NR p12) gives INFILTRATOR", () => {
    const fly = warband("black-grail", [member("black-grail/grail-thrall", [], [id("black-grail/grail-thrall", "Winged")])]);
    expect(exported(fly).stats.movement.raw).toBe("6\"/Flying");
    expect(exported(fly).unit.keywords).toContain("Flying");
    const ST = "new-antioch/shocktrooper";
    const eire = warband("new-antioch", [member(ST, [], [id(ST, "Fianna"), id(ST, "Berserker")])], { variantId: "new-antioch/eire-rangers" });
    expect(exported(eire).unit.keywords).toEqual(expect.arrayContaining(["Negate Fear", "Infiltrator", "Skirmisher"]));
    const raider = warband("heretic-legion", [member(RAIDER, [], [id(RAIDER, "Unseen Infiltrator")])], { subfactionId: "heretic-naval-raiders" });
    expect(exported(raider).unit.keywords).toContain("Infiltrator");
  });

  it("an item can give a keyword too: a Heretic Priest on a Tank Palanquin is STRONG", () => {
    const P = "heretic-legion/heretic-priest";
    const w = warband("heretic-legion", [member(P, ["tank-palanquin"])]);
    expect(memberKeywords(w.members[0]!, unit(P), data(), w)).toContain("Strong");
    expect(memberKeywords(member(P, []), unit(P), data(), w)).not.toContain("Strong");
  });

  it("Melee-focused (p40): an Alba Mechanized Heavy Infantry is Melee +1 and Ranged +0", () => {
    const MHI = "new-antioch/mechanized-heavy-infantry";
    const alba = warband("new-antioch", [member(MHI, [])], { variantId: "new-antioch/kingdom-of-alba-assault-detachment" });
    expect(effectiveStats(unit(MHI), alba, data())).toMatchObject({ melee: "+1", ranged: "+0" });
    expect(effectiveStats(unit(MHI), { ...alba, variantId: undefined }, data())).toMatchObject({ melee: "+0", ranged: "+1" });
  });

  it("the file is checked: an effect on an upgrade the unit lacks is refused", () => {
    const files = readRulesFiles(repoRoot);
    const bad = JSON.parse(JSON.stringify(files.unitRules));
    bad.upgradeEffects[0].upgrade = "Legionnaire Prime";
    expect(() => buildRulesData({ ...files, unitRules: bad })).toThrow(/heretic-legion\/heretic-trooper has no upgrade "Legionnaire Prime"/);
  });
});
