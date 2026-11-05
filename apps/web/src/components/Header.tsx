import { patronsForFaction, type RulesData, type ValidationResult, type Warband, type WarbandCost, type WarbandThreshold } from "@tc/rules/browser";
import type { Dispatch } from "react";
import type { RosterAction } from "../roster/reducer.js";
import styles from "./Header.module.css";

interface Props {
  warband: Warband;
  rules: RulesData;
  cost: WarbandCost;
  threshold: WarbandThreshold;
  validation: ValidationResult;
  dispatch: Dispatch<RosterAction>;
}

export function Header({ warband, rules, cost, threshold, validation, dispatch }: Props) {
  const faction = rules.factionsById.get(warband.factionId);
  const variants = faction?.variants ?? [];
  const variant = variants.find((v) => v.id === warband.variantId);
  const patrons = patronsForFaction(rules, warband.factionId);
  const gloryAvailable = warband.glory ?? (warband.gameNumber === 1 ? (variant?.startingGlory ?? 0) : undefined);
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
        <div className={styles.faction}>{faction?.name ?? warband.factionId}</div>
      </div>

      <div className={styles.controls}>
        <label>
          Variant
          <select value={warband.variantId ?? ""} onChange={(e) => dispatch({ type: "set-variant", variantId: e.target.value || undefined })} disabled={variants.length === 0}>
            <option value="">{variants.length === 0 ? "No variants" : "None"}</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Patron
          <select value={warband.patronId ?? ""} onChange={(e) => dispatch({ type: "set-patron", patronId: e.target.value || undefined })}>
            <option value="">None</option>
            {patrons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Game
          <input
            type="number"
            min={1}
            step={1}
            className={styles.short}
            value={warband.gameNumber}
            onChange={(e) => dispatch({ type: "set-game-number", gameNumber: Number(e.target.value) })}
          />
        </label>
        <label title="Glory Points the warband has to spend. Leave blank for a starting warband.">
          Glory pool
          <input
            type="number"
            min={0}
            step={1}
            className={styles.short}
            value={warband.glory ?? ""}
            placeholder={gloryAvailable !== undefined ? String(gloryAvailable) : "?"}
            onChange={(e) => dispatch({ type: "set-glory", glory: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </label>
      </div>

      <div className={styles.totals}>
        <div className={styles.total}>
          <span className={`${styles.big} ${over ? "error" : ""}`}>{cost.ducats}</span>
          <span className="muted"> / {threshold.value} ducats</span>
          {threshold.clamped && <span className="warning"> (table ends at game {threshold.row.game})</span>}
        </div>
        <div className={styles.total}>
          <span className={styles.big}>{cost.glory}</span>
          <span className="muted"> glory{gloryAvailable !== undefined ? ` of ${gloryAvailable}` : ""}</span>
        </div>
        <div className={`${styles.status} ${errors ? styles.bad : styles.good}`}>
          {errors === 0 ? "Legal" : `${errors} ${errors === 1 ? "error" : "errors"}`}
          {warnings > 0 && <span className={styles.warn}> · {warnings} {warnings === 1 ? "warning" : "warnings"}</span>}
        </div>
      </div>
    </header>
  );
}
