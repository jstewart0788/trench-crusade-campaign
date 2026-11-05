import { describe, expect, it } from "vitest";
import { BATTLEFIELD_PAYLOAD_VERSION, compactBattlefield, expandBattlefield, generateBattlefield, layoutToObjectStates, objectiveMarkers } from "../src/index.js";
import { fixtureCatalog, fixtureEnv } from "./fixtures.js";

const env = fixtureEnv();
const catalog = fixtureCatalog();
const boards = [3, 8].map((seed) => generateBattlefield({ scenarioId: "claim-no-mans-land", archetype: "trench-lines", seed }, env));

describe("compactBattlefield", () => {
  it("rebuilds exactly the object states the emitter writes, with the objective specs", () => {
    for (const l of boards) {
      const p = compactBattlefield(l, env.palette, catalog);
      expect(p.version).toBe(BATTLEFIELD_PAYLOAD_VERSION);
      expect(expandBattlefield(p)).toEqual(layoutToObjectStates(l, env.palette, catalog));
      expect(p.objectives).toEqual(objectiveMarkers(l, env.palette, catalog));
      expect(p.pieces).toHaveLength(l.pieces.length);
      expect(new Set(p.texts).size).toBe(p.texts.length);
    }
  });

  it("is several times smaller than the object states on the wire", () => {
    const l = boards[0]!;
    const full = JSON.stringify(layoutToObjectStates(l, env.palette, catalog)).length;
    const compact = JSON.stringify(compactBattlefield(l, env.palette, catalog)).length;
    expect(compact * 3).toBeLessThan(full);
  });

  it("refuses a payload row that names an asset it does not carry", () => {
    const p = compactBattlefield(boards[0]!, env.palette, catalog);
    p.pieces[0]![0] = "no-such-piece";
    expect(() => expandBattlefield(p)).toThrow(/unknown palette piece/);
  });
});
