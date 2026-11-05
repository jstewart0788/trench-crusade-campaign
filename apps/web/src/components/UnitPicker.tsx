import type { LimitContext, RosterUnit, RulesData, Warband } from "@tc/rules/browser";
import { useMemo } from "react";
import { limitText, priceText, unitRows, type UnitRow } from "../roster/select.js";
import styles from "./UnitPicker.module.css";

interface Props {
  warband: Warband;
  rules: RulesData;
  ctx: LimitContext;
  onAdd: (unit: RosterUnit) => void;
}

export function UnitPicker({ warband, rules, ctx, onAdd }: Props) {
  const rows = useMemo(() => unitRows(warband, rules, ctx), [warband, rules, ctx]);
  const regulars = rows.filter((r) => !r.unit.mercenary);
  const mercenaries = rows.filter((r) => r.unit.mercenary);

  const section = (title: string, list: UnitRow[]) =>
    list.length > 0 && (
      <section>
        <h3>{title}</h3>
        <ul className={styles.list}>
          {list.map((row) => (
            <li key={row.unit.id} className={`${styles.row} ${row.gate.disabled ? styles.disabled : ""}`}>
              <div className={styles.main}>
                <span className={styles.name}>{row.unit.name}</span>
                {row.unit.elite && <span className={styles.tag}>Elite</span>}
                <span className={styles.price}>{priceText({ ducats: row.unit.cost.ducats ?? 0, glory: row.unit.cost.glory ?? 0 })}</span>
              </div>
              <div className={styles.meta}>
                <span className={row.min !== null && row.count < row.min ? "warning" : "muted"}>
                  {row.count} of {limitText(row.min, row.max)}
                </span>
                {row.gate.notes.map((n) => (
                  <span key={n} className={styles.note}>
                    {n}
                  </span>
                ))}
              </div>
              <button className="small" disabled={row.atMax || row.gate.disabled} onClick={() => onAdd(row.unit)}>
                Add
              </button>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div className={`panel ${styles.panel}`}>
      <h2>Add units</h2>
      {section("Units", regulars)}
      {section("Mercenaries", mercenaries)}
    </div>
  );
}
