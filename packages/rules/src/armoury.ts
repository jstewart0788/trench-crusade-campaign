import { accessFor, findUnit, type RosterAccess, type RulesData } from "./data.js";
import { copyPurchase, type HistoryScope } from "./history.js";
import type { ListScope } from "./presentation.js";
import { appliesUnder, type CrossFactionArmoury, type WarbandHeldItem } from "./unit-rules.js";

// unit-rules.json crossFactionArmoury and warbandHeldItems: Battlekit a list
// may take from another faction's armoury, and Battlekit the warband holds.
// The converted data already offers the lent Battlekit as rows gated on the
// variant (upstream's own reading of each stipulation); buildRulesData marks
// those rows `foreign`, and these rules add what the rows cannot say: one per
// armoury, bought at creation, bought again only to replace.

type Scope = ListScope & HistoryScope;

export interface ForeignHolding {
  rule: CrossFactionArmoury;
  memberId: string;
  itemId: string;
  /** The game the held copy was bought for (1: at creation, or before purchases were recorded). */
  game: number;
}

/** The lent items the roster holds, per rule, in roster order. */
export function foreignHoldings(data: RulesData, warband: Scope): ForeignHolding[] {
  const out: ForeignHolding[] = [];
  for (const m of warband.members ?? []) {
    const unit = findUnit(data, warband, m.unitId);
    if (!unit) continue;
    const seen = new Map<string, number>();
    for (const itemId of m.equipmentItemIds) {
      const within = seen.get(itemId) ?? 0;
      seen.set(itemId, within + 1);
      const rule = lentBy(data, accessFor(unit, itemId));
      if (!rule || !appliesUnder(rule.under, warband)) continue;
      out.push({ rule, memberId: m.id, itemId, game: copyPurchase(warband, itemId, { memberId: m.id, within })?.game ?? 1 });
    }
  }
  return out;
}

/** Bought at creation (game 1) by this warband, per the record: what may be repurchased later. */
function boughtAtCreation(scope: Scope, itemId: string): boolean {
  return (scope.purchases ?? []).some((p) => p.itemId === itemId && p.game === 1);
}

/**
 * Whether the roster may buy this lent item now: at creation while the rule's
 * allowance lasts, later only to replace one bought at creation and since lost
 * ("You can repurchase the Battlekit later during the campaign if it is lost").
 */
export function foreignBuyable(data: RulesData, warband: Scope, rule: CrossFactionArmoury, itemId: string): { ok: boolean; reason?: string } {
  const held = foreignHoldings(data, warband).filter((h) => h.rule.id === rule.id);
  if (held.length >= rule.max) return { ok: false, reason: `${rule.name}: ${rule.max} from that armoury already` };
  if (warband.gameNumber === 1) return { ok: true };
  if (boughtAtCreation(warband, itemId)) return { ok: true };
  return { ok: false, reason: `${rule.name}: only when the warband is created, or to replace one bought then (p${rule.page})` };
}

/** The crossFactionArmoury rule that lends an armoury row, if it is a lent row. */
export function lentBy(data: RulesData, access: RosterAccess | undefined): CrossFactionArmoury | undefined {
  return access?.foreign ? data.unitRules.file.crossFactionArmoury.find((r) => r.id === access.foreign) : undefined;
}

/** The warbandHeldItems rule that lets this roster hold the item, if any. */
export function heldItemRule(data: RulesData, scope: ListScope, itemId: string): WarbandHeldItem | undefined {
  return data.unitRules.file.warbandHeldItems.find((r) => r.itemId === itemId && appliesUnder(r.under, scope));
}
