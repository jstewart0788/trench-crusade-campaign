import { describe, expect, it } from "vitest";
import { classifyItem } from "../src/battlekit.js";
import { accessFor, buildRulesData, readRulesFiles, RulesDataError, type RulesData } from "../src/load.js";
import { toWarbandExport, renderTtsDescription } from "../src/export.js";
import type { Warband } from "../src/roster.js";
import { effectiveStats, limitContext, preGameChoices, unitLimits, validateWarband } from "../src/validate.js";
import { codes, data, member, repoRoot, warband } from "./fixtures.js";

const SHRINE = "trench-pilgrims/anchorite-shrine";
const METHODIUS = "trench-pilgrims/war-pilgrimage-of-saint-methodius";
const FITTINGS = ["gas-filters", "holy-diesel-engine", "piston-legs"];
const pilgrims = (members: ReturnType<typeof member>[], variantId?: string): Warband => warband("trench-pilgrims", members, variantId ? { variantId } : {});
const errorsOf = (w: Warband, d: RulesData = data()) => codes(validateWarband(w, d));

describe("unit-rules.json loads, checks and annotates", () => {
  it("marks the Shrine's Catherine Wheel as a replaceable default, its six replacements as 1-handed, and the fittings permanent", () => {
    const shrine = data().unitsById.get(SHRINE)!;
    expect(accessFor(shrine, "catherine-wheel")).toMatchObject({ replaceableDefault: "anchorite-catherine-wheel" });
    for (const id of ["anti-materiel-rifle", "autocannon", "gas-censer", "heavy-flamethrower", "punt-gun", "trench-mortar"]) {
      expect(accessFor(shrine, id)).toMatchObject({ replaces: "catherine-wheel", hands: 1 });
    }
    for (const id of [...FITTINGS, "grand-anchorite", "hallowed-anchorite", "sacred-geometry", "wrathful-cherub-face"]) expect(accessFor(shrine, id)?.permanent).toBe(true);
    expect(data().unitRules.byUnit.get(SHRINE)!.groupLimits.map((g) => [g.name, g.maxPerModel])).toEqual([["Anchorite Battlekit", 2]]);
  });

  it("refuses a file that names a unit or an item the data does not have", () => {
    const files = readRulesFiles(repoRoot);
    const bad = JSON.parse(JSON.stringify(files.unitRules));
    bad.groupLimits[0].unitIds = ["trench-pilgrims/nobody"];
    bad.permanentItems[0].itemIds.push("laser");
    try {
      buildRulesData({ ...files, unitRules: bad });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(RulesDataError);
      expect((e as RulesDataError).file).toBe("data/rules/unit-rules.json");
      expect((e as RulesDataError).issues.join("\n")).toMatch(/unknown unit "trench-pilgrims\/nobody"[\s\S]*"laser" is not in the trench-pilgrims\/anchorite-shrine armoury/);
    }
  });

  it("counts a replacement as 1-handed on the Shrine only", () => {
    const d = data();
    const autocannon = d.equipmentById.get("autocannon")!;
    expect(classifyItem(autocannon, accessFor(d.unitsById.get(SHRINE)!, "autocannon"), d.headgearItemIds).hands).toBe(1);
    expect(classifyItem(autocannon, undefined, d.headgearItemIds).hands).toBe(2);
  });
});

