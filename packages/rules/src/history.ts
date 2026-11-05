import type { Purchase, WarbandMember } from "./roster.js";

// What was bought when, from Warband.purchases. A member holding n copies of an
// item holds the last n it bought; copies beyond the member's recorded
// purchases predate the record and count as bought when the warband was
// created (game 1), which keeps rosters saved before it was kept valid.

export interface HistoryScope {
  gameNumber?: number | undefined;
  members?: readonly WarbandMember[] | undefined;
  purchases?: readonly Purchase[] | undefined;
}

/** A copy of an item on a member: the member, and which of its copies (0-based, in its kit order). */
export interface CopyRef {
  memberId: string;
  within: number;
}

const entries = (scope: HistoryScope, memberId: string, itemId: string) => (scope.purchases ?? []).filter((p) => p.memberId === memberId && p.itemId === itemId);

/** The recorded purchase behind a held copy; undefined for a copy bought before purchases were recorded. */
export function copyPurchase(scope: HistoryScope, itemId: string, copy: CopyRef): Purchase | undefined {
  const member = scope.members?.find((m) => m.id === copy.memberId);
  const held = member ? member.equipmentItemIds.filter((id) => id === itemId).length : copy.within + 1;
  const mine = entries(scope, copy.memberId, itemId);
  return mine[mine.length - held + copy.within];
}

/** The game a held copy was bought for: its record's, or 1 for kit that predates the record. */
export function copyGame(scope: HistoryScope, itemId: string, copy: CopyRef): number {
  return copyPurchase(scope, itemId, copy)?.game ?? 1;
}

export type FirstPurchase =
  /** Nothing of the kind has been bought: the next one is the first. */
  | { state: "none" }
  /** The first one bought is still held, by this copy, bought for this game. */
  | { state: "held"; copy: CopyRef; game: number }
  /** The first one was bought and has since gone. */
  | { state: "gone" };

/**
 * The warband's first purchase of an item (Cold Steel, p39: "the first time that
 * is purchased"). Unrecorded copies came first, in roster order; otherwise the
 * first record, if the member still holds that copy.
 */
export function firstPurchase(scope: HistoryScope, itemId: string): FirstPurchase {
  const members = scope.members ?? [];
  for (const m of members) {
    const held = m.equipmentItemIds.filter((id) => id === itemId).length;
    if (held > entries(scope, m.id, itemId).length) return { state: "held", copy: { memberId: m.id, within: 0 }, game: 1 };
  }
  const first = (scope.purchases ?? []).find((p) => p.itemId === itemId);
  if (!first) return { state: "none" };
  const member = members.find((m) => m.id === first.memberId);
  const mine = entries(scope, first.memberId, itemId);
  const held = member ? member.equipmentItemIds.filter((id) => id === itemId).length : 0;
  const at = mine.indexOf(first) - (mine.length - held);
  return at >= 0 ? { state: "held", copy: { memberId: first.memberId, within: at }, game: first.game } : { state: "gone" };
}

/** True when this copy (or, without one, the next copy bought) is the warband's first purchase of the item; and the game it was bought for. */
export function isFirstPurchase(scope: HistoryScope, itemId: string, copy?: CopyRef): { first: boolean; game: number } {
  const f = firstPurchase(scope, itemId);
  if (!copy) return { first: f.state === "none", game: scope.gameNumber ?? 1 };
  if (f.state !== "held") return { first: false, game: copyGame(scope, itemId, copy) };
  return { first: f.copy.memberId === copy.memberId && f.copy.within === copy.within, game: f.game };
}

/** The purchases to record when a member gains these items for the game being played. */
export function purchasesFor(memberId: string, itemIds: readonly string[], game: number): Purchase[] {
  return itemIds.map((itemId) => ({ itemId, memberId, game }));
}
