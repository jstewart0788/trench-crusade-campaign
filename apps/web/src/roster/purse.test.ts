import { loadRulesData, type RulesData } from "@tc/rules";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { gloryPool, purchase, type Purse } from "./purse.js";
import { createWarband } from "./reducer.js";

let data: RulesData;
beforeAll(() => {
  data = loadRulesData(resolve(import.meta.dirname, "../../../.."));
});

const purse = (over: Partial<Purse> = {}): Purse => ({ ducats: 290, threshold: 700, glory: 0, gloryPool: 0, ...over });

describe("purchase", () => {
  it("affordable: buys, and says what the purse will read after", () => {
    expect(purchase(purse(), { cost: { ducats: 30, glory: 0 } })).toEqual({ state: "buy", after: { ducats: 320, glory: 0 }, free: false });
  });

  it("free: always buys and says so", () => {
    expect(purchase(purse({ ducats: 900 }), { cost: { ducats: 0, glory: 0 } })).toMatchObject({ state: "buy", free: true, after: { ducats: 900 } });
  });

  it("unaffordable: blocked, with the overshoot in plain words", () => {
    expect(purchase(purse({ ducats: 685 }), { cost: { ducats: 30, glory: 0 } })).toEqual({ state: "over-threshold", reason: "Over threshold by 15", after: { ducats: 715, glory: 0 }, free: false });
    expect(purchase(purse({ ducats: 670 }), { cost: { ducats: 30, glory: 0 } }).state).toBe("buy");
  });

  it("capped: blocked at the limit, model or warband", () => {
    expect(purchase(purse(), { cost: { ducats: 70, glory: 0 }, cap: { count: 1, max: 1 } })).toMatchObject({ state: "capped", reason: "Limit reached 1/1" });
    expect(purchase(purse(), { cost: { ducats: 3, glory: 0 }, cap: { count: 2, max: 2, scope: "warband" } }).reason).toBe("Limit reached 2/2 in the warband");
    expect(purchase(purse(), { cost: { ducats: 3, glory: 0 }, cap: { count: 1, max: 2 } }).state).toBe("buy");
    expect(purchase(purse(), { cost: { ducats: 3, glory: 0 }, cap: { count: 9, max: null } }).state).toBe("buy");
  });

  it("glory: blocked past the pool, open when the pool is not known", () => {
    expect(purchase(purse({ gloryPool: 2 }), { cost: { ducats: 0, glory: 7 } })).toMatchObject({ state: "over-glory", reason: "Short 5 glory", after: { glory: 7 } });
    expect(purchase(purse({ gloryPool: 11 }), { cost: { ducats: 0, glory: 7 } }).state).toBe("buy");
    const { gloryPool: _, ...unknown } = purse();
    expect(purchase(unknown, { cost: { ducats: 0, glory: 7 } }).state).toBe("buy");
  });

  it("a swap pays only the difference, and never blocks a cheaper or equal swap", () => {
    expect(purchase(purse({ ducats: 690 }), { cost: { ducats: 15, glory: 0 }, refund: { ducats: 5, glory: 0 } })).toMatchObject({ state: "buy", after: { ducats: 700 } });
    expect(purchase(purse({ ducats: 750 }), { cost: { ducats: 5, glory: 0 }, refund: { ducats: 15, glory: 0 } })).toMatchObject({ state: "buy", after: { ducats: 740 } });
    expect(purchase(purse({ ducats: 750 }), { cost: { ducats: 0, glory: 0 } }).state).toBe("buy");
  });
});

describe("gloryPool", () => {
  it("is the recorded pool, else at game 1 the variant's starting glory or none, else unknown", () => {
    const na = (o: object = {}) => ({ ...createWarband({ name: "t", factionId: "new-antioch" }, "w"), ...o });
    expect(gloryPool(na(), data)).toBe(0);
    expect(gloryPool(na({ variantId: "new-antioch/papal-states-intervention-force" }), data)).toBe(11);
    expect(gloryPool(na({ glory: 4 }), data)).toBe(4);
    expect(gloryPool(na({ gameNumber: 3 }), data)).toBeUndefined();
  });
});

// TC-003j: the price buttons read the warband's own limits when it has them.
describe("custom limits on the shelf", () => {
  it("a 300-ducat limit blocks a buy the rules' 700 would allow; a glory limit opens a glory buy at game 1", async () => {
    const { warbandThreshold } = await import("@tc/rules");
    const shelf = (w: ReturnType<typeof createWarband>): Purse => ({ ducats: 290, glory: 0, threshold: warbandThreshold(w, data).value, ...(gloryPool(w, data) !== undefined ? { gloryPool: gloryPool(w, data)! } : {}) });
    const plain = createWarband({ name: "t", factionId: "new-antioch" }, "w");
    const capped = createWarband({ name: "t", factionId: "new-antioch", ducatLimit: 300, glory: 7 }, "w");
    expect(purchase(shelf(plain), { cost: { ducats: 30, glory: 0 } }).state).toBe("buy");
    expect(purchase(shelf(capped), { cost: { ducats: 30, glory: 0 } })).toMatchObject({ state: "over-threshold", reason: "Over threshold by 20" });
    expect(purchase(shelf(plain), { cost: { ducats: 0, glory: 7 } }).state).toBe("over-glory");
    expect(purchase(shelf(capped), { cost: { ducats: 0, glory: 7 } }).state).toBe("buy");
  });
});
