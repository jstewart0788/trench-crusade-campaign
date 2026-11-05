import type { LimitContext, RosterUnit, RulesData, Warband } from "@tc/rules/browser";
import { useMemo } from "react";
import { hiddenText, limitText, priceText, unitRows, type UnitRow } from "../roster/select.js";
import styles from "./RecruitList.module.css";

interface Props {
  warband: Warband;
  rules: RulesData;
  ctx: LimitContext;
  onAdd: (unit: RosterUnit) => void;
}

/** Units this roster can recruit. Anything a gate closes, or that depends on a campaign selection the data cannot count, is not listed. */
export function RecruitList({ warband, rules, ctx, onAdd }: Props) {
  const listing = useMemo(() => unitRows(warband, rules, ctx), [warband, rules, ctx]);
  const regulars = listing.rows.filter((r) => !r.unit.mercenary);
  const mercenaries = listing.rows.filter((r) => r.unit.mercenary);

  const section = (title: string, list: UnitRow[]) =>
    list.length > 0 && (
      <section>
        <h3>{title}</h3>
        <ul className={styles.list}>
          {list.map((row) => (
            <li key={row.unit.id} className={styles.row}>
              <div className={styles.main}>
                <span className={styles.name}>{row.unit.name}</span>
                {row.unit.elite && <span className={styles.tag}>Elite</span>}
                <span className={styles.price}>{priceText({ ducats: row.unit.cost.ducats ?? 0, glory: row.unit.cost.glory ?? 0 })}</span>
              </div>
              <span className={row.min !== null && row.count < row.min ? "warning" : "muted"}>
                {row.count} of {limitText(row.min, row.max)}
              </span>
              <button className="small" disabled={row.atMax} onClick={() => onAdd(row.unit)}>
                Add
              </button>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div className={`panel ${styles.panel}`}>
      <h2>Recruit</h2>
      {section("Units", regulars)}
      {section("Mercenaries", mercenaries)}
      {listing.uncheckable > 0 && <p className="quiet">{hiddenText(listing.uncheckable)}</p>}
    </div>
  );
}
