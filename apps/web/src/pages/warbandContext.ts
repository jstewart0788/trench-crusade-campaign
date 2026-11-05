import type { LimitContext, RulesData, ValidationResult, Warband, WarbandCost, WarbandThreshold } from "@tc/rules/browser";
import type { Dispatch } from "react";
import { useOutletContext } from "react-router-dom";
import type { RosterAction } from "../roster/reducer.js";

/** The :code that means "the unsaved draft in this browser". Real codes are six uppercase characters, so they never collide. */
export const DRAFT_CODE = "draft";

/** Everything the three warband screens share; owned by WarbandLayout and read through useWarband(). */
export interface WarbandContext {
  rules: RulesData;
  warband: Warband;
  /** Server code; undefined while the roster is an unsaved draft. */
  code?: string;
  /** URL prefix of the three screens: /w/<code> or /w/draft. */
  base: string;
  dispatch: Dispatch<RosterAction>;
  ctx: LimitContext;
  validation: ValidationResult;
  cost: WarbandCost;
  threshold: WarbandThreshold;
}

export function useWarband(): WarbandContext {
  return useOutletContext<WarbandContext>();
}

export const warbandBase = (code?: string) => `/w/${code ?? DRAFT_CODE}`;
export const armouryHref = (base: string, memberId: string) => `${base}/armoury?member=${encodeURIComponent(memberId)}`;
