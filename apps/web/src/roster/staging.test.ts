import { loadRulesData, type RulesData, type Warband } from "@tc/rules";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createWarband, rosterReducer } from "./reducer.js";
import { applyPending, baseMember, EMPTY_PENDING, pendingCount, pendingDelta, stagedIds, stagedKit, stagedMembers, stagingReducer, type Pending } from "./staging.js";

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
const pm = (adds: string[] = [], removes: string[] = [], upgradeAdds: string[] = [], upgradeRemoves: string[] = []) => ({ adds, removes, upgradeAdds, upgradeRemoves });
const P = (members: Pending["members"] = {}, recruits: Pending["recruits"] = [], dismissals: string[] = []): Pending => ({ members, recruits, dismissals });
const run = (actions: Parameters<typeof stagingReducer>[1][], start: Pending = EMPTY_PENDING) => actions.reduce(stagingReducer, start);

describe("stagingReducer: kit", () => {
  it("stages additions and removals per member and drops members with nothing pending", () => {
    let p = run([{ type: "stage-add", memberId: "m1", itemId: "standard-armour" }]);
    expect(p).toEqual(P({ m1: pm(["standard-armour"]) }));
    p = run([{ type: "stage-remove", memberId: "m2", itemId: "bolt-action-rifle" }], p);
    expect(p.members.m2).toMatchObject({ removes: ["bolt-action-rifle"] });
    p = run([{ type: "unstage-add", memberId: "m1", itemId: "standard-armour" }], p);
    expect(p.members.m1).toBeUndefined();
    p = run([{ type: "unstage-remove", memberId: "m2", itemId: "bolt-action-rifle" }], p);
    expect(p).toEqual(P());
    expect(run([{ type: "unstage-add", memberId: "m9", itemId: "nothing" }])).toEqual(P());
  });

  it("stages upgrades, prunes departed members and discards everything", () => {
    let p = run([
      { type: "stage-add-upgrade", memberId: "m2", upgradeId: "9886-5b15-fa46-8d84" },
      { type: "stage-remove-upgrade", memberId: "m1", upgradeId: "x" },
      { type: "stage-add", memberId: "m3", itemId: "pistol" },
    ]);
    expect(Object.keys(p.members).sort()).toEqual(["m1", "m2", "m3"]);
    p = run([{ type: "prune", memberIds: ["m1", "m2"] }], p);
    expect(Object.keys(p.members).sort()).toEqual(["m1", "m2"]);
    p = run([{ type: "unstage-add-upgrade", memberId: "m2", upgradeId: "9886-5b15-fa46-8d84" }, { type: "unstage-remove-upgrade", memberId: "m1", upgradeId: "x" }], p);
    expect(p).toEqual(P());
    expect(run([{ type: "discard" }], P({ m1: pm(["a"]) }))).toBe(EMPTY_PENDING);
  });

  it("never mutates the previous pending state", () => {
    const before = P({ m1: pm(["a"], ["b"]) }, [{ id: "m3", unitId: "u", equipmentItemIds: [] }], ["m2"]);
    const frozen = JSON.stringify(before);
    run(
      [
        { type: "stage-add", memberId: "m1", itemId: "c" },
        { type: "unstage-add", memberId: "m1", itemId: "a" },
        { type: "stage-remove", memberId: "m1", itemId: "d" },
        { type: "stage-recruit", member: { id: "m4", unitId: "u", equipmentItemIds: [] } },
        { type: "rename-recruit", memberId: "m3", name: "Bob" },
        { type: "unstage-recruit", memberId: "m3" },
        { type: "stage-dismiss", memberId: "m1" },
        { type: "unstage-dismiss", memberId: "m2" },
        { type: "prune", memberIds: [] },
      ],
      before,
    );
    expect(JSON.stringify(before)).toBe(frozen);
  });
});