describe("1. replaceable built-in: the Catherine Wheel", () => {
  it("a core Shrine without its wheel is an error; with it, legal", () => {
    expect(errorsOf(pilgrims([member(SHRINE, [])]))).toContain("built-in-missing");
    expect(validateWarband(pilgrims([member(SHRINE, [])]), data()).errors.find((e) => e.code === "built-in-missing")!.message).toBe("Anchorite Shrine must carry its Catherine Wheel (p59)");
    expect(errorsOf(pilgrims([member(SHRINE, ["catherine-wheel"])]))).not.toContain("built-in-missing");
  });

  it("under Methodius the wheel may be swapped for one Anchorite Ranged Weapon, which fits the Shrine's hands", () => {
    const swapped = errorsOf(pilgrims([member(SHRINE, ["autocannon"])], METHODIUS));
    expect(swapped.filter((c) => c.startsWith("built-in") || c.startsWith("battlekit"))).toEqual([]);
    expect(errorsOf(pilgrims([member(SHRINE, [])], METHODIUS))).toContain("built-in-missing");
    expect(validateWarband(pilgrims([member(SHRINE, [])], METHODIUS), data()).errors.find((e) => e.code === "built-in-missing")!.message).toContain("or one of its replacements (p64)");
  });

  it("holds exactly one: wheel plus a replacement, or two replacements, is an error", () => {
    expect(errorsOf(pilgrims([member(SHRINE, ["catherine-wheel", "autocannon"])], METHODIUS))).toContain("built-in-replacement");
    expect(errorsOf(pilgrims([member(SHRINE, ["punt-gun", "autocannon"])], METHODIUS))).toContain("built-in-replacement");
  });

  it("a replacement outside Methodius is refused", () => {
    const v = validateWarband(pilgrims([member(SHRINE, ["autocannon"])]), data());
    const e = v.errors.find((x) => x.code === "built-in-replacement")!;
    expect(e.message).toBe("Anchorite Shrine can only swap its Catherine Wheel for Autocannon in a War Pilgrimage of Saint Methodius warband (p64)");
  });
});

describe("2. group limit per model: Anchorite Battlekit", () => {
  it("two fittings are fine, three are an error", () => {
    expect(errorsOf(pilgrims([member(SHRINE, ["catherine-wheel", ...FITTINGS.slice(0, 2)])], METHODIUS))).not.toContain("item-group-limit");
    const three = validateWarband(pilgrims([member(SHRINE, ["catherine-wheel", ...FITTINGS])], METHODIUS), data());
    expect(three.errors.filter((e) => e.code === "item-group-limit").map((e) => e.message)).toEqual(["Anchorite Shrine: up to 2 Anchorite Battlekit (has 3, p64)"]);
  });

  it("the Limit: 1 fittings keep their own limits: Grand Anchorite twice is an error on one Shrine or across two", () => {
    expect(errorsOf(pilgrims([member(SHRINE, ["catherine-wheel", "grand-anchorite", "grand-anchorite"])], METHODIUS))).toContain("item-max-per-model");
    expect(errorsOf(pilgrims([member(SHRINE, ["catherine-wheel", "grand-anchorite"]), member(SHRINE, ["catherine-wheel", "grand-anchorite"])], METHODIUS))).toContain("item-max-per-warband");
  });
});

describe("4. stat override: Ranged +0 under Methodius", () => {
  it("only under Methodius, on the card and in the export", () => {
    const d = data();
    const shrine = d.unitsById.get(SHRINE)!;
    expect(shrine.stats.ranged).toBe("n/a");
    const core = pilgrims([member(SHRINE, ["catherine-wheel"])]);
    const meth = pilgrims([member(SHRINE, ["catherine-wheel"])], METHODIUS);
    expect(effectiveStats(shrine, core, d).ranged).toBe("n/a");
    expect(effectiveStats(shrine, meth, d).ranged).toBe("+0");
    expect(effectiveStats(shrine, meth, d).melee).toBe(shrine.stats.melee);
    expect(toWarbandExport(meth, d, { code: "T" }).members[0]!.stats.ranged).toBe("+0");
    expect(toWarbandExport(core, d, { code: "T" }).members[0]!.stats.ranged).toBe("n/a");
  });
});

describe("5. unit cap from the variant: two Shrines under Methodius", () => {
  it("is already in the converter's limit text: max 1, or 2 in a War Pilgrimage of Saint Methodius", () => {
    const d = data();
    const shrine = d.unitsById.get(SHRINE)!;
    expect(unitLimits(shrine, limitContext(pilgrims([]), d)).max).toBe(1);
    expect(unitLimits(shrine, limitContext(pilgrims([], METHODIUS), d)).max).toBe(2);
    const two = (v?: string) => pilgrims([member(SHRINE, ["catherine-wheel"]), member(SHRINE, ["catherine-wheel"])], v);
    expect(errorsOf(two(METHODIUS))).not.toContain("unit-max");
    expect(errorsOf(two())).toContain("unit-max");
  });
});

