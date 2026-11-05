import { warbandCost, type RulesData, type Warband, type WarbandCost, type WarbandMember } from "@tc/rules/browser";

// Purchases are staged per member and only written to the roster by
// "Confirm purchases". The confirmed roster is what the API receives; the
// staged roster (applyPending) is what the screens show and validate.

export interface PendingMember {
  adds: string[];
  removes: string[];
  upgradeAdds: string[];
  upgradeRemoves: string[];
}

export type Pending = Record<string, PendingMember>;

export const EMPTY_PENDING: Pending = {};

export type StagingAction =
  | { type: "stage-add"; memberId: string; itemId: string }
  | { type: "unstage-add"; memberId: string; itemId: string }
  | { type: "stage-remove"; memberId: string; itemId: string }
  | { type: "unstage-remove"; memberId: string; itemId: string }
  | { type: "stage-add-upgrade"; memberId: string; upgradeId: string }
  | { type: "unstage-add-upgrade"; memberId: string; upgradeId: string }
  | { type: "stage-remove-upgrade"; memberId: string; upgradeId: string }
  | { type: "unstage-remove-upgrade"; memberId: string; upgradeId: string }
  /** Drop pending changes of members that are no longer on the roster. */
  | { type: "prune"; memberIds: string[] }
  | { type: "discard" };

const empty = (): PendingMember => ({ adds: [], removes: [], upgradeAdds: [], upgradeRemoves: [] });

function withoutLast(ids: string[], id: string): string[] {
  const at = ids.lastIndexOf(id);
  return at === -1 ? ids : [...ids.slice(0, at), ...ids.slice(at + 1)];
}

function isEmpty(pm: PendingMember): boolean {
  return !pm.adds.length && !pm.removes.length && !pm.upgradeAdds.length && !pm.upgradeRemoves.length;
}

function update(pending: Pending, memberId: string, fn: (pm: PendingMember) => PendingMember): Pending {
  const next = fn(pending[memberId] ?? empty());
  const out = { ...pending };
  if (isEmpty(next)) delete out[memberId];
  else out[memberId] = next;
  return out;
}

export function stagingReducer(pending: Pending, action: StagingAction): Pending {
  switch (action.type) {
    case "stage-add":
      return update(pending, action.memberId, (pm) => ({ ...pm, adds: [...pm.adds, action.itemId] }));
    case "unstage-add":
      return update(pending, action.memberId, (pm) => ({ ...pm, adds: withoutLast(pm.adds, action.itemId) }));
    case "stage-remove":
      return update(pending, action.memberId, (pm) => ({ ...pm, removes: [...pm.removes, action.itemId] }));
    case "unstage-remove":
      return update(pending, action.memberId, (pm) => ({ ...pm, removes: withoutLast(pm.removes, action.itemId) }));
    case "stage-add-upgrade":
      return update(pending, action.memberId, (pm) => ({ ...pm, upgradeAdds: [...pm.upgradeAdds, action.upgradeId] }));
    case "unstage-add-upgrade":
      return update(pending, action.memberId, (pm) => ({ ...pm, upgradeAdds: withoutLast(pm.upgradeAdds, action.upgradeId) }));
    case "stage-remove-upgrade":
      return update(pending, action.memberId, (pm) => ({ ...pm, upgradeRemoves: [...pm.upgradeRemoves, action.upgradeId] }));
    case "unstage-remove-upgrade":
      return update(pending, action.memberId, (pm) => ({ ...pm, upgradeRemoves: withoutLast(pm.upgradeRemoves, action.upgradeId) }));
    case "prune": {
      const keep = new Set(action.memberIds);
      return Object.fromEntries(Object.entries(pending).filter(([id]) => keep.has(id)));
    }
    case "discard":
      return EMPTY_PENDING;
  }
}

export interface StagedEntry {
  id: string;
  pending?: "add" | "remove";
}

/**
 * The confirmed ids with pending removals marked (last instances first, as
 * the reducer removes them) and pending additions appended. A removal with
 * no instance left to remove is ignored.
 */
export function stagedIds(base: string[], removes: string[], adds: string[]): StagedEntry[] {
  const entries: StagedEntry[] = base.map((id) => ({ id }));
  for (const id of removes) {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i]!;
      if (e.id === id && e.pending !== "remove") {
        e.pending = "remove";
        break;
      }
    }
  }
  return [...entries, ...adds.map((id) => ({ id, pending: "add" as const }))];
}

export function stagedKit(member: WarbandMember, pm: PendingMember | undefined): StagedEntry[] {
  return stagedIds(member.equipmentItemIds, pm?.removes ?? [], pm?.adds ?? []);
}

export function stagedUpgrades(member: WarbandMember, pm: PendingMember | undefined): StagedEntry[] {
  return stagedIds(member.upgradeIds ?? [], pm?.upgradeRemoves ?? [], pm?.upgradeAdds ?? []);
}

const confirmedIds = (entries: StagedEntry[]) => entries.filter((e) => e.pending !== "remove").map((e) => e.id);

/** The roster as it will be once every pending change is confirmed. Pure; the input is untouched. */
export function applyPending(warband: Warband, pending: Pending): Warband {
  if (Object.keys(pending).length === 0) return warband;
  return {
    ...warband,
    members: warband.members.map((member) => {
      const pm = pending[member.id];
      if (!pm) return member;
      const next: WarbandMember = { ...member, equipmentItemIds: confirmedIds(stagedKit(member, pm)) };
      const upgrades = confirmedIds(stagedUpgrades(member, pm));
      if (upgrades.length) next.upgradeIds = upgrades;
      else delete next.upgradeIds;
      return next;
    }),
  };
}

export function pendingCount(pending: Pending): number {
  return Object.values(pending).reduce((n, pm) => n + pm.adds.length + pm.removes.length + pm.upgradeAdds.length + pm.upgradeRemoves.length, 0);
}

export interface PendingDelta {
  before: WarbandCost;
  after: WarbandCost;
  ducats: number;
  glory: number;
}

export function pendingDelta(warband: Warband, pending: Pending, data: RulesData): PendingDelta {
  const before = warbandCost(warband, data);
  const after = warbandCost(applyPending(warband, pending), data);
  return { before, after, ducats: after.ducats - before.ducats, glory: after.glory - before.glory };
}