describe("stagingReducer: recruits and dismissals", () => {
  const recruit = { id: "m3", unitId: "new-antioch/yeoman", equipmentItemIds: ["bolt-action-rifle"] };

  it("stages a recruit, lets its name be edited in place, and unstages it with its kit changes", () => {
    let p = run([{ type: "stage-recruit", member: recruit }, { type: "stage-add", memberId: "m3", itemId: "bayonet" }]);
    expect(p.recruits).toEqual([recruit]);
    expect(p.members.m3).toMatchObject({ adds: ["bayonet"] });
    p = run([{ type: "rename-recruit", memberId: "m3", name: "Old Tom" }], p);
    expect(p.recruits[0]!.name).toBe("Old Tom");
    p = run([{ type: "rename-recruit", memberId: "m3", name: "  " }], p);
    expect("name" in p.recruits[0]!).toBe(false);
    p = run([{ type: "unstage-recruit", memberId: "m3" }], p);
    expect(p).toEqual(P());
  });

  it("stages a dismissal once and lifts it", () => {
    let p = run([{ type: "stage-dismiss", memberId: "m1" }, { type: "stage-dismiss", memberId: "m1" }]);
    expect(p.dismissals).toEqual(["m1"]);
    p = run([{ type: "unstage-dismiss", memberId: "m1" }], p);
    expect(p).toEqual(P());
  });

  it("prune keeps recruits' changes and drops dismissals of members that are gone", () => {
    const p = run([{ type: "prune", memberIds: ["m1"] }], P({ m1: pm(["a"]), m3: pm(["b"]), m9: pm(["c"]) }, [recruit], ["m1", "m2"]));
    expect(Object.keys(p.members).sort()).toEqual(["m1", "m3"]);
    expect(p.dismissals).toEqual(["m1"]);
    expect(p.recruits).toEqual([recruit]);
  });
});

describe("stagedIds / stagedMembers / baseMember", () => {
  it("marks removals from the last instance back, ignores surplus removals and appends additions", () => {
    expect(stagedIds(["r", "b", "r"], ["r"], ["p"])).toEqual([{ id: "r" }, { id: "b" }, { id: "r", pending: "remove" }, { id: "p", pending: "add" }]);
    expect(stagedIds(["r", "r"], ["r", "r", "r"], [])).toEqual([{ id: "r", pending: "remove" }, { id: "r", pending: "remove" }]);
    expect(stagedIds([], ["r"], ["r", "r"])).toEqual([{ id: "r", pending: "add" }, { id: "r", pending: "add" }]);
    const w = roster();
    expect(stagedKit(w.members[1]!, undefined).map((e) => e.id)).toEqual(["bolt-action-rifle", "bolt-action-rifle"]);
  });

  it("lists confirmed members with dismissals marked, then recruits, each with its kit changes applied", () => {
    const w = roster();
    const recruit = { id: "m3", unitId: "new-antioch/shocktrooper", equipmentItemIds: [] };
    const p = P({ m1: pm(["standard-armour"]), m3: pm(["submachine-gun"]) }, [recruit], ["m2"]);
    const rows = stagedMembers(w, p);
    expect(rows.map((r) => [r.member.id, r.pending, r.changes])).toEqual([
      ["m1", undefined, 1],
      ["m2", "remove", 0],
      ["m3", "add", 1],
    ]);
    expect(rows[0]!.member.equipmentItemIds).toEqual(["sword-axe", "pistol", "standard-armour"]);
    expect(rows[2]!.member.equipmentItemIds).toEqual(["submachine-gun"]);
    expect(baseMember(w, p, "m3")).toBe(recruit);
    expect(baseMember(w, p, "m1")).toBe(w.members[0]);
    expect(baseMember(w, p, "zz")).toBeUndefined();
  });
});

describe("applyPending", () => {
  it("returns the confirmed roster untouched when nothing is pending, and the input is never mutated", () => {
    const w = roster();
    expect(applyPending(w, EMPTY_PENDING)).toBe(w);
    const frozen = JSON.stringify(w);
    const staged = applyPending(w, P({ m1: pm(["standard-armour"], ["pistol"]) }));
    expect(JSON.stringify(w)).toBe(frozen);
    expect(staged.members[0]!.equipmentItemIds).toEqual(["sword-axe", "standard-armour"]);
    expect(staged.members[1]).toBe(w.members[1]);
  });

  it("adds recruits, drops dismissed members and applies upgrade changes", () => {
    let w = roster();
    w = rosterReducer(w, { type: "add-upgrade", memberId: "m2", upgradeId: "9886-5b15-fa46-8d84" });
    const recruit = { id: "m3", unitId: "new-antioch/shocktrooper", equipmentItemIds: ["submachine-gun"] };
    const staged = applyPending(w, P({ m2: pm([], [], [], ["9886-5b15-fa46-8d84"]), m3: pm(["frag-grenades"]) }, [recruit], ["m1"]));
    expect(staged.members.map((m) => m.id)).toEqual(["m2", "m3"]);
    expect("upgradeIds" in staged.members[0]!).toBe(false);
    expect(staged.members[1]).toEqual({ id: "m3", unitId: "new-antioch/shocktrooper", equipmentItemIds: ["submachine-gun", "frag-grenades"] });
    expect(recruit.equipmentItemIds).toEqual(["submachine-gun"]);
    // TC-003f: the kit bought now is recorded for this game; dismissals and removals record nothing.
    expect(staged.purchases!.slice((w.purchases ?? []).length)).toEqual([
      { itemId: "submachine-gun", memberId: "m3", game: 1 },
      { itemId: "frag-grenades", memberId: "m3", game: 1 },
    ]);
  });
});

