import { describe, expect, it } from "vitest";
import { parseWarband, Warband } from "../src/roster.js";
import { newAntioch } from "./fixtures.js";

describe("roster model", () => {
  it("round-trips through JSON unchanged", () => {
    const w = newAntioch({ variantId: "new-antioch/the-red-brigade", patronId: "temporal-lord", strongboxDucats: 12, glory: 2 });
    const copy = parseWarband(JSON.parse(JSON.stringify(w)));
    expect(copy).toEqual(w);
  });

  it("rejects a non-positive game number and members without a unit", () => {
    expect(Warband.safeParse(newAntioch({ gameNumber: 0 })).success).toBe(false);
    expect(Warband.safeParse({ ...newAntioch(), members: [{ id: "m", equipmentItemIds: [] }] }).success).toBe(false);
    expect(() => parseWarband({})).toThrow();
  });
});
