import { describe, expect, it } from "vitest";
import { warbandCost } from "../src/cost.js";
import { Warband as WarbandSchema, type Warband } from "../src/roster.js";
import { validateWarband, warbandGloryPool, warbandThreshold } from "../src/validate.js";
import { codes, data, member, newAntioch, warband } from "./fixtures.js";

// TC-003j: a warband's own ducat and glory limits, in place of what the rules give.

const PAPAL = "new-antioch/papal-states-intervention-force";

describe("ducat limit", () => {
  it("absent: the rules' Threshold Value, as before", () => {
    expect(warbandThreshold(newAntioch(), data())).toMatchObject({ value: 700, ruled: 700, custom: false });
    expect(warbandThreshold(newAntioch({ variantId: PAPAL }), data())).toMatchObject({ value: 500, ruled: 500, custom: false });
  });

  it("set: replaces the rules' value outright, variant shortfall included, and says so", () => {
    expect(warbandThreshold(newAntioch({ ducatLimit: 1000 }), data())).toMatchObject({ value: 1000, ruled: 700, custom: true });
    expect(warbandThreshold(newAntioch({ variantId: PAPAL, ducatLimit: 900 }), data())).toMatchObject({ value: 900, ruled: 500, custom: true });
    // A caller's agreed game size still wins over it.
    expect(warbandThreshold(newAntioch({ ducatLimit: 1000 }), data(), 1200).value).toBe(1200);
  });

  it("drives the over-threshold check both ways", () => {
    const w = newAntioch(); // 318 ducats
    expect(codes(validateWarband({ ...w, ducatLimit: 300 }, data()))).toEqual(["over-threshold"]);
    expect(validateWarband({ ...w, ducatLimit: 300 }, data()).errors[0]!.message).toBe("Warband costs 318 ducats; its ducat limit is 300");
    const big = { ...w, members: [...w.members, ...Array.from({ length: 10 }, () => member("new-antioch/yeoman", ["bolt-action-rifle", "standard-armour", "combat-helmet"]))] };
    expect(warbandCost(big, data()).ducats).toBeGreaterThan(700);
    expect(codes(validateWarband(big, data()))).toContain("over-threshold");
    expect(codes(validateWarband({ ...big, ducatLimit: 1000 }, data()))).not.toContain("over-threshold");
  });

  it("replaces a clamped table value without the 'table ends' warning", () => {
    expect(validateWarband(newAntioch({ gameNumber: 30 }), data()).warnings.map((x) => x.message)).toEqual([expect.stringContaining("Threshold table ends")]);
    expect(validateWarband(newAntioch({ gameNumber: 30, ducatLimit: 2000 }), data()).warnings).toEqual([]);
  });
});

describe("glory limit", () => {
  it("absent: the variant's starting glory at game 1, unknown later", () => {
    expect(warbandGloryPool(newAntioch({ variantId: PAPAL }), data())).toEqual({ value: 11, ruled: 11, custom: false });
    expect(warbandGloryPool(newAntioch({ gameNumber: 3 }), data())).toEqual({ value: undefined, ruled: undefined, custom: false });
  });

  it("set: replaces it, at game 1 and later, and the glory check uses it", () => {
    const hired = (extra: Partial<Warband>) => warband("new-antioch", [member("new-antioch/lieutenant"), member("new-antioch/scripture-guardian", ["sword-axe", "trench-club"])], extra); // 7 glory
    expect(codes(validateWarband(hired({}), data()))).toContain("over-glory");
    expect(codes(validateWarband(hired({ glory: 7 }), data()))).not.toContain("over-glory");
    expect(validateWarband(hired({ glory: 5 }), data()).errors.find((e) => e.code === "over-glory")!.message).toBe("Warband spends 7 Glory Points but only 5 are available (its glory limit)");
    expect(validateWarband(hired({ gameNumber: 3 }), data()).warnings.map((x) => x.code)).toContain("glory-unknown");
    expect(codes(validateWarband(hired({ gameNumber: 3, glory: 4 }), data()))).toContain("over-glory");
    expect(warbandGloryPool(newAntioch({ variantId: PAPAL, glory: 3 }), data())).toEqual({ value: 3, ruled: 11, custom: true });
  });
});

describe("saved rosters", () => {
  it("a roster without the fields still parses and validates as before; with them, they round-trip", () => {
    const old = newAntioch();
    expect(WarbandSchema.parse(old)).toEqual(old);
    expect(validateWarband(old, data()).ok).toBe(true);
    const custom = newAntioch({ ducatLimit: 850, glory: 4 });
    expect(WarbandSchema.parse(JSON.parse(JSON.stringify(custom)))).toEqual(custom);
    expect(WarbandSchema.safeParse({ ...custom, ducatLimit: -1 }).success).toBe(false);
    expect(WarbandSchema.safeParse({ ...custom, ducatLimit: 10.5 }).success).toBe(false);
  });
});
