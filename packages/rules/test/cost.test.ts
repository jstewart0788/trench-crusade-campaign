import { describe, expect, it } from "vitest";
import { itemCost, warbandCost } from "../src/cost.js";
import { data, member, newAntioch } from "./fixtures.js";

describe("warbandCost", () => {
  it("sums unit cost plus faction armoury prices for every member", () => {
    const cost = warbandCost(newAntioch(), data());
    // Lieutenant 70 + sword-axe 4 + pistol 6 + standard armour 15 = 95
    // 4 x Yeoman (30 + bolt-action rifle 10 + bayonet 2) = 168
    // Shocktrooper 45 + submachine gun 30 = 75
    expect(cost.ducats).toBe(338);
    expect(cost.glory).toBe(0);
    expect(cost.perMember).toHaveLength(6);
    expect(cost.perMember[0]).toMatchObject({ unitId: "new-antioch/lieutenant", ducats: 95, glory: 0 });
    expect(cost.perMember[0]?.items.map((i) => i.ducats)).toEqual([4, 6, 15]);
  });

  it("uses the equipmentAccess price over the library price", () => {
    const d = data();
    expect(d.equipmentById.get("machine-gun")?.cost).toEqual({ ducats: 50, glory: 2 });
    expect(itemCost(d, "new-antioch", "new-antioch/lieutenant", "machine-gun")).toEqual({ id: "machine-gun", ducats: 50, glory: 0 });
  });

  it("falls back to the library price when the access row has none, and to zero for fixed kit", () => {
    const d = data();
    const sinEater = d.unitsById.get("black-grail/sin-eater")!;
    const fixed = sinEater.equipmentAccess.find((a) => a.itemId === "reinforced-armour")!;
    expect(fixed.fixed).toBe(true);
    expect(fixed.cost).toBeUndefined();
    expect(itemCost(d, "black-grail", "black-grail/sin-eater", "reinforced-armour").ducats).toBe(0);
    const kalkan = d.equipmentById.get("iron-wall-kalkan")!.cost.ducats;
    expect(kalkan).toBeGreaterThan(0);
    expect(itemCost(d, "new-antioch", "new-antioch/yeoman", "iron-wall-kalkan").ducats).toBe(kalkan);
  });

  it("includes upgrades and glory-priced mercenaries", () => {
    const d = data();
    const berserker = d.unitsById.get("new-antioch/lieutenant")!.upgrades!.find((g) => g.name === "Berserker")!;
    const w = newAntioch({
      members: [member("new-antioch/lieutenant", [], [berserker.bsId]), member("new-antioch/scripture-guardian", [])],
    });
    const cost = warbandCost(w, d);
    expect(cost.ducats).toBe(70 + 15);
    expect(cost.glory).toBe(7);
    expect(cost.perMember[0]?.upgrades).toEqual([{ id: berserker.bsId, ducats: 15, glory: 0 }]);
  });

  it("charges nothing for unknown units or items", () => {
    const cost = warbandCost(newAntioch({ members: [member("nope", ["also-nope"])] }), data());
    expect(cost.ducats).toBe(0);
  });
});
