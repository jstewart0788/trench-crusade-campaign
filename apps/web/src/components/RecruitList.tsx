import { effectiveStats, type LimitContext, type RosterUnit, type RulesData, type Warband } from "@tc/rules/browser";
import { useMemo } from "react";
import type { Purse } from "../roster/purse.js";
import { countChip, hiddenText, unitRows, type UnitRow } from "../roster/select.js";
import { cx } from "./cx.js";
import { PriceButton } from "./PriceButton.js";
import styles from "./RecruitList.module.css";

interface Props {
  warband: Warband;
  rules: RulesData;
  ctx: LimitContext;
  purse: Purse;
  onAdd: (unit: RosterUnit) => void;
}

const statLine = (s: RosterUnit["stats"]) => `Mov ${s.movement.raw} · Rng ${s.ranged} · Mel ${s.melee} · Arm ${s.armour}`;

/** Units this roster can recruit, each priced: the price is the button. Anything a gate closes, or that depends on a campaign selection the data cannot count, is not listed. */
export function RecruitList({ warband, rules, ctx, purse, onAdd }: Props) {
  const listing = useMemo(() => unitRows(warband, rules, ctx), [warband, rules, ctx]);
  const regulars = listing.rows.filter((r) => !r.unit.mercenary);
  const mercenaries = listing.rows.filter((r) => r.unit.mercenary);

  const section = (title: string, list: UnitRow[]) =>
    list.length > 0 && (
      <section>
        <h3 className={styles.heading}>{title}</h3>
        <ul className={styles.list}>
          {list.map((row) => {
            const chip = countChip(row.count, row.min, row.max);
            const short = row.min !== null && row.count < row.min;
            return (
              <li key={row.unit.id} className={styles.row}>
                <div className={styles.main}>
                  <span className={styles.titleLine}>
                    <span className={styles.name}>{row.unit.name}</span>
                    {row.unit.elite && <span className={styles.tag}>Elite</span>}
                  </span>
                  <span className={styles.sub}>
                    <span>{statLine(effectiveStats(row.unit, warband, rules, ctx))}</span>
                    {chip && <span className={cx(styles.chip, short && styles.chipShort)}>{short ? `${chip} · required` : chip}</span>}
                  </span>
                </div>
                <PriceButton
                  offer={{ cost: { ducats: row.cost.ducats, glory: row.cost.glory }, cap: row.max !== null ? { count: row.count, max: row.max } : undefined }}
                  purse={purse}
                  label={`Recruit ${row.unit.name}`}
                  onBuy={() => onAdd(row.unit)}
                />
              </li>
            );
          })}
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
