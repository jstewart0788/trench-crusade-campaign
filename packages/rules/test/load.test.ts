import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { findUnit, loadRulesData, RulesDataError, thresholdFor } from "../src/load.js";
import { data, repoRoot } from "./fixtures.js";

describe("loadRulesData", () => {
  it("loads and indexes the six data files", () => {
    const d = data();
    expect(d.factions).toHaveLength(6);
    expect(d.units).toHaveLength(103);
    expect(d.equipment).toHaveLength(213);
    expect(d.factionsById.get("new-antioch")?.name).toBe("New Antioch");
    expect(d.unitsByFaction.get("new-antioch")).toHaveLength(20);
    expect(d.unitsById.get("new-antioch/yeoman")?.cost.ducats).toBe(30);
    expect(d.equipmentById.get("bolt-action-rifle")?.hands).toBe(2);
    expect(d.variantsById.get("new-antioch/the-red-brigade")?.factionId).toBe("new-antioch");
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
    expect(medic.equipmentAccess.find((a) => a.itemId === "misericordia")?.maxPerWarband).toBe(1);
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
    expect(findUnit(d, "new-antioch", "mercenary/scripture-guardian")?.id).toBe("new-antioch/scripture-guardian");
    expect(findUnit(d, "new-antioch", "mercenary/goetic-warlock")).toBeUndefined();
  });

  it("throws when a data file is missing", () => {
    expect(() => loadRulesData(resolve(repoRoot, "packages"))).toThrow();
  });

  it("RulesDataError names the file and carries the issues", () => {
    const err = new RulesDataError("x.json", ["a: bad"]);
    expect(err.message).toContain("x.json");
    expect(err.issues).toEqual(["a: bad"]);
  });
});
