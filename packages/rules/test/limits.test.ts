import { describe, expect, it } from "vitest";
import { normaliseName, resolveLimit, type LimitContext } from "../src/limits.js";

const ctx = (counts: Record<string, number>): LimitContext => ({
  count: (name) => counts[normaliseName(name)],
});

describe("resolveLimit", () => {
  it("reads the base clause for the requested field and scope", () => {
    const text = "max 1 per model; max 3 per warband";
    expect(resolveLimit(text, "max", "model", null, ctx({}))).toEqual({ value: 1, unresolved: [] });
    expect(resolveLimit(text, "max", "warband", null, ctx({}))).toEqual({ value: 3, unresolved: [] });
    expect(resolveLimit(text, "min", "warband", 2, ctx({}))).toEqual({ value: 2, unresolved: [] });
    expect(resolveLimit(undefined, "max", "warband", 5, ctx({}))).toEqual({ value: 5, unresolved: [] });
  });

  it("treats a negative base as unlimited and 'per self' as per model", () => {
    expect(resolveLimit("max -1 per warband", "max", "warband", 2, ctx({})).value).toBeNull();
    expect(resolveLimit("max 1 per self", "max", "model", null, ctx({})).value).toBe(1);
  });

  it("applies set / increment when the condition is countable", () => {
    const text = "max 5 per warband; max set 8 per warband when atLeast 1 Stoßtruppen of the Free State of Prussia (roster)";
    const key = normaliseName("Stoßtruppen of the Free State of Prussia");
    expect(resolveLimit(text, "max", "warband", 5, ctx({ [key]: 1 })).value).toBe(8);
    expect(resolveLimit(text, "max", "warband", 5, ctx({ [key]: 0 })).value).toBe(5);

    const repeat = "max 1 per warband; max increment 1 per warband when repeat per Sipahi Captain (roster)";
    expect(resolveLimit(repeat, "max", "warband", 1, ctx({ sipahicaptain: 2 })).value).toBe(3);
  });

  it("adds nothing for a repeat clause that names the limited thing itself (Brazen Bull 0-1, p88)", () => {
    const text = "max 1 per warband; max increment 1 per warband when repeat per Brazen Bull (roster)";
    expect(resolveLimit(text, "max", "warband", 1, ctx({ brazenbull: 3 }), "Brazen Bull")).toEqual({ value: 1, unresolved: [] });
    expect(resolveLimit(text, "max", "warband", 1, ctx({ brazenbull: 3 }), "Brazen Bull [Iron Sultanate]").value).toBe(1);
    expect(resolveLimit(text, "max", "warband", 1, ctx({ brazenbull: 3 }), "Janissary").value).toBe(4);
    expect(resolveLimit(text, "max", "warband", 1, ctx({ brazenbull: 3 })).value).toBe(4);
  });

  it("chains bare conditions onto the previous modifier as alternatives", () => {
    const text = "max 3 per warband; max set 1 per warband when atLeast 1 Eire Rangers (roster); atLeast 1 Kingdom of Alba Assault Detachment (roster)";
    expect(resolveLimit(text, "max", "warband", 3, ctx({ eirerangers: 0, kingdomofalbaassaultdetachment: 1 })).value).toBe(1);
  });

  it("reports conditions it cannot count instead of applying them", () => {
    const text = "max 5 per warband; max increment 1 per warband when repeat per Organized Shocktroopers (roster); lessThan 1200 any (roster)";
    const r = resolveLimit(text, "max", "warband", 5, ctx({}));
    expect(r.value).toBe(5);
    expect(r.unresolved).toEqual(["max increment 1 when repeat per Organized Shocktroopers (roster) / lessThan 1200 any (roster)"]);
  });

  it("reads lessThan / atMost / equalTo as exclusions that must all hold, and atLeast as alternatives (TC-003i)", () => {
    // The Sea Hag's +1 (NR): at 1,000 ducats or more, and not in Trench Ghosts, and not in the Naval Raiders.
    const text = "max 1 per warband; max increment 1 per warband when lessThan 1 Trench Ghosts (roster); lessThan 1 Heretic Naval Raiders Rules (roster); atLeast 1000 any (roster)";
    expect(resolveLimit(text, "max", "warband", 1, ctx({ trenchghosts: 0, hereticnavalraidersrules: 0, any: 1200 })).value).toBe(2);
    expect(resolveLimit(text, "max", "warband", 1, ctx({ trenchghosts: 0, hereticnavalraidersrules: 1, any: 1200 })).value).toBe(1);
    expect(resolveLimit(text, "max", "warband", 1, ctx({ trenchghosts: 0, hereticnavalraidersrules: 0, any: 700 })).value).toBe(1);
    expect(resolveLimit("max 0 per warband; max set 2 per warband when atMost 0 Lazarist Communicant (roster)", "max", "warband", 0, ctx({ lazaristcommunicant: 0 })).value).toBe(2);
    expect(resolveLimit("max 3 per warband; max set 0 per warband when equalTo 0 Demonic (roster)", "max", "warband", 3, ctx({ demonic: 0 })).value).toBe(0);
  });
});

describe("normaliseName", () => {
  it("drops catalogue suffixes, case, punctuation and whitespace", () => {
    expect(normaliseName("Dog Food [Mercenaries]")).toBe("dogfood");
    expect(normaliseName("Bolt Action Rifle")).toBe(normaliseName("Bolt-Action Rifle"));
    expect(normaliseName("Troop Flag ")).toBe("troopflag");
  });
});
