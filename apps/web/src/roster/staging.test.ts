import { loadRulesData, type RulesData, type Warband } from "@tc/rules";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createWarband, rosterReducer } from "./reducer.js";
import { applyPending, EMPTY_PENDING, pendingCount, pendingDelta, stagedIds, stagedKit, stagingReducer, type Pending } from "./staging.js";

let data: RulesData;
beforeAll(() => {
  data = loadRulesData(resolve(import.meta.dirname, "../../../.."));
});

const roster = (): Warband => {
  let w = createWarband({ name: "t", factionId: "new-antioch" }, "w");
  w = rosterReducer(w, { type: "add-member", unitId: "new-antioch/lieutenant", equipmentItemIds: ["sword-axe", "pistol"] });
  w = rosterReducer(w, { type: "add-member", unitId: "new-antioch/yeoman", equipmentItemIds: ["bolt-action-rifle", "bolt-action-rifle"] });
  return w;
};

const run = (actions: Parameters<typeof stagingReducer>[1][], start: Pending = EMPTY_PENDING) => actions.reduce(stagingReducer, start);

describe("stagingReducer", () => {
  it("stages additions and removals per member and drops members with nothing pending", () => {
    let p = run([{ type: "stage-add", memberId: "m1", itemId: "standard-armour" }]);
    expect(p).toEqual({ m1: { adds: ["standard-armour"], removes: [], upgradeAdds: [], upgradeRemoves: [] } });
    p = run([{ type: "stage-remove", memberId: "m2", itemId: "bolt-action-rifle" }], p);
    expect(p.m2).toMatchObject({ removes: ["bolt-action-rifle"] });
    p = run([{ type: "unstage-add", memberId: "m1", itemId: "standard-armour" }], p);
    expect(p.m1).toBeUndefined();
    p = run([{ type: "unstage-remove", memberId: "m2", itemId: "bolt-action-rifle" }], p);
    expect(p).toEqual({});
    expect(run([{ type: "unstage-add", memberId: "m9", itemId: "nothing" }])).toEqual({});
  });

  it("stages upgrades, prunes departed members and discards everything", () => {
    let p = run([
      { type: "stage-add-upgrade", memberId: "m2", upgradeId: "9886-5b15-fa46-8d84" },
      { type: "stage-remove-upgrade", memberId: "m1", upgradeId: "x" },
      { type: "stage-add", memberId: "m3", itemId: "pistol" },
    ]);
    expect(Object.keys(p).sort()).toEqual(["m1", "m2", "m3"]);
    p = run([{ type: "prune", memberIds: ["m1", "m2"] }], p);
    expect(Object.keys(p).sort()).toEqual(["m1", "m2"]);
    p = run([{ type: "unstage-add-upgrade", memberId: "m2", upgradeId: "9886-5b15-fa46-8d84" }, { type: "unstage-remove-upgrade", memberId: "m1", upgradeId: "x" }], p);
    expect(p).toEqual({});
    expect(run([{ type: "discard" }], { m1: { adds: ["a"], removes: [], upgradeAdds: [], upgradeRemoves: [] } })).toBe(EMPTY_PENDING);
  });

  it("never mutates the previous pending state", () => {
    const before: Pending = { m1: { adds: ["a"], removes: ["b"], upgradeAdds: [], upgradeRemoves: [] } };
    const frozen = JSON.stringify(before);
    run([{ type: "stage-add", memberId: "m1", itemId: "c" }, { type: "unstage-add", memberId: "m1", itemId: "a" }, { type: "stage-remove", memberId: "m1", itemId: "d" }, { type: "prune", memberIds: [] }], before);
    expect(JSON.stringify(before)).toBe(frozen);
  });
});