describe("confirm and the API payload", () => {
  it("the roster reducer writes every member's pending changes, recruits and dismissals in one action; until then the confirmed roster is what gets saved", () => {
    const confirmed = roster();
    const pending = P(
      { m1: pm(["standard-armour"]), m2: pm(["bayonet"], ["bolt-action-rifle"], ["9886-5b15-fa46-8d84"]) },
      [{ id: "m3", unitId: "new-antioch/shocktrooper", equipmentItemIds: ["submachine-gun"] }],
      [],
    );
    const payloadBefore = JSON.stringify(confirmed);
    const staged = applyPending(confirmed, pending);
    expect(JSON.stringify(confirmed)).toBe(payloadBefore);
    expect(JSON.stringify(staged)).not.toBe(payloadBefore);

    const written = rosterReducer(confirmed, { type: "apply-purchases", pending });
    expect(written).toEqual(staged);
    expect(written.members.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(written.members[0]!.equipmentItemIds).toEqual(["sword-axe", "pistol", "standard-armour"]);
    expect(written.members[1]).toEqual({ id: "m2", unitId: "new-antioch/yeoman", equipmentItemIds: ["bolt-action-rifle", "bayonet"], upgradeIds: ["9886-5b15-fa46-8d84"] });
    expect(rosterReducer(confirmed, { type: "apply-purchases", pending: EMPTY_PENDING })).toBe(confirmed);
    const dismissed = rosterReducer(confirmed, { type: "apply-purchases", pending: P({}, [], ["m1"]) });
    expect(dismissed.members.map((m) => m.id)).toEqual(["m2"]);
  });
});

describe("pendingDelta / pendingCount", () => {
  it("prices the staged roster against the confirmed one, recruits included", () => {
    const w = roster();
    const pending = P({ m1: pm(["standard-armour"], ["pistol"]) }, [{ id: "m3", unitId: "new-antioch/shocktrooper", equipmentItemIds: [] }], ["m2"]);
    const delta = pendingDelta(w, pending, data);
    expect(delta.before.ducats).toBe(70 + 4 + 6 + 30 + 10);
    expect(delta.after.ducats).toBe(70 + 4 + 15 + 45);
    expect(delta.ducats).toBe(delta.after.ducats - delta.before.ducats);
    expect(pendingCount(pending)).toBe(4);
    expect(pendingCount(EMPTY_PENDING)).toBe(0);
  });
});

// TC-003k: a staged dismissal ends the dismissed model's Fireteam when it is confirmed.
describe("applyPending and Fireteams", () => {
  it("drops the team of a dismissed model, keeping the others", () => {
    let w = createWarband({ name: "t", factionId: "new-antioch" }, "w");
    for (const unitId of ["new-antioch/lieutenant", "new-antioch/yeoman", "new-antioch/yeoman", "new-antioch/yeoman"]) w = rosterReducer(w, { type: "add-member", unitId });
    w = rosterReducer(w, { type: "form-fireteam", rule: "new-antioch-fireteams", memberIds: ["m1", "m2"] });
    w = rosterReducer(w, { type: "form-fireteam", rule: "new-antioch-fireteams", memberIds: ["m3", "m4"] });
    const staged = applyPending(w, stagingReducer(EMPTY_PENDING, { type: "stage-dismiss", memberId: "m4" }));
    expect(staged.fireteams).toEqual([{ rule: "new-antioch-fireteams", memberIds: ["m1", "m2"] }]);
  });
});
