import { findSubfaction, rosterVariants } from "@tc/rules/browser";
import { Link } from "react-router-dom";
import { MemberList } from "../components/MemberList.js";
import { TtsCode } from "../components/TtsCode.js";
import { ValidationPanel } from "../components/ValidationPanel.js";
import { memberTraits } from "../roster/traits.js";
import { armouryHref, useWarband } from "./warbandContext.js";
import styles from "./WarbandScreen.module.css";

export function WarbandScreen() {
  const { rules, warband, code, base, cost, threshold, validation, dispatch, rows, stage, ctx } = useWarband();
  const faction = rules.factionsById.get(warband.factionId);
  const subfaction = findSubfaction(rules, warband);
  const variant = rosterVariants(rules, warband).find((v) => v.id === warband.variantId);
  const patron = rules.campaign.patrons.find((p) => p.id === warband.patronId);
  const pool = warband.glory ?? (warband.gameNumber === 1 ? (variant?.startingGlory ?? 0) : undefined);
  const over = cost.ducats > threshold.value;
  const n = warband.members.length;

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
            <dt>Game</dt>
            <dd>{warband.gameNumber}</dd>
            <dt>Ducats</dt>
            <dd>
              <span className={over ? "error" : ""}>{cost.ducats}</span> of {threshold.value}
              {threshold.clamped && <span className="warning"> (table ends at game {threshold.row.game})</span>}
            </dd>
            <dt>Glory</dt>
            <dd>
              {cost.glory} spent{pool !== undefined ? ` of ${pool}` : ""}
            </dd>
          </dl>
          <p className="quiet">Faction, subfaction, variant, patron, game and purse are fixed at creation; campaign play will move them later.</p>
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
          <Link to={`${base}/barracks`}>Recruit in the Barracks</Link>
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
        />
      </section>

      <ValidationPanel warband={warband} rules={rules} validation={validation} linkTo={(memberId) => armouryHref(base, memberId)} />
    </div>
  );
}
