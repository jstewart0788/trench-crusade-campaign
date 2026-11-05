import { describe, expect, it } from "vitest";
import { buildRulesData, readRulesFiles } from "../src/load.js";
import { itemsRuledOut, upgradeAllowed } from "../src/requirements.js";
import type { Warband, WarbandMember } from "../src/roster.js";
import { validateWarband } from "../src/validate.js";
import { codes, data, member, repoRoot, warband } from "./fixtures.js";

// unit-rules.json upgradeRequirements against the real data.

const RAIDER = "heretic-naval-raiders/heretic-raider";
const unit = (id: string) => data().unitsById.get(id)!;
const up = (unitId: string, name: string) => unit(unitId).upgrades!.find((g) => g.name === name && !g.paysFor)!;
const id = (unitId: string, name: string) => up(unitId, name).bsId;
const errorsOf = (w: Warband) => codes(validateWarband(w, data()));
const raiders = (members: WarbandMember[], extra: Partial<Warband> = {}) =>
  warband("heretic-legion", [member("heretic-naval-raiders/heretic-captain", ["sword-axe"]), ...members], { subfactionId: "heretic-naval-raiders", ...extra });

describe("Heretic Raider Legionnaires (NR p28): +1 Ranged or +1 Melee only after the Legionnaire upgrade, and only one", () => {
  const LEG = id(RAIDER, "Heretic Raider Legionnaire");
  const RANGED = id(RAIDER, "Ranged");
  const MELEE = id(RAIDER, "Melee");

  it("refuses +1 Ranged without Legionnaire, in plain words, and allows it with", () => {
    const bare = raiders([member(RAIDER, [], [RANGED]), member(RAIDER, [])]);
    const e = validateWarband(bare, data()).errors.find((x) => x.code === "upgrade-requires")!;
    expect(e.message).toBe("Heretic Raider: Ranged needs Heretic Raider Legionnaire first (Heretic Naval Raiders p28)");
    expect(errorsOf(raiders([member(RAIDER, [], [LEG, RANGED]), member(RAIDER, [])]))).toEqual([]);
  });

  it("refuses both +1s on one Legionnaire", () => {
    const both = raiders([member(RAIDER, [], [LEG, RANGED, MELEE]), member(RAIDER, [])]);
    const errs = validateWarband(both, data()).errors.filter((x) => x.code === "upgrade-excludes");
    expect(errs.map((x) => x.message)).toEqual(["Heretic Raider: only one of Ranged or Melee on one model, not Ranged and Melee (Heretic Naval Raiders p28)"]);
  });

  it("offers +1 only once the Legionnaire is held (or staged into the member), and keeps one already taken listed", () => {
    const w = raiders([member(RAIDER, [])]);
    const m = w.members[1]!;
    expect(upgradeAllowed(data(), w, m, unit(RAIDER), up(RAIDER, "Ranged"))).toBe(false);
    expect(upgradeAllowed(data(), w, { ...m, upgradeIds: [LEG] }, unit(RAIDER), up(RAIDER, "Ranged"))).toBe(true);
    expect(upgradeAllowed(data(), w, { ...m, upgradeIds: [LEG, MELEE] }, unit(RAIDER), up(RAIDER, "Ranged"))).toBe(false);
  });

  it("the same for Heretic Legionnaires (p112)", () => {
    const T = "heretic-legion/heretic-trooper";
    const legion = (ids: string[]) => warband("heretic-legion", [member("heretic-legion/heretic-priest", ["sword-axe"]), member(T, [], ids), member(T, [])]);
    expect(errorsOf(legion([id(T, "Melee")]))).toContain("upgrade-requires");
    expect(errorsOf(legion([id(T, "Legionnaire"), id(T, "Melee")]))).not.toContain("upgrade-requires");
  });
});

