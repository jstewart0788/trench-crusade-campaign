import type { LimitContext, RulesData, ValidationResult, Warband, WarbandCost, WarbandThreshold } from "@tc/rules/browser";
import type { Dispatch } from "react";
import { useOutletContext } from "react-router-dom";
import type { RosterAction } from "../roster/reducer.js";
import type { Purse } from "../roster/purse.js";
import type { Pending, PendingDelta, StagedMemberRow, StagingAction } from "../roster/staging.js";

/** The :code that means "the unsaved draft in this browser". Real codes are six uppercase characters, so they never collide. */
export const DRAFT_CODE = "draft";

/** Everything the three warband screens share; owned by WarbandLayout and read through useWarband(). */
export interface WarbandContext {
  rules: RulesData;
  /** The roster as the screens show it: confirmed members plus every pending purchase applied. */
  warband: Warband;
  /** The roster the API has or will get: no pending purchases. Recruiting and naming act on this directly. */
  confirmed: Warband;
  /** Server code; undefined while the roster is an unsaved draft. */
  code?: string;
  /** URL prefix of the three screens: /w/<code> or /w/draft. */
  base: string;
  dispatch: Dispatch<RosterAction>;
  pending: Pending;
  /** Every member the screens list: confirmed ones (dismissals marked) then pending recruits. */
  rows: StagedMemberRow[];
  stage: (action: StagingAction) => void;
  pendingCount: number;
  delta: PendingDelta;
  /** Something is pending and the staged roster has no errors. */
  canConfirm: boolean;
  confirmPurchases: () => void;
  discardPurchases: () => void;
  /** Limit context, validation, cost and threshold of the staged roster. */
  ctx: LimitContext;
  validation: ValidationResult;
  cost: WarbandCost;
  threshold: WarbandThreshold;
  /** The staged roster's spend against its threshold and glory pool: what every price button weighs. */
  purse: Purse;
}

export function useWarband(): WarbandContext {
  return useOutletContext<WarbandContext>();
}

export const warbandBase = (code?: string) => `/w/${code ?? DRAFT_CODE}`;
export const armouryHref = (base: string, memberId: string) => `${base}/armoury?member=${encodeURIComponent(memberId)}`;
