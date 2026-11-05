import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { findUnit, loadModelMap, loadRulesData, RulesDataError, thresholdFor } from "../src/load.js";
import { data, repoRoot } from "./fixtures.js";

describe("loadRulesData", () => {
  it("loads and indexes the six data files", () => {
    const d = data();
    expect(d.factions).toHaveLength(6);
    expect(d.units).toHaveLength(130);
    expect(d.equipment).toHaveLength(225);
    expect(d.factionsById.get("new-antioch")?.name).toBe("New Antioch");
    expect(d.unitsByFaction.get("new-antioch")).toHaveLength(20);
    expect(d.unitsById.get("new-antioch/yeoman")?.cost.ducats).toBe(30);
    expect(d.equipmentById.get("bolt-action-rifle")?.hands).toBe(2);
    expect(d.variantsById.get("new-antioch/the-red-brigade")?.factionId).toBe("new-antioch");
    expect(d.unitsByFaction.get("heretic-legion")?.every((u) => u.subfactionId === undefined)).toBe(true);
    expect(d.scenarios.scenarios.length).toBeGreaterThanOrEqual(12);
    expect(d.terrain.types.length).toBeGreaterThan(0);
  });

  it("types the converter's extra fields", () => {
    const d = data();
    const crimson = d.unitsById.get("new-antioch/crimson-communicant")!;
    expect(crimson.onlyWith).toEqual(["new-antioch/the-red-brigade"]);
    const guardian = d.unitsById.get("new-antioch/scripture-guardian")!;
    expect(guardian.mercenary).toBe(true);
    expect(guardian.mercenaryId).toBe("mercenary/scripture-guardian");
    const medic = d.unitsById.get("new-antioch/combat-medic")!;
    expect(medic.equipmentAccess.find((a) => a.itemId === "misericordia")?.fixed).toBe(true);
    const yeoman = d.unitsById.get("new-antioch/yeoman")!;
    expect(yeoman.upgrades?.some((g) => g.name === "Trench Mole")).toBe(true);
  });

  it("exposes the Warband Threshold Table with game 1 at 700 ducats", () => {
    const d = data();
    const first = thresholdFor(d, 1);
    expect(first.clamped).toBe(false);
    expect(first.row).toMatchObject({ game: 1, threshold: 700, fieldStrength: 10 });
    expect(thresholdFor(d, 5).row.threshold).toBe(1100);
    const beyond = thresholdFor(d, 40);
    expect(beyond.clamped).toBe(true);
    expect(beyond.row.game).toBe(12);
  });

  it("resolves mercenaries by their shared mercenaryId within a faction", () => {
    const d = data();
    expect(findUnit(d, { factionId: "new-antioch" }, "mercenary/scripture-guardian")?.id).toBe("new-antioch/scripture-guardian");
    expect(findUnit(d, { factionId: "new-antioch" }, "mercenary/goetic-warlock")).toBeUndefined();
    const raiders = { factionId: "heretic-legion", subfactionId: "heretic-naval-raiders" };
    expect(findUnit(d, raiders, "mercenary/sin-eater")?.id).toBe("heretic-naval-raiders/sin-eater");
    expect(findUnit(d, { factionId: "heretic-legion" }, "mercenary/sin-eater")?.id).toBe("heretic-legion/sin-eater");
  });

  it("nests subfactions under their faction, with their own units and variants", () => {
    const d = data();
    const legion = d.factionsById.get("heretic-legion")!;
    expect(legion.subfactions?.map((s) => s.id)).toEqual(["heretic-naval-raiders"]);
    expect(d.factionsById.get("trench-pilgrims")!.subfactions?.map((s) => s.id)).toEqual(["procession-of-the-sacred-affliction"]);
    expect(d.factions.map((f) => f.id)).not.toContain("heretic-naval-raiders");
    expect(legion.variants.map((v) => v.id)).not.toContain("heretic-legion/heretic-naval-raiders");

    const raiders = d.subfactionsById.get("heretic-naval-raiders")!;
    expect(raiders.faction.id).toBe("heretic-legion");
    expect(raiders.subfaction.bsId).toBe("6497-8a39-4f5c-9873");
    expect(raiders.subfaction.variants.map((v) => v.id)).toEqual(["heretic-naval-raiders/the-drowned-choir", "heretic-naval-raiders/the-leviathan-shoal"]);
    expect(d.variantsById.get("heretic-naval-raiders/the-leviathan-shoal")).toMatchObject({ factionId: "heretic-legion", subfactionId: "heretic-naval-raiders" });

    const units = d.unitsBySubfaction.get("heretic-naval-raiders")!;
    expect(units.map((u) => u.id).sort()).toEqual([...raiders.subfaction.unitIds].sort());
    expect(units.every((u) => u.factionId === "heretic-legion" && u.subfactionId === "heretic-naval-raiders")).toBe(true);
    expect(units.map((u) => u.name)).toEqual(expect.arrayContaining(["Heretic Captain", "Anointed Heretic Raider", "Heretic Raider", "Drowned Chorister", "Sea Hag", "Abyssal Commando", "Wretched"]));
    // importRootEntries="false": none of the parent's own units come along
    expect(units.some((u) => u.name === "Heretic Priest" || u.name === "Heretic Trooper")).toBe(false);
  });

  it("treats a subfaction's mandatory Rules entry as always taken, so nothing is gated on it", () => {
    const d = data();
    for (const { subfaction } of d.subfactionsById.values()) {
      const rules = subfaction.configuration?.find((c) => c.mandatory);
      expect(rules?.name, subfaction.id).toBe(`${subfaction.name} Rules`);
      for (const unit of d.unitsBySubfaction.get(subfaction.id) ?? []) {
        for (const row of [unit, ...unit.equipmentAccess, ...(unit.upgrades ?? []), ...unit.abilities]) {
          const gates = [...(row.onlyWith ?? []), ...(row.onlyWithout ?? [])];
          expect(gates.filter((g) => g.startsWith(rules!.name)), unit.id).toEqual([]);
        }
      }
    }
    // the Procession's own models are only unlocked by that entry upstream
    expect(d.unitsById.get("procession-of-the-sacred-affliction/lazarist-prophet")?.onlyWith).toBeUndefined();
  });

  it("throws when a data file is missing", () => {
    expect(() => loadRulesData(resolve(repoRoot, "packages"))).toThrow();
  });

  it("loads the TTS model map alongside the rules data", () => {
    expect(data().models?.byUnitId.size).toBe(120);
  });

  it("RulesDataError names the file and carries the issues", () => {
    const err = new RulesDataError("x.json", ["a: bad"]);
    expect(err.message).toContain("x.json");
    expect(err.issues).toEqual(["a: bad"]);
  });
});

