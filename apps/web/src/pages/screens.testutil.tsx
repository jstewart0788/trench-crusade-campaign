import { limitContext, validateWarband, warbandCost, warbandThreshold, type RulesData, type Warband } from "@tc/rules";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { gloryPool } from "../roster/purse.js";
import { applyPending, pendingCount, pendingDelta, stagedMembers, type Pending } from "../roster/staging.js";
import { ArmouryScreen } from "./ArmouryScreen.js";
import { BarracksScreen } from "./BarracksScreen.js";
import type { WarbandContext } from "./warbandContext.js";
import { WarbandScreen } from "./WarbandScreen.js";

const noop = () => {};

/** The warband screens read everything from WarbandLayout's outlet context; this builds it the same way from a roster and its pending changes. */
export function contextFor(data: RulesData, confirmed: Warband, pending: Pending): WarbandContext {
  const staged = applyPending(confirmed, pending);
  const cost = warbandCost(staged, data);
  const threshold = warbandThreshold(staged, data);
  const pool = gloryPool(staged, data);
  return {
    rules: data,
    warband: staged,
    confirmed,
    base: "/w/draft",
    dispatch: noop,
    pending,
    rows: stagedMembers(confirmed, pending),
    stage: noop,
    pendingCount: pendingCount(pending),
    delta: pendingDelta(confirmed, pending, data),
    canConfirm: false,
    confirmPurchases: noop,
    discardPurchases: noop,
    ctx: limitContext(staged, data),
    validation: validateWarband(staged, data),
    cost,
    threshold,
    purse: { ducats: cost.ducats, threshold: threshold.value, glory: cost.glory, ...(pool !== undefined ? { gloryPool: pool } : {}) },
  };
}

/** Server-renders the screen at `path` (/w/draft, /w/draft/barracks, /w/draft/armoury?member=…). */
export function renderScreen(path: string, ctx: WarbandContext) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/w/:code" element={<Outlet context={ctx} />}>
          <Route index element={<WarbandScreen />} />
          <Route path="barracks" element={<BarracksScreen />} />
          <Route path="armoury" element={<ArmouryScreen />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
