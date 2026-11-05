import type { Warband } from "@tc/rules/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PENDING, stagingReducer } from "./roster/staging.js";
import { discardDraft, loadDraft, loadExpanded, loadPending, promoteDraft, saveExpanded, savePending, startDraft } from "./storage.js";

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal("window", {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const roster = (name: string): Warband => ({ id: name, name, factionId: "new-antioch", gameNumber: 1, members: [{ id: "m1", unitId: "new-antioch/lieutenant", equipmentItemIds: [] }] });
const staged = stagingReducer(EMPTY_PENDING, { type: "stage-add", memberId: "m1", itemId: "pistol" });

describe("drafts keep their own browser state", () => {
  it("a new list does not see the last draft's pending purchases or open rows, and the old draft's are cleared", () => {
    const first = startDraft(roster("First"));
    savePending(first.key, staged);
    saveExpanded(first.key, ["m1"]);
    expect(loadPending(first.key)).toEqual(staged);

    const second = startDraft(roster("Second"));
    expect(second.key).not.toBe(first.key);
    expect(second.key).toMatch(/^draft-[0-9a-f]{12}$/);
    expect(loadDraft()).toEqual(second);
    expect(loadPending(second.key)).toEqual(EMPTY_PENDING);
    expect(loadExpanded(second.key)).toEqual([]);
    expect(loadPending(first.key)).toEqual(EMPTY_PENDING);
    expect(loadExpanded(first.key)).toEqual([]);
  });

  it("saving moves the draft's own state to its new code and nobody else's", () => {
    const draft = startDraft(roster("Saved"));
    savePending(draft.key, staged);
    saveExpanded(draft.key, ["m1"]);
    savePending("OTHER1", staged);
    promoteDraft(draft.key, "ABC234");
    expect(loadPending("ABC234")).toEqual(staged);
    expect(loadExpanded("ABC234")).toEqual(["m1"]);
    expect(loadPending(draft.key)).toEqual(EMPTY_PENDING);
    expect(loadExpanded(draft.key)).toEqual([]);
    expect(loadDraft()).toBeUndefined();
    expect(loadPending("OTHER1")).toEqual(staged);
  });

  it("discarding a draft clears its record and everything kept under its key", () => {
    const draft = startDraft(roster("Gone"));
    savePending(draft.key, staged);
    saveExpanded(draft.key, ["m1"]);
    discardDraft();
    expect(loadDraft()).toBeUndefined();
    expect([...store.keys()]).toEqual([]);
  });

  it("a draft stored before drafts had keys keeps its state under the old shared key until a new list replaces it", () => {
    store.set("tc.roster.draft", JSON.stringify(roster("Legacy")));
    savePending("draft", staged);
    expect(loadDraft()).toEqual({ key: "draft", warband: roster("Legacy") });
    expect(loadPending("draft")).toEqual(staged);
    const next = startDraft(roster("Next"));
    expect(loadPending("draft")).toEqual(EMPTY_PENDING);
    expect(loadPending(next.key)).toEqual(EMPTY_PENDING);
  });
});
