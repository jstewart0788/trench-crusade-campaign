import { findSubfaction, rosterVariants, type RulesData, type ValidationResult, type Warband, type WarbandCost, type WarbandThreshold } from "@tc/rules/browser";
import type { Dispatch } from "react";
import type { RosterAction } from "../roster/reducer.js";
import type { PendingDelta } from "../roster/staging.js";
import { cx } from "./cx.js";
import { DucatGlyph, GloryGlyph } from "./Glyphs.js";
import { Price } from "./Price.js";
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
  dirty: boolean;
  busy: boolean;
  error?: string;
  onSave: () => void;
  dispatch: Dispatch<RosterAction>;
}

/** Shown above all three warband screens: the name (always editable), the fixed campaign facts, totals (current → after while purchases are pending), the legality badge, Confirm/Discard and Save. */
export function Header({ warband, rules, cost, delta, pendingCount, canConfirm, onConfirm, onDiscard, threshold, validation, code, dirty, busy, error, onSave, dispatch }: Props) {
  const faction = rules.factionsById.get(warband.factionId);
  const subfaction = findSubfaction(rules, warband);
  const variant = rosterVariants(rules, warband).find((v) => v.id === warband.variantId);
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
          {subfaction && ` · ${subfaction.name}`}
          {variant && ` · ${variant.name}`}
          {patron && ` · ${patron.name}`}
          {` · Game ${warband.gameNumber}`}
        </div>
      </div>

      <div className={styles.purse}>
        <div className={styles.coins}>
          <span className={cx(styles.coin, over && styles.coinOver)} title={over ? `Over the threshold by ${cost.ducats - threshold.value}` : "Ducats spent of the threshold"}>
            <DucatGlyph className={styles.coinGlyph} />
            <span className={styles.coinValue}>{cost.ducats}</span>
            <span className={styles.coinOf}>/ {threshold.value}</span>
          </span>
          <span className={cx(styles.coin, styles.coinGlory)} title="Glory spent of the pool">
            <GloryGlyph className={styles.coinGlyph} />
            <span className={styles.coinValue}>{cost.glory}</span>
            {pool !== undefined && <span className={styles.coinOf}>/ {pool}</span>}
          </span>
          <span className={`${styles.badge} ${errors ? styles.bad : styles.good}`} title={errors || warnings ? "The full list is on the Warband screen" : "Rulebook-legal"}>
            {errors === 0 ? "Legal" : `${errors} ${errors === 1 ? "error" : "errors"}`}
            {warnings > 0 && <span className={styles.warn}> · {warnings} {warnings === 1 ? "warning" : "warnings"}</span>}
          </span>
        </div>
        {staging && (
          <div className={styles.receipt} aria-label="Pending purchases">
            <span>
              Pending · {pendingCount} {pendingCount === 1 ? "line" : "lines"}
            </span>
            <span className={styles.receiptDots} aria-hidden="true" />
            <Price cost={{ ducats: delta.ducats, glory: delta.glory }} signed />
          </div>
        )}
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