describe("stagedIds", () => {
  it("marks removals from the last instance back, ignores surplus removals and appends additions", () => {
    expect(stagedIds(["r", "b", "r"], ["r"], ["p"])).toEqual([{ id: "r" }, { id: "b" }, { id: "r", pending: "remove" }, { id: "p", pending: "add" }]);
    expect(stagedIds(["r", "r"], ["r", "r", "r"], [])).toEqual([{ id: "r", pending: "remove" }, { id: "r", pending: "remove" }]);
    expect(stagedIds([], ["r"], ["r", "r"])).toEqual([{ id: "r", pending: "add" }, { id: "r", pending: "add" }]);
    const w = roster();
    expect(stagedKit(w.members[1]!, undefined).map((e) => e.id)).toEqual(["bolt-action-rifle", "bolt-action-rifle"]);
  });
});

describe("applyPending", () => {
  it("returns the confirmed roster untouched when nothing is pending, and the input is never mutated", () => {
    const w = roster();
    expect(applyPending(w, EMPTY_PENDING)).toBe(w);
    const frozen = JSON.stringify(w);
    const staged = applyPending(w, { m1: { adds: ["standard-armour"], removes: ["pistol"], upgradeAdds: [], upgradeRemoves: [] } });
    expect(JSON.stringify(w)).toBe(frozen);
    expect(staged.members[0]!.equipmentItemIds).toEqual(["sword-axe", "standard-armour"]);
    expect(staged.members[1]).toBe(w.members[1]);
  });

  it("applies upgrade changes and drops the key when none remain", () => {
    let w = roster();
    w = rosterReducer(w, { type: "add-upgrade", memberId: "m2", upgradeId: "9886-5b15-fa46-8d84" });
    const cleared = applyPending(w, { m2: { adds: [], removes: [], upgradeAdds: [], upgradeRemoves: ["9886-5b15-fa46-8d84"] } });
    expect("upgradeIds" in cleared.members[1]!).toBe(false);
    const added = applyPending(roster(), { m2: { adds: [], removes: [], upgradeAdds: ["9886-5b15-fa46-8d84"], upgradeRemoves: [] } });
    expect(added.members[1]!.upgradeIds).toEqual(["9886-5b15-fa46-8d84"]);
  });
});

describe("confirm and the API payload", () => {
  it("the roster reducer writes every member's pending changes in one action; until then the confirmed roster is what gets saved", () => {
    const confirmed = roster();
    const pending: Pending = {
      m1: { adds: ["standard-armour"], removes: [], upgradeAdds: [], upgradeRemoves: [] },
      m2: { adds: ["bayonet"], removes: ["bolt-action-rifle"], upgradeAdds: ["9886-5b15-fa46-8d84"], upgradeRemoves: [] },
    };
    const payloadBefore = JSON.stringify(confirmed);
    const staged = applyPending(confirmed, pending);
    expect(JSON.stringify(confirmed)).toBe(payloadBefore);
    expect(JSON.stringify(staged)).not.toBe(payloadBefore);

    const written = rosterReducer(confirmed, { type: "apply-purchases", pending });
    expect(written).toEqual(staged);
    expect(written.members[0]!.equipmentItemIds).toEqual(["sword-axe", "pistol", "standard-armour"]);
    expect(written.members[1]).toEqual({ id: "m2", unitId: "new-antioch/yeoman", equipmentItemIds: ["bolt-action-rifle", "bayonet"], upgradeIds: ["9886-5b15-fa46-8d84"] });
    expect(rosterReducer(confirmed, { type: "apply-purchases", pending: EMPTY_PENDING })).toBe(confirmed);
  });
});

describe("pendingDelta / pendingCount", () => {
  it("prices the staged roster against the confirmed one", () => {
    const w = roster();
    const pending: Pending = { m1: { adds: ["standard-armour"], removes: ["pistol"], upgradeAdds: [], upgradeRemoves: [] } };
    const delta = pendingDelta(w, pending, data);
    expect(delta.before.ducats).toBe(70 + 4 + 6 + 30 + 10);
    expect(delta.after.ducats).toBe(70 + 4 + 15 + 30 + 10);
    expect(delta.ducats).toBe(9);
    expect(delta.glory).toBe(0);
    expect(pendingCount(pending)).toBe(2);
    expect(pendingCount(EMPTY_PENDING)).toBe(0);
  });
});
