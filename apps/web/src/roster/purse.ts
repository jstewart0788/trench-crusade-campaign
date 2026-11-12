import { warbandGloryPool, type RulesData, type Warband } from "@tc/rules/browser";

// The shop's arithmetic: what a price button shows and whether pressing it
// buys. A price is the action; an option the roster may take but cannot pay
// for, or has run out of, stays on the shelf with its reason.

export interface Money {
  ducats: number;
  glory: number;
}

export interface Purse {
  /** Ducats spent by the staged roster. */
  ducats: number;
  /** Threshold Value for this roster. */
  threshold: number;
  /** Glory spent by the staged roster. */
  glory: number;
  /** Glory the warband has to spend; undefined when it is not known (later games without a recorded pool). */
  gloryPool?: number;
}

export interface Cap {
  count: number;
  max: number | null;
  /** Where the limit applies, for the reason text. */
  scope?: "model" | "warband";
  /** What is limited, when it is a group rather than the item itself ("Anchorite Battlekit"). */
  what?: string;
}

export interface Offer {
  cost: Money;
  /** What the purchase gives back: the item a swap replaces. */
  refund?: Money;
  cap?: Cap;
}

export type PurchaseState = "buy" | "capped" | "over-threshold" | "over-glory";

export interface Purchase {
  state: PurchaseState;
  /** Why it cannot be bought, in plain words. */
  reason?: string;
  /** The purse once it is bought. */
  after: Money;
  free: boolean;
}

/** Glory to spend: the warband's own glory limit, or at game 1 the variant's starting glory (Warbands p10: none otherwise). */
export function gloryPool(warband: Warband, data: RulesData): number | undefined {
  return warbandGloryPool(warband, data).value;
}

export function purchase(purse: Purse, offer: Offer): Purchase {
  const refund = offer.refund ?? { ducats: 0, glory: 0 };
  const net = { ducats: offer.cost.ducats - refund.ducats, glory: offer.cost.glory - refund.glory };
  const after = { ducats: purse.ducats + net.ducats, glory: purse.glory + net.glory };
  const free = offer.cost.ducats === 0 && offer.cost.glory === 0;
  const result = (state: PurchaseState, reason?: string): Purchase => (reason ? { state, reason, after, free } : { state, after, free });

  const cap = offer.cap;
  if (cap && cap.max !== null && cap.count >= cap.max) {
    return result("capped", `Limit reached ${cap.count}/${cap.max}${cap.what ? ` ${cap.what}` : ""}${cap.scope === "warband" ? " in the warband" : ""}`);
  }
  // Only a purchase that adds to the bill can break the purse; a free or cheaper swap never does.
  if (net.ducats > 0 && after.ducats > purse.threshold) {
    return result("over-threshold", `Over threshold by ${after.ducats - purse.threshold}`);
  }
  if (net.glory > 0 && purse.gloryPool !== undefined && after.glory > purse.gloryPool) {
    return result("over-glory", `Short ${after.glory - purse.gloryPool} glory`);
  }
  return result("buy");
}