describe("loadModelMap", () => {
  it("resolves each unit's chosen default by modId + guid + nickname and skips unmapped units and fireteam wrappers", () => {
    const map = loadModelMap(repoRoot);
    expect(map.byUnitId.size).toBe(120);
    const lieutenant = map.byUnitId.get("new-antioch/lieutenant")!;
    expect(lieutenant).toMatchObject({ modId: "3700111403", guid: "15e05f", nickname: "Lieutenant" });
    expect(lieutenant.parts).toHaveLength(1);
    expect(lieutenant.parts[0]!.kind).toBe("Custom_Model");
    expect(map.byUnitId.has("black-grail/cradle-thrall")).toBe(false);
    expect(map.byUnitId.has("new-antioch/fireteam")).toBe(false);
  });

  it("throws when the map is missing", () => {
    expect(() => loadModelMap(resolve(repoRoot, "packages"))).toThrow();
  });
});

describe("model map covers the rules data", () => {
  // A unit without a default model imports as a bare base. These ten have no model
  // in the cached mods (data/tts/MODELS-COVERAGE.md); anything else unmapped means the
  // map is stale against units.json, which is how a whole subfaction once spawned bare.
  const KNOWN_WITHOUT_MODEL = new Set(["black-grail/cradle-thrall", "iron-sultanate/archeologist", "iron-sultanate/bedu-sharpshooter", "iron-sultanate/disciple-of-st-roch", "iron-sultanate/pairika", "iron-sultanate/shirdal", "iron-sultanate/tegmen", "iron-sultanate/zamburak-weapon-platform", "new-antioch/disciple-of-st-roch", "trench-pilgrims/disciple-of-st-roch"]);
  it("maps every unit except the known ones without a model", () => {
    const d = data();
    const missing = d.units.filter((u) => !d.models?.byUnitId.has(u.id) && !KNOWN_WITHOUT_MODEL.has(u.id)).map((u) => u.id);
    expect(missing).toEqual([]);
  });
});

