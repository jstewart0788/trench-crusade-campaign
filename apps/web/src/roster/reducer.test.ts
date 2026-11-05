import { Warband as WarbandSchema, type Warband } from "@tc/rules/browser";
import { describe, expect, it } from "vitest";
import { createWarband, nextMemberId, rosterReducer } from "./reducer.js";

const base = (): Warband => createWarband({ name: "Lanterns", factionId: "new-antioch" }, "w-test");

describe("createWarband", () => {
  it("builds a schema-valid empty roster and omits unset optionals", () => {
    const w = base();
    expect(WarbandSchema.parse(w)).toEqual(w);
    expect(w).toEqual({ id: "w-test", name: "Lanterns", factionId: "new-antioch", gameNumber: 1, members: [] });
    expect(createWarband({ name: "x", factionId: "f", variantId: "f/v", patronId: "p", gameNumber: 3 }, "id")).toMatchObject({ variantId: "f/v", patronId: "p", gameNumber: 3 });
    const sub = createWarband({ name: "x", factionId: "heretic-legion", subfactionId: "heretic-naval-raiders" }, "id");
    expect(WarbandSchema.parse(sub)).toEqual(sub);
    expect(sub).toMatchObject({ factionId: "heretic-legion", subfactionId: "heretic-naval-raiders" });
    expect("subfactionId" in w).toBe(false);
    expect(createWarband({ name: "x", factionId: "f" }).id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("nextMemberId", () => {
  it("continues past the highest existing id, ignoring foreign ids", () => {
    expect(nextMemberId([])).toBe("m1");
    expect(nextMemberId([{ id: "m3", unitId: "u", equipmentItemIds: [] }, { id: "zz", unitId: "u", equipmentItemIds: [] }])).toBe("m4");
  });
});

describe("rosterReducer", () => {
  it("adds a member with its starting kit and removes it again", () => {
    let w = rosterReducer(base(), { type: "add-member", unitId: "new-antioch/lieutenant", equipmentItemIds: ["sword-axe"] });
    expect(w.members).toEqual([{ id: "m1", unitId: "new-antioch/lieutenant", equipmentItemIds: ["sword-axe"] }]);
    w = rosterReducer(w, { type: "add-member", unitId: "new-antioch/yeoman" });
    expect(w.members.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(w.members[1]!.upgradeIds).toBeUndefined();
    w = rosterReducer(w, { type: "remove-member", memberId: "m1" });
    expect(w.members.map((m) => m.id)).toEqual(["m2"]);
    expect(rosterReducer(w, { type: "add-member", unitId: "new-antioch/yeoman" }).members.map((m) => m.id)).toEqual(["m2", "m3"]);
  });

  it("duplicates a member right after the original, without its custom name", () => {
    let w = rosterReducer(base(), { type: "add-member", unitId: "new-antioch/yeoman", equipmentItemIds: ["bolt-action-rifle"], upgradeIds: ["up1"] });
    w = rosterReducer(w, { type: "add-member", unitId: "new-antioch/shocktrooper" });
    w = rosterReducer(w, { type: "rename-member", memberId: "m1", name: "Old Tom" });
    w = rosterReducer(w, { type: "duplicate-member", memberId: "m1" });
    expect(w.members.map((m) => m.id)).toEqual(["m1", "m3", "m2"]);
    expect(w.members[1]).toEqual({ id: "m3", unitId: "new-antioch/yeoman", equipmentItemIds: ["bolt-action-rifle"], upgradeIds: ["up1"] });
    expect(w.members[1]!.equipmentItemIds).not.toBe(w.members[0]!.equipmentItemIds);
    expect(rosterReducer(w, { type: "duplicate-member", memberId: "nope" })).toBe(w);
  });

  it("adds and removes items one instance at a time, keeping order", () => {
    let w = rosterReducer(base(), { type: "add-member", unitId: "new-antioch/yeoman" });
    w = rosterReducer(w, { type: "add-item", memberId: "m1", itemId: "bolt-action-rifle" });
    w = rosterReducer(w, { type: "add-item", memberId: "m1", itemId: "bayonet" });
    w = rosterReducer(w, { type: "add-item", memberId: "m1", itemId: "bolt-action-rifle" });
    expect(w.members[0]!.equipmentItemIds).toEqual(["bolt-action-rifle", "bayonet", "bolt-action-rifle"]);
    w = rosterReducer(w, { type: "remove-item", memberId: "m1", itemId: "bolt-action-rifle" });
    expect(w.members[0]!.equipmentItemIds).toEqual(["bolt-action-rifle", "bayonet"]);
    w = rosterReducer(w, { type: "remove-item", memberId: "m1", itemId: "missing" });
    expect(w.members[0]!.equipmentItemIds).toEqual(["bolt-action-rifle", "bayonet"]);
    expect(rosterReducer(w, { type: "add-item", memberId: "ghost", itemId: "pistol" })).toEqual(w);
  });

  it("adds and removes upgrades, dropping the key when none are left", () => {
    let w = rosterReducer(base(), { type: "add-member", unitId: "new-antioch/yeoman" });
    w = rosterReducer(w, { type: "add-upgrade", memberId: "m1", upgradeId: "114b-97a7-6011-55c2" });
    expect(w.members[0]!.upgradeIds).toEqual(["114b-97a7-6011-55c2"]);
    w = rosterReducer(w, { type: "remove-upgrade", memberId: "m1", upgradeId: "114b-97a7-6011-55c2" });
    expect(w.members[0]).toEqual({ id: "m1", unitId: "new-antioch/yeoman", equipmentItemIds: [] });
  });

  it("renames the warband and a member, clearing an empty member name", () => {
    let w = rosterReducer(base(), { type: "rename", name: "Fifth Lantern" });
    expect(w.name).toBe("Fifth Lantern");
    w = rosterReducer(w, { type: "add-member", unitId: "new-antioch/lieutenant" });
    w = rosterReducer(w, { type: "rename-member", memberId: "m1", name: "Captain " });
    expect(w.members[0]!.name).toBe("Captain ");
    w = rosterReducer(w, { type: "rename-member", memberId: "m1", name: "Captain Vane" });
    expect(w.members[0]!.name).toBe("Captain Vane");
    w = rosterReducer(w, { type: "rename-member", memberId: "m1", name: "   " });
    expect("name" in w.members[0]!).toBe(false);
  });

  it("sets variant, patron, game number and glory, removing cleared optionals", () => {
    let w = rosterReducer(base(), { type: "set-variant", variantId: "new-antioch/eire-rangers" });
    w = rosterReducer(w, { type: "set-patron", patronId: "temporal-lord" });
    w = rosterReducer(w, { type: "set-game-number", gameNumber: 4 });
    w = rosterReducer(w, { type: "set-glory", glory: 3 });
    expect(w).toMatchObject({ variantId: "new-antioch/eire-rangers", patronId: "temporal-lord", gameNumber: 4, glory: 3 });
    w = rosterReducer(w, { type: "set-variant", variantId: undefined });
    w = rosterReducer(w, { type: "set-patron", patronId: "" });
    w = rosterReducer(w, { type: "set-game-number", gameNumber: 0 });
    w = rosterReducer(w, { type: "set-glory", glory: undefined });
    expect(w).toEqual({ ...base(), gameNumber: 1 });
    expect(rosterReducer(w, { type: "set-game-number", gameNumber: Number.NaN }).gameNumber).toBe(1);
  });

  it("never mutates the previous state", () => {
    const before = rosterReducer(base(), { type: "add-member", unitId: "new-antioch/yeoman", equipmentItemIds: ["pistol"] });
    const frozen = JSON.stringify(before);
    rosterReducer(before, { type: "add-item", memberId: "m1", itemId: "bayonet" });
    rosterReducer(before, { type: "remove-item", memberId: "m1", itemId: "pistol" });
    rosterReducer(before, { type: "duplicate-member", memberId: "m1" });
    rosterReducer(before, { type: "rename-member", memberId: "m1", name: "x" });
    expect(JSON.stringify(before)).toBe(frozen);
  });

  it("replaces the whole roster on load", () => {
    const other = createWarband({ name: "Other", factionId: "black-grail" }, "w2");
    expect(rosterReducer(base(), { type: "load", warband: other })).toBe(other);
  });
});

// TC-003f: what was bought when, and kit the warband holds itself.
describe("purchase record and warband armoury", () => {
  it("records each item bought with the game it was bought for, and holds a Grand Cannon battery", () => {
    let w = rosterReducer(createWarband({ name: "t", factionId: "iron-sultanate", variantId: "iron-sultanate/defenders-of-the-iron-wall" }, "w"), { type: "add-member", unitId: "iron-sultanate/janissary", equipmentItemIds: ["sword-axe"] });
    w = rosterReducer(w, { type: "set-game-number", gameNumber: 2 });
    w = rosterReducer(w, { type: "add-item", memberId: "m1", itemId: "jezzail" });
    expect(w.purchases).toEqual([
      { itemId: "sword-axe", memberId: "m1", game: 1 },
      { itemId: "jezzail", memberId: "m1", game: 2 },
    ]);
    w = rosterReducer(w, { type: "add-armoury-item", itemId: "sultanate-grand-cannon" });
    w = rosterReducer(w, { type: "add-armoury-item", itemId: "sultanate-grand-cannon" });
    expect(w.armoury).toEqual(["sultanate-grand-cannon", "sultanate-grand-cannon"]);
    w = rosterReducer(w, { type: "remove-armoury-item", itemId: "sultanate-grand-cannon" });
    w = rosterReducer(w, { type: "remove-armoury-item", itemId: "sultanate-grand-cannon" });
    expect("armoury" in w).toBe(false);
  });
});

// TC-003i: a choice made at creation (the Court's Sin), set and cleared.
describe("roster choices", () => {
  it("sets a choice and drops the field when none is left", () => {
    let w = createWarband({ name: "c", factionId: "court-of-the-seven-headed-serpent" }, "w");
    w = rosterReducer(w, { type: "set-choice", choiceId: "court-sins", option: "Envy" });
    expect(w.choices).toEqual({ "court-sins": "Envy" });
    w = rosterReducer(w, { type: "set-choice", choiceId: "court-sins", option: undefined });
    expect("choices" in w).toBe(false);
  });
});