describe("other upgrade prerequisites", () => {
  it("Plague Knight Ranks (p128): one Rank; the +1 needs Knight Companion of the Fly; a claimed weapon needs Knight of the Rotten Cross, one only", () => {
    const PK = "black-grail/plague-knight";
    const knight = (names: string[]) => warband("black-grail", [member(PK, [], names.map((n) => id(PK, n)))]);
    expect(errorsOf(knight(["Plague Almoner", "Knight Companion of the Fly"]))).toContain("upgrade-excludes");
    expect(errorsOf(knight(["Ranged"]))).toContain("upgrade-requires");
    expect(errorsOf(knight(["Knight Companion of the Fly", "Ranged"]))).toEqual([]);
    expect(errorsOf(knight(["Hellblade"]))).toContain("upgrade-requires");
    expect(errorsOf(knight(["Knight of the Rotten Cross", "Hellblade", "Machine Gun"]))).toContain("upgrade-excludes");
  });

  it("Takwin Homunculus (p96-97): Gargantuan Size needs all three of Human Hands, Inhuman Strength and Massive Size; Hawk and Hypnotic Eyes only with Two Heads", () => {
    const T = "iron-sultanate/takwin-homunculus";
    const homunculus = (names: string[]) => warband("iron-sultanate", [member("iron-sultanate/jabirean-alchemist", []), member(T, [], names.map((n) => id(T, n)))], { variantId: "iron-sultanate/the-house-of-wisdom" });
    const garg = validateWarband(homunculus(["Human Hands", "Gargantuan Size"]), data()).errors.find((e) => e.code === "upgrade-requires")!;
    expect(garg.message).toBe("Takwin Homunculus: Gargantuan Size needs Inhuman Strength and Massive Size first (p96)");
    expect(errorsOf(homunculus(["Human Hands", "Inhuman Strength", "Massive Size", "Gargantuan Size"]))).not.toContain("upgrade-requires");
    expect(errorsOf(homunculus(["Human Hands", "Hawk Eyes", "Hypnotic Eyes"]))).toContain("upgrade-excludes");
    expect(errorsOf(homunculus(["Human Hands", "Hawk Eyes", "Hypnotic Eyes", "Two Heads"]))).not.toContain("upgrade-excludes");
  });

  it("Berserker (p37): a Shock Trooper must be one of the Fianna first", () => {
    const ST = "new-antioch/shocktrooper";
    const eire = (names: string[]) => warband("new-antioch", [member("new-antioch/lieutenant", []), member(ST, [], names.map((n) => id(ST, n)))], { variantId: "new-antioch/eire-rangers" });
    expect(errorsOf(eire(["Berserker"]))).toContain("upgrade-requires");
    expect(errorsOf(eire(["Fianna", "Berserker"]))).not.toContain("upgrade-requires");
  });

  it("Kavasses (p94): Studied Blade and Light Skirmisher exclude each other; other House of Wisdom Azebs may still be Light Skirmishers", () => {
    const AZ = "iron-sultanate/azeb";
    const wisdom = (names: string[]) => warband("iron-sultanate", [member("iron-sultanate/jabirean-alchemist", []), member(AZ, [], names.map((n) => id(AZ, n)))], { variantId: "iron-sultanate/the-house-of-wisdom" });
    expect(errorsOf(wisdom(["Light Skirmisher"]))).toEqual([]);
    expect(errorsOf(wisdom(["Studied Blade", "Light Skirmisher"]))).toContain("upgrade-excludes");
  });

  it("Medicine (p94): an Alchemist with it cannot have a Medi-kit, and is not offered one", () => {
    const AL = "iron-sultanate/jabirean-alchemist";
    const w = warband("iron-sultanate", [member(AL, ["medikit"], [id(AL, "Medicine")])], { variantId: "iron-sultanate/the-house-of-wisdom" });
    expect(validateWarband(w, data()).errors.find((e) => e.code === "upgrade-excludes")!.message).toBe("Jabirean Alchemist: Medicine cannot be taken by a model with a Medikit (p94)");
    expect(itemsRuledOut(data(), w.members[0]!, unit(AL))).toEqual(new Set(["medikit"]));
  });

  it("Unseen Advance (NR p12): not for a model with ELITE, including the Leviathan Shoal's ELITE Anointed", () => {
    const AHR = "heretic-naval-raiders/anointed-heretic-raider";
    const shoal = (ids: string[]) => warband("heretic-legion", [member("heretic-naval-raiders/heretic-captain", ["sword-axe"]), member(AHR, [], ids)], { subfactionId: "heretic-naval-raiders", variantId: "heretic-naval-raiders/the-leviathan-shoal" });
    expect(errorsOf(shoal([id(AHR, "Unseen Infiltrator")]))).not.toContain("upgrade-keyword");
    expect(errorsOf(shoal([id(AHR, "Leviathan Elite"), id(AHR, "Unseen Infiltrator")]))).toContain("upgrade-keyword");
  });

  it("the file is checked: a rule naming an upgrade the unit lacks is refused", () => {
    const files = readRulesFiles(repoRoot);
    const bad = JSON.parse(JSON.stringify(files.unitRules));
    bad.upgradeRequirements[0].requires = ["Arch-Legionnaire"];
    expect(() => buildRulesData({ ...files, unitRules: bad })).toThrow(/heretic-legion\/heretic-trooper has no upgrade "Arch-Legionnaire"/);
  });
});
