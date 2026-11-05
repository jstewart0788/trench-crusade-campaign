import { warbandCost, type RulesData, type Warband, type WarbandCost, type WarbandMember } from "@tc/rules/browser";

// Purchases are staged and only written to the roster by "Confirm purchases":
// kit and upgrade changes per member, recruits, and dismissals. The confirmed
// roster is what the API receives; the staged roster (applyPending) is what
// the screens show and validate.

export interface PendingMember {
  adds: string[];
  removes: string[];
  upgradeAdds: string[];
  upgradeRemoves: string[];
}

export interface Pending {
  /** Kit and upgrade changes, by member id (confirmed members and recruits alike). */
  members: Record<string, PendingMember>;
  /** New members, with the kit they arrive with. */
  recruits: WarbandMember[];
  /** Confirmed members leaving. */
  dismissals: string[];
}

export const EMPTY_PENDING: Pending = { members: {}, recruits: [], dismissals: [] };

export type StagingAction =
  | { type: "stage-add"; memberId: string; itemId: string }
  | { type: "unstage-add"; memberId: string; itemId: string }
  | { type: "stage-remove"; memberId: string; itemId: string }
  | { type: "unstage-remove"; memberId: string; itemId: string }
  | { type: "stage-add-upgrade"; memberId: string; upgradeId: string }
  | { type: "unstage-add-upgrade"; memberId: string; upgradeId: string }
  | { type: "stage-remove-upgrade"; memberId: string; upgradeId: string }
  | { type: "unstage-remove-upgrade"; memberId: string; upgradeId: string }
  | { type: "stage-recruit"; member: WarbandMember }
  | { type: "unstage-recruit"; memberId: string }
  | { type: "stage-dismiss"; memberId: string }
  | { type: "unstage-dismiss"; memberId: string }
  /** Names are never staged; a recruit's name is just edited in place. */
  | { type: "rename-recruit"; memberId: string; name: string }
  /** Drop pending changes of members that are neither on the roster nor recruits. */
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
  const next = fn(pending.members[memberId] ?? empty());
  const members = { ...pending.members };
  if (isEmpty(next)) delete members[memberId];
  else members[memberId] = next;
  return { ...pending, members };
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
    case "stage-recruit":
      return { ...pending, recruits: [...pending.recruits, action.member] };
    case "unstage-recruit": {
      const members = { ...pending.members };
      delete members[action.memberId];
      return { ...pending, members, recruits: pending.recruits.filter((m) => m.id !== action.memberId) };
    }
    case "stage-dismiss":
      return pending.dismissals.includes(action.memberId) ? pending : { ...pending, dismissals: [...pending.dismissals, action.memberId] };
    case "unstage-dismiss":
      return { ...pending, dismissals: pending.dismissals.filter((id) => id !== action.memberId) };
    case "rename-recruit":
      return {
        ...pending,
        recruits: pending.recruits.map((m) => {
          if (m.id !== action.memberId) return m;
          const next = { ...m };
          if (action.name.trim() === "") delete next.name;
          else next.name = action.name;
          return next;
        }),
      };
    case "prune": {
      const keep = new Set([...action.memberIds, ...pending.recruits.map((m) => m.id)]);
      return {
        members: Object.fromEntries(Object.entries(pending.members).filter(([id]) => keep.has(id))),
        recruits: pending.recruits,
        dismissals: pending.dismissals.filter((id) => action.memberIds.includes(id)),
      };
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

function withChanges(member: WarbandMember, pm: PendingMember | undefined): WarbandMember {
  if (!pm) return member;
  const next: WarbandMember = { ...member, equipmentItemIds: confirmedIds(stagedKit(member, pm)) };
  const upgrades = confirmedIds(stagedUpgrades(member, pm));
  if (upgrades.length) next.upgradeIds = upgrades;
  else delete next.upgradeIds;
  return next;
}

/** The member record a staged change applies to: a confirmed member, or a recruit. */
export function baseMember(confirmed: Warband, pending: Pending, memberId: string): WarbandMember | undefined {
  return confirmed.members.find((m) => m.id === memberId) ?? pending.recruits.find((m) => m.id === memberId);
}

export interface StagedMemberRow {
  /** The member with its pending kit changes applied. */
  member: WarbandMember;
  /** Pending recruit, or confirmed member pending dismissal. */
  pending?: "add" | "remove";
  /** Kit and upgrade changes pending on it. */
  changes: number;
}

/** Every member the screens list: confirmed ones (dismissals marked) then recruits. */
export function stagedMembers(confirmed: Warband, pending: Pending): StagedMemberRow[] {
  const changesOf = (id: string) => {
    const pm = pending.members[id];
    return pm ? pm.adds.length + pm.removes.length + pm.upgradeAdds.length + pm.upgradeRemoves.length : 0;
  };
  const rows: StagedMemberRow[] = confirmed.members.map((m) => {
    const row: StagedMemberRow = { member: withChanges(m, pending.members[m.id]), changes: changesOf(m.id) };
    if (pending.dismissals.includes(m.id)) row.pending = "remove";
    return row;
  });
  for (const r of pending.recruits) rows.push({ member: withChanges(r, pending.members[r.id]), pending: "add", changes: changesOf(r.id) });
  return rows;
}

export function hasPending(pending: Pending): boolean {
  return pendingCount(pending) > 0;
}

/** Clears pre-game choices that name a model no longer on the roster (a dismissed victim). */
export function prunePreGame(warband: Warband): Warband {
  const pre = warband.preGame;
  if (!pre) return warband;
  const ids = new Set(warband.members.map((m) => m.id));
  if (Object.values(pre).every((v) => v === null || ids.has(v))) return warband;
  return { ...warband, preGame: Object.fromEntries(Object.entries(pre).map(([k, v]) => [k, v !== null && ids.has(v) ? v : null])) };
}

/** The roster as it will be once every pending change is confirmed. Pure; the input is untouched. */
export function applyPending(warband: Warband, pending: Pending): Warband {
  if (!hasPending(pending)) return warband;
  return prunePreGame({
    ...warband,
    members: stagedMembers(warband, pending)
      .filter((r) => r.pending !== "remove")
      .map((r) => r.member),
  });
}

export function pendingCount(pending: Pending): number {
  const kit = Object.values(pending.members).reduce((n, pm) => n + pm.adds.length + pm.removes.length + pm.upgradeAdds.length + pm.upgradeRemoves.length, 0);
  return kit + pending.recruits.length + pending.dismissals.length;
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
