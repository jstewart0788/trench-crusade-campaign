import type { RulesData, ValidationResult, Warband, WarbandCost, WarbandThreshold } from "@tc/rules/browser";
import type { Dispatch } from "react";
import { Link } from "react-router-dom";
import type { RosterAction } from "../roster/reducer.js";
import type { PendingDelta } from "../roster/staging.js";
import styles from "./Header.module.css";

interface Props {
  warband: Warband;
  rules: RulesData;
  cost: WarbandCost;
  delta: PendingDelta;
  pendingCount: number;
  canConfirm: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
  threshold: WarbandThreshold;
  validation: ValidationResult;
  code?: string;
  base: string;
  dirty: boolean;
  busy: boolean;
  error?: string;
  onSave: () => void;
  dispatch: Dispatch<RosterAction>;
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Shown above all three warband screens: the name (always editable), the fixed campaign facts, totals (current → after while purchases are pending), the legality badge, Confirm/Discard and Save. */
export function Header({ warband, rules, cost, delta, pendingCount, canConfirm, onConfirm, onDiscard, threshold, validation, code, base, dirty, busy, error, onSave, dispatch }: Props) {
  const faction = rules.factionsById.get(warband.factionId);
  const variant = faction?.variants.find((v) => v.id === warband.variantId);
  const patron = rules.campaign.patrons.find((p) => p.id === warband.patronId);
  const pool = warband.glory ?? (warband.gameNumber === 1 ? (variant?.startingGlory ?? 0) : undefined);
  const over = cost.ducats > threshold.value;
  const errors = validation.errors.length;
  const warnings = validation.warnings.length;
  const staging = pendingCount > 0;

  return (
    <header className={`panel ${styles.header}`}>
      <div className={styles.identity}>
        <input
          className={styles.name}
          value={warband.name}
          onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
          placeholder="Warband name"
          aria-label="Warband name"
        />
        <div className={styles.meta}>
          {faction?.name ?? warband.factionId}
          {variant && ` · ${variant.name}`}
          {patron && ` · ${patron.name}`}
          {` · Game ${warband.gameNumber}`}
        </div>
      </div>

      <div className={styles.totals}>
        <span className={styles.total} title={staging ? "Ducats now → after confirming" : undefined}>
          {staging && <span className={styles.was}>{delta.before.ducats} → </span>}
          <span className={`${styles.big} ${over ? "error" : ""}`}>{cost.ducats}</span>
          <span className="muted"> / {threshold.value} ducats</span>
          {staging && <span className={styles.delta}>{signed(delta.ducats)}</span>}
        </span>
        <span className={styles.total}>
          {staging && <span className={styles.was}>{delta.before.glory} → </span>}
          <span className={styles.big}>{cost.glory}</span>
          <span className="muted"> glory{pool !== undefined ? ` of ${pool}` : ""}</span>
          {staging && delta.glory !== 0 && <span className={styles.delta}>{signed(delta.glory)}</span>}
        </span>
        <Link to={base} className={`${styles.badge} ${errors ? styles.bad : styles.good}`} title="Open the Warband screen for the full list">
          {errors === 0 ? "Legal" : `${errors} ${errors === 1 ? "error" : "errors"}`}
          {warnings > 0 && <span className={styles.warn}> · {warnings} {warnings === 1 ? "warning" : "warnings"}</span>}
        </Link>
      </div>

      <div className={styles.save}>
        {staging && (
          <>
            <button onClick={onDiscard}>Discard changes</button>
            <button className="primary" onClick={onConfirm} disabled={!canConfirm} title={canConfirm ? undefined : "Fix the errors before confirming"}>
              Confirm purchases ({pendingCount})
            </button>
            <span className={styles.divider} />
          </>
        )}
        {code && (
          <span className={styles.code} title="TTS import code">
            {code}
          </span>
        )}
        {error && <span className="error">{error}</span>}
        {!code && !busy && <span className="muted">Draft</span>}
        {code && !dirty && !busy && <span className="muted">Saved</span>}
        {code && dirty && !busy && <span className="warning">Unsaved changes</span>}
        <button className={staging ? "" : "primary"} onClick={onSave} disabled={busy || (!!code && !dirty)} title={staging ? "Saves the confirmed roster; pending purchases stay here until confirmed" : undefined}>
          {busy ? "Saving…" : code ? "Save changes" : "Save and get code"}
        </button>
      </div>
    </header>
  );
}
