import type { RulesData, ValidationResult, Warband, WarbandCost, WarbandThreshold } from "@tc/rules/browser";
import type { Dispatch } from "react";
import { Link } from "react-router-dom";
import type { RosterAction } from "../roster/reducer.js";
import styles from "./Header.module.css";

interface Props {
  warband: Warband;
  rules: RulesData;
  cost: WarbandCost;
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

/** Shown above all three warband screens: the name (always editable), the fixed campaign facts, totals, the legality badge and Save. */
export function Header({ warband, rules, cost, threshold, validation, code, base, dirty, busy, error, onSave, dispatch }: Props) {
  const faction = rules.factionsById.get(warband.factionId);
  const variant = faction?.variants.find((v) => v.id === warband.variantId);
  const patron = rules.campaign.patrons.find((p) => p.id === warband.patronId);
  const pool = warband.glory ?? (warband.gameNumber === 1 ? (variant?.startingGlory ?? 0) : undefined);
  const over = cost.ducats > threshold.value;
  const errors = validation.errors.length;
  const warnings = validation.warnings.length;

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
        <span className={styles.total}>
          <span className={`${styles.big} ${over ? "error" : ""}`}>{cost.ducats}</span>
          <span className="muted"> / {threshold.value} ducats</span>
        </span>
        <span className={styles.total}>
          <span className={styles.big}>{cost.glory}</span>
          <span className="muted"> glory{pool !== undefined ? ` of ${pool}` : ""}</span>
        </span>
        <Link to={base} className={`${styles.badge} ${errors ? styles.bad : styles.good}`} title="Open the Warband screen for the full list">
          {errors === 0 ? "Legal" : `${errors} ${errors === 1 ? "error" : "errors"}`}
          {warnings > 0 && <span className={styles.warn}> · {warnings} {warnings === 1 ? "warning" : "warnings"}</span>}
        </Link>
      </div>

      <div className={styles.save}>
        {code && (
          <span className={styles.code} title="TTS import code">
            {code}
          </span>
        )}
        {error && <span className="error">{error}</span>}
        {!code && !busy && <span className="muted">Draft</span>}
        {code && !dirty && !busy && <span className="muted">Saved</span>}
        {code && dirty && !busy && <span className="warning">Unsaved changes</span>}
        <button className="primary" onClick={onSave} disabled={busy || (!!code && !dirty)}>
          {busy ? "Saving…" : code ? "Save changes" : "Save and get code"}
        </button>
      </div>
    </header>
  );
}
