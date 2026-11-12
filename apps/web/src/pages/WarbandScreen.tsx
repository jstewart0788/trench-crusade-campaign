import { appliesUnder, findSubfaction, heldItemCost, resolveLimit, rosterVariants, warbandGloryPool } from "@tc/rules/browser";
import { useEffect, useMemo, useState } from "react";
import { IconLink } from "../components/IconButton.js";
import { MemberDetails } from "../components/MemberDetails.js";
import { MemberList } from "../components/MemberList.js";
import { Price } from "../components/Price.js";
import { PriceButton } from "../components/PriceButton.js";
import { PreGamePanel } from "../components/PreGamePanel.js";
import { PurseLimits } from "../components/PurseLimits.js";
import { TtsCode } from "../components/TtsCode.js";
import { ValidationPanel } from "../components/ValidationPanel.js";
import { memberDetails, type Details } from "../roster/details.js";
import type { StagedMemberRow } from "../roster/staging.js";
import { memberTraits } from "../roster/traits.js";
import { loadExpanded, saveExpanded } from "../storage.js";
import { armouryHref, useWarband } from "./warbandContext.js";
import styles from "./WarbandScreen.module.css";

export function WarbandScreen() {
  const { rules, warband, code, storageKey, base, cost, threshold, validation, dispatch, rows, stage, ctx, confirmed, purse } = useWarband();
  // Battlekit the warband may hold itself (warbandHeldItems: the Defenders' Grand Cannon gun battery, p99).
  const holdable = rules.unitRules.file.warbandHeldItems.filter((r) => appliesUnder(r.under, warband));
  const faction = rules.factionsById.get(warband.factionId);
  const subfaction = findSubfaction(rules, warband);
  const variant = rosterVariants(rules, warband).find((v) => v.id === warband.variantId);
  const patron = rules.campaign.patrons.find((p) => p.id === warband.patronId);
  const glory = warbandGloryPool(warband, rules);
  const pool = glory.value;
  const over = cost.ducats > threshold.value;
  const n = warband.members.length;

  const [expanded, setExpanded] = useState(() => new Set(loadExpanded(storageKey)));
  useEffect(() => saveExpanded(storageKey, [...expanded]), [expanded, storageKey]);
  const toggle = (memberId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(memberId)) next.add(memberId);
      return next;
    });

  // Details come from the TTS export of the roster as shown; a member being dismissed is not in it, so it reads from the confirmed roster.
  const openRows = rows.filter((r) => expanded.has(r.member.id));
  const needStaged = openRows.some((r) => r.pending !== "remove");
  const needLeaving = openRows.some((r) => r.pending === "remove");
  const staged = useMemo<Details | undefined>(() => (needStaged ? memberDetails(warband, rules, storageKey) : undefined), [needStaged, warband, rules, storageKey]);
  const leaving = useMemo<Details | undefined>(() => (needLeaving ? memberDetails(confirmed, rules, storageKey) : undefined), [needLeaving, confirmed, rules, storageKey]);
  const detailsOf = (row: StagedMemberRow) => {
    const source = row.pending === "remove" ? leaving : staged;
    const found = source && "byId" in source ? source.byId.get(row.member.id) : undefined;
    return <MemberDetails detail={found} error={source && "error" in source ? source.error : undefined} modelsLoaded={rules.models !== undefined} />;
  };

  return (
    <div className={styles.screen}>
      <div className={styles.grid}>
        <section className="panel">
          <h2>Campaign</h2>
          <label>
            Name
            <input value={warband.name} onChange={(e) => dispatch({ type: "rename", name: e.target.value })} placeholder="Warband name" />
          </label>
          <dl className={styles.facts}>
            <dt>Faction</dt>
            <dd>{faction?.name ?? warband.factionId}</dd>
            {(subfaction || faction?.subfactions?.length) && (
              <>
                <dt>Subfaction</dt>
                <dd>{subfaction?.name ?? <span className="muted">None (core list)</span>}</dd>
              </>
            )}
            <dt>Variant</dt>
            <dd>{variant?.name ?? <span className="muted">None</span>}</dd>
            <dt>Patron</dt>
            <dd>{patron?.name ?? <span className="muted">None</span>}</dd>
            {rules.unitRules.file.rosterChoices
              .filter((c) => appliesUnder(c.under, warband))
              .map((c) => (
                <div key={c.id} style={{ display: "contents" }}>
                  <dt>{c.name}</dt>
                  <dd>
                    <select aria-label={c.name} value={warband.choices?.[c.id] ?? ""} onChange={(e) => dispatch({ type: "set-choice", choiceId: c.id, option: e.target.value || undefined })}>
                      <option value="">Choose (p{c.page})</option>
                      {c.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </dd>
                </div>
              ))}
            <dt>Game</dt>
            <dd>{warband.gameNumber}</dd>
            <dt>Ducats</dt>
            <dd>
              <span className={over ? "error" : ""}>{cost.ducats}</span> of {threshold.value}
              {threshold.custom && <span className="muted"> (custom limit; the rules give {threshold.ruled})</span>}
              {threshold.clamped && <span className="warning"> (table ends at game {threshold.row.game})</span>}
            </dd>
            <dt>Glory</dt>
            <dd>
              {cost.glory} spent{pool !== undefined ? ` of ${pool}` : ""}
              {glory.custom && <span className="muted"> (custom limit; the rules give {glory.ruled ?? "none"})</span>}
            </dd>
          </dl>
          <div>
            <PurseLimits
              ducatLimit={warband.ducatLimit}
              glory={warband.glory}
              ruledDucats={threshold.ruled}
              ruledGlory={glory.ruled}
              onDucats={(n) => dispatch({ type: "set-ducat-limit", ducats: n })}
              onGlory={(n) => dispatch({ type: "set-glory", glory: n })}
            />
          </div>
          <p className="quiet">Faction, subfaction, variant, patron and game are fixed at creation; campaign play will move them later. The ducat and glory limits stay editable: a campaign or house rule can change them between games.</p>
        </section>
        <section className="panel">
          <h2>TTS import</h2>
          {code ? <TtsCode code={code} /> : <p className="muted">Unsaved draft, kept in this browser. Save (top right) to get a code the TTS mod can import.</p>}
        </section>
      </div>

      <section>
        <div className={styles.rosterHead}>
          <h2>
            Roster · {n} {n === 1 ? "model" : "models"}
          </h2>
          <IconLink to={`${base}/barracks`} glyph="barracks" label="Recruit in the Barracks" tone="brass" />
        </div>
        <MemberList
          rows={rows}
          roster={warband}
          rules={rules}
          cost={cost}
          validation={validation}
          base={base}
          onRename={(row, name) => (row.pending === "add" ? stage({ type: "rename-recruit", memberId: row.member.id, name }) : dispatch({ type: "rename-member", memberId: row.member.id, name }))}
          traitsFor={(row, unit) => memberTraits(row.member, unit, warband, rules, ctx)}
          expand={{ isOpen: (id) => expanded.has(id), onToggle: toggle, details: detailsOf }}
        />
      </section>

      {holdable.length > 0 && (
        <section className="panel" aria-label="Warband armoury">
          <h2>Warband armoury</h2>
          <ul>
            {holdable.map((r) => {
              const item = rules.equipmentById.get(r.itemId);
              if (!item) return null;
              const held = (warband.armoury ?? []).filter((id) => id === r.itemId).length;
              const carried = warband.members.reduce((n, m) => n + m.equipmentItemIds.filter((id) => id === r.itemId).length, 0);
              const max = resolveLimit(item.limits ?? undefined, "max", "warband", null, ctx, item.name).value;
              return (
                <li key={r.id}>
                  <span>
                    {r.name}: {held} held{carried ? `, ${carried} carried by models` : ""}
                  </span>{" "}
                  <PriceButton offer={{ cost: heldItemCost(rules, r.itemId), cap: { count: held + carried, max, scope: "warband" } }} purse={purse} label={`Add a ${r.name}`} onBuy={() => dispatch({ type: "add-armoury-item", itemId: r.itemId })} />
                  {held > 0 && (
                    <button type="button" onClick={() => dispatch({ type: "remove-armoury-item", itemId: r.itemId })}>
                      Remove one (<Price cost={heldItemCost(rules, r.itemId)} />)
                    </button>
                  )}
                  <p className="quiet">{r.text} (p{r.page})</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <PreGamePanel warband={confirmed} rules={rules} dispatch={dispatch} />

      <ValidationPanel warband={warband} rules={rules} validation={validation} linkTo={(memberId) => armouryHref(base, memberId)} />
    </div>
  );
}
