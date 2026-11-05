import type { Warband, WarbandMember } from "@tc/rules/browser";
import { applyPending, prunePreGame, type Pending } from "./staging.js";

// The builder's state is the Warband itself: every action returns a new
// roster that is valid JSON for POST /api/warbands. Nothing here reads the
// rules data; the UI resolves names, prices and gates and passes ids in.

export type RosterAction =
  | { type: "load"; warband: Warband }
  | { type: "rename"; name: string }
  | { type: "set-game-number"; gameNumber: number }
  | { type: "set-glory"; glory: number | undefined }
  | { type: "set-variant"; variantId: string | undefined }
  | { type: "set-patron"; patronId: string | undefined }
  | { type: "add-member"; unitId: string; equipmentItemIds?: string[]; upgradeIds?: string[] }
  | { type: "duplicate-member"; memberId: string }
  | { type: "remove-member"; memberId: string }
  | { type: "rename-member"; memberId: string; name: string }
  | { type: "add-item"; memberId: string; itemId: string }
  | { type: "remove-item"; memberId: string; itemId: string }
  | { type: "add-upgrade"; memberId: string; upgradeId: string }
  | { type: "remove-upgrade"; memberId: string; upgradeId: string }
  /** Confirm purchases: every member's staged changes written to the roster at once. */
  | { type: "apply-purchases"; pending: Pending }
  /** A choice made before the game (Broken on the Wheel's victim); not a purchase, never staged. */
  | { type: "set-pre-game"; key: string; memberId: string | null };

export interface NewWarbandInit {
  name: string;
  factionId: string;
  subfactionId?: string;
  variantId?: string;
  patronId?: string;
  gameNumber?: number;
}

export function createWarband(init: NewWarbandInit, id: string = crypto.randomUUID()): Warband {
  const warband: Warband = { id, name: init.name, factionId: init.factionId, gameNumber: init.gameNumber ?? 1, members: [] };
  if (init.subfactionId) warband.subfactionId = init.subfactionId;
  if (init.variantId) warband.variantId = init.variantId;
  if (init.patronId) warband.patronId = init.patronId;
  return warband;
}

/** m1, m2, … past the highest id already in use, so ids never repeat within a roster. */
export function nextMemberId(members: WarbandMember[]): string {
  let max = 0;
  for (const m of members) {
    const n = /^m(\d+)$/.exec(m.id);
    if (n) max = Math.max(max, Number(n[1]));
  }
  return `m${max + 1}`;
}

function withOptional<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined): T {
  const next = { ...obj };
  if (value === undefined || value === "") delete next[key];
  else next[key] = value;
  return next;
}

function updateMember(state: Warband, memberId: string, fn: (m: WarbandMember) => WarbandMember): Warband {
  return { ...state, members: state.members.map((m) => (m.id === memberId ? fn(m) : m)) };
}

function removeLast(ids: string[], id: string): string[] {
  const at = ids.lastIndexOf(id);
  return at === -1 ? ids : [...ids.slice(0, at), ...ids.slice(at + 1)];
}

export function rosterReducer(state: Warband, action: RosterAction): Warband {
  switch (action.type) {
    case "load":
      return action.warband;
    case "rename":
      return { ...state, name: action.name };
    case "set-game-number":
      return { ...state, gameNumber: Math.max(1, Math.floor(action.gameNumber) || 1) };
    case "set-glory":
      return withOptional(state, "glory", action.glory === undefined ? undefined : Math.max(0, Math.floor(action.glory) || 0));
    case "set-variant":
      return withOptional(state, "variantId", action.variantId);
    case "set-patron":
      return withOptional(state, "patronId", action.patronId);
    case "add-member": {
      const member: WarbandMember = { id: nextMemberId(state.members), unitId: action.unitId, equipmentItemIds: [...(action.equipmentItemIds ?? [])] };
      if (action.upgradeIds?.length) member.upgradeIds = [...action.upgradeIds];
      return { ...state, members: [...state.members, member] };
    }
    case "duplicate-member": {
      const at = state.members.findIndex((m) => m.id === action.memberId);
      const source = state.members[at];
      if (!source) return state;
      const copy: WarbandMember = { ...source, id: nextMemberId(state.members), equipmentItemIds: [...source.equipmentItemIds] };
      if (source.upgradeIds) copy.upgradeIds = [...source.upgradeIds];
      delete copy.name;
      return { ...state, members: [...state.members.slice(0, at + 1), copy, ...state.members.slice(at + 1)] };
    }
    case "remove-member":
      return prunePreGame({ ...state, members: state.members.filter((m) => m.id !== action.memberId) });
    case "rename-member":
      return updateMember(state, action.memberId, (m) => withOptional(m, "name", action.name.trim() === "" ? undefined : action.name));
    case "add-item":
      return updateMember(state, action.memberId, (m) => ({ ...m, equipmentItemIds: [...m.equipmentItemIds, action.itemId] }));
    case "remove-item":
      return updateMember(state, action.memberId, (m) => ({ ...m, equipmentItemIds: removeLast(m.equipmentItemIds, action.itemId) }));
    case "add-upgrade":
      return updateMember(state, action.memberId, (m) => ({ ...m, upgradeIds: [...(m.upgradeIds ?? []), action.upgradeId] }));
    case "remove-upgrade":
      return updateMember(state, action.memberId, (m) => {
        const upgradeIds = removeLast(m.upgradeIds ?? [], action.upgradeId);
        return withOptional({ ...m, upgradeIds }, "upgradeIds", upgradeIds.length ? upgradeIds : undefined);
      });
    case "apply-purchases":
      return applyPending(state, action.pending);
    case "set-pre-game":
      return { ...state, preGame: { ...state.preGame, [action.key]: action.memberId } };
  }
}