describe("6. Broken on the Wheel", () => {
  const roster = (variantId?: string, preGame?: Record<string, string | null>) => {
    const w = pilgrims(
      [
        { ...member(SHRINE, ["catherine-wheel"]), id: "shrine" },
        { ...member("trench-pilgrims/trench-pilgrim", []), id: "pilgrim", name: "Brother Tobiah" },
        { ...member("trench-pilgrims/ecclesiastic-prisoner", []), id: "prisoner" },
        { ...member("trench-pilgrims/war-prophet", []), id: "prophet" },
      ],
      variantId,
    );
    return preGame ? { ...w, preGame } : w;
  };

  it("offers only Trench Pilgrims and Ecclesiastic Prisoners, and nothing under Methodius (Mortal Sin, p64)", () => {
    const [core] = preGameChoices(roster(), data());
    expect(core).toMatchObject({ available: true, chosen: null });
    expect(core!.candidates.map((m) => m.id)).toEqual(["pilgrim", "prisoner"]);
    const [meth] = preGameChoices(roster(METHODIUS), data());
    expect(meth).toMatchObject({ available: false, candidates: [] });
    expect(meth!.rule.unavailable!.page).toBe(64);
    expect(preGameChoices(pilgrims([member("trench-pilgrims/trench-pilgrim", [])]), data())).toEqual([]);
  });

  it("excludes a model with Wrath of God (p61)", () => {
    const d = data();
    const pilgrim = d.unitsById.get("trench-pilgrims/trench-pilgrim")!;
    const patched: RulesData = { ...d, unitsById: new Map(d.unitsById).set(pilgrim.id, { ...pilgrim, upgrades: [...(pilgrim.upgrades ?? []), { bsId: "wog", name: "Wrath of God", group: "upgrades" }] }) };
    const w = roster();
    const wrathful = { ...w, members: w.members.map((m) => (m.id === "pilgrim" ? { ...m, upgradeIds: ["wog"] } : m)) };
    expect(preGameChoices(wrathful, patched)[0]!.candidates.map((m) => m.id)).toEqual(["prisoner"]);
  });

  it("validates the stored choice", () => {
    expect(errorsOf(roster(undefined, { brokenOnTheWheel: "pilgrim" }))).not.toContain("pre-game-invalid");
    expect(errorsOf(roster(undefined, { brokenOnTheWheel: null }))).not.toContain("pre-game-invalid");
    expect(errorsOf(roster(undefined, { brokenOnTheWheel: "prophet" }))).toContain("pre-game-invalid");
    const meth = validateWarband(roster(METHODIUS, { brokenOnTheWheel: "pilgrim" }), data());
    expect(meth.errors.find((e) => e.code === "pre-game-invalid")!.message).toBe("Broken on the Wheel is not allowed: Mortal Sin: models in a War Pilgrimage of Saint Methodius cannot be Broken on the Wheel (p64)");
    expect(errorsOf({ ...pilgrims([member("trench-pilgrims/trench-pilgrim", [])]), preGame: { brokenOnTheWheel: "m1" } })).toContain("pre-game-invalid");
  });

  it("exports the victim as removed for the game and the Shrine's protected state", () => {
    const out = toWarbandExport(roster(undefined, { brokenOnTheWheel: "pilgrim" }), data(), { code: "T" });
    const byId = new Map(out.members.map((m) => [m.id, m]));
    expect(byId.get("pilgrim")!.removedForGame).toBe(true);
    expect(byId.get("prisoner")!.removedForGame).toBeUndefined();
    const shrine = byId.get("shrine")!;
    expect(shrine.preGame).toEqual([expect.objectContaining({ name: "Broken on the Wheel", victim: "Brother Tobiah" })]);
    expect(renderTtsDescription(shrine)).toContain("[b]Broken on the Wheel:[/b] Brother Tobiah. Arm 0, no NEGATE SHRAPNEL or TOUGH");
    expect(shrine.ttsGmNotes).toContain("Before this game");
    expect(shrine.ttsGmNotes).toContain("Broken on the Wheel (Brother Tobiah): Until the Anchorite Shrine first suffers an Out of Action");
    const none = toWarbandExport(roster(), data(), { code: "T" });
    expect(none.members.some((m) => m.removedForGame || m.preGame)).toBe(false);
    const meth = toWarbandExport(roster(METHODIUS, { brokenOnTheWheel: "pilgrim" }), data(), { code: "T" });
    expect(meth.members.some((m) => m.removedForGame || m.preGame)).toBe(false);
  });
});
