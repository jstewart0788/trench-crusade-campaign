import { limitContext, loadRulesData, type RulesData, type Warband } from "@tc/rules";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { purchase } from "./purse.js";
import { createWarband, rosterReducer } from "./reducer.js";
import { defaultKit } from "./select.js";
import { kitEntries, pickerRows } from "./slots.js";
import { applyPending, EMPTY_PENDING, stagingReducer } from "./staging.js";
import { isBuiltIn, isPermanentLocked, openReplacements } from "./traits.js";

let data: RulesData;
beforeAll(() => {
  data = loadRulesData(resolve(import.meta.dirname, "../../../.."));
});

const SHRINE = "trench-pilgrims/anchorite-shrine";
const METHODIUS = "trench-pilgrims/war-pilgrimage-of-saint-methodius";
const REPLACEMENTS = ["anti-materiel-rifle", "autocannon", "gas-censer", "heavy-flamethrower", "punt-gun", "trench-mortar"];
const pilgrims = (variantId?: string) => createWarband({ name: "p", factionId: "trench-pilgrims", ...(variantId ? { variantId } : {}) }, "w");
const withShrine = (w: Warband, items?: string[]) => {
  const shrine = data.unitsById.get(SHRINE)!;
  return rosterReducer(w, { type: "add-member", unitId: SHRINE, equipmentItemIds: items ?? defaultKit(shrine, w, data, limitContext(w, data)) });
};
const unit = () => data.unitsById.get(SHRINE)!;
const entry = (w: Warband, itemId: string, pending?: "add") => {
  const e = kitEntries(w.members[0]!, unit(), data, pending ? { adds: [itemId], removes: [], upgradeAdds: [], upgradeRemoves: [] } : undefined).find((k) => k.itemId === itemId)!;
  return e;
};

describe("the Shrine is recruited with its wheel", () => {
  it("defaultKit gives the replaceable default, in every list", () => {
    expect(defaultKit(unit(), pilgrims(), data, limitContext(pilgrims(), data))).toEqual(["catherine-wheel"]);
    expect(defaultKit(unit(), pilgrims(METHODIUS), data, limitContext(pilgrims(METHODIUS), data))).toEqual(["catherine-wheel"]);
  });
});

describe("swap at recruitment, locked after", () => {
  it("offers the swap only to a pending recruit, and only under Methodius", () => {
    const meth = withShrine(pilgrims(METHODIUS));
    const ctx = limitContext(meth, data);
    expect(openReplacements(meth.members[0]!, unit(), meth, data, ctx, true).map((r) => r.itemId)).toEqual(["catherine-wheel"]);
    expect(openReplacements(meth.members[0]!, unit(), meth, data, ctx, false)).toEqual([]);
    const core = withShrine(pilgrims());
    expect(openReplacements(core.members[0]!, unit(), core, data, limitContext(core, data), true)).toEqual([]);
  });

  it("the wheel is built in; a replacement is undoable while pending and built in once confirmed", () => {
    const w = withShrine(pilgrims(METHODIUS), ["autocannon"]);
    expect(isBuiltIn(entry(withShrine(pilgrims(METHODIUS)), "catherine-wheel"))).toBe(true);
    expect(isBuiltIn(entry(w, "autocannon"))).toBe(true);
    const pendingSwap = withShrine(pilgrims(METHODIUS), []);
    expect(isBuiltIn(entry(pendingSwap, "autocannon", "add"))).toBe(false);
  });

  it("the replacements are listed only in replace mode, priced and 1-handed, with the wheel's slot freed", () => {
    const w = withShrine(pilgrims(METHODIUS));
    const ctx = limitContext(w, data);
    const normal = pickerRows("ranged", w.members[0]!, unit(), w, data, ctx);
    expect(normal.rows.map((r) => r.item.id).filter((id) => REPLACEMENTS.includes(id))).toEqual([]);
    const swap = pickerRows("melee", w.members[0]!, unit(), w, data, ctx, "catherine-wheel", new Set(REPLACEMENTS));
    expect(swap.rows.map((r) => r.item.id).sort()).toEqual([...REPLACEMENTS].sort());
    expect(swap.rows.every((r) => !r.cap && r.classified.hands === 1)).toBe(true);
    expect(swap.rows.find((r) => r.item.id === "autocannon")!.cost).toMatchObject({ ducats: 55 });
  });
});

describe("Anchorite Battlekit on the shelf", () => {
  it("is capped at two per Shrine, with the group named in the reason", () => {
    const w = withShrine(pilgrims(METHODIUS), ["catherine-wheel", "gas-filters", "piston-legs"]);
    const shelf = pickerRows("inventory", w.members[0]!, unit(), w, data, limitContext(w, data));
    const engine = shelf.rows.find((r) => r.item.id === "holy-diesel-engine")!;
    expect(engine.cap).toEqual({ count: 2, max: 2, scope: "model", what: "Anchorite Battlekit" });
    expect(purchase({ ducats: 300, threshold: 700, glory: 0 }, { cost: { ducats: 10, glory: 0 }, cap: engine.cap! }).reason).toBe("Limit reached 2/2 Anchorite Battlekit");
    const one = withShrine(pilgrims(METHODIUS), ["catherine-wheel", "gas-filters"]);
    expect(pickerRows("inventory", one.members[0]!, unit(), one, data, limitContext(one, data)).rows.find((r) => r.item.id === "holy-diesel-engine")!.cap).toBeUndefined();
  });

  it("a confirmed fitting is locked; a staged one can still be undone", () => {
    const w = withShrine(pilgrims(METHODIUS), ["catherine-wheel", "gas-filters"]);
    expect(isPermanentLocked(entry(w, "gas-filters"))).toBe(true);
    expect(isPermanentLocked(entry(withShrine(pilgrims(METHODIUS), ["catherine-wheel"]), "gas-filters", "add"))).toBe(false);
  });
});

describe("the pre-game choice follows the roster", () => {
  it("is set by the reducer and cleared when its victim leaves, confirmed or staged", () => {
    let w = withShrine(pilgrims());
    w = rosterReducer(w, { type: "add-member", unitId: "trench-pilgrims/trench-pilgrim", equipmentItemIds: [] });
    w = rosterReducer(w, { type: "set-pre-game", key: "brokenOnTheWheel", memberId: "m2" });
    expect(w.preGame).toEqual({ brokenOnTheWheel: "m2" });
    const staged = applyPending(w, stagingReducer(EMPTY_PENDING, { type: "stage-dismiss", memberId: "m2" }));
    expect(staged.preGame).toEqual({ brokenOnTheWheel: null });
    expect(rosterReducer(w, { type: "remove-member", memberId: "m2" }).preGame).toEqual({ brokenOnTheWheel: null });
    expect(rosterReducer(w, { type: "remove-member", memberId: "m1" }).preGame).toEqual({ brokenOnTheWheel: "m2" });
  });
});
