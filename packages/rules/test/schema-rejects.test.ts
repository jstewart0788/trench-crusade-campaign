import { describe, expect, it } from "vitest";
import { ScenariosFile, UnitsFile } from "../src/schema.js";

describe("schemas reject malformed data", () => {
  it("rejects a units file with a unit missing stats", () => {
    const bad = {
      $schema: "tc-rules-units-v1",
      source: {},
      units: [{ id: "x", factionId: "f", name: "X", kind: "model", elite: false, keywords: [], cost: { ducats: 1, glory: 0 } }],
    };
    expect(UnitsFile.safeParse(bad).success).toBe(false);
  });

  it("rejects a scenarios file with fewer than twelve scenarios", () => {
    const bad = { $schema: "tc-rules-scenarios-v1", source: {}, battlefield: { widthIn: 36, depthIn: 36 }, scenarios: [] };
    expect(ScenariosFile.safeParse(bad).success).toBe(false);
  });
});
