import type { LimitContext, RosterUnit, RulesData, Warband, WarbandMember } from "@tc/rules/browser";
import { useMemo, type Dispatch } from "react";
import type { RosterAction } from "../roster/reducer.js";
import { armouryGroups, hiddenText, priceText, upgradeRows } from "../roster/select.js";
import styles from "./Armoury.module.css";

interface Props {
  warband: Warband;
  rules: RulesData;
  ctx: LimitContext;
  member: WarbandMember;
  unit: RosterUnit;
  dispatch: Dispatch<RosterAction>;
}

/** What the selected member can buy. Rows a gate closes for this roster or this model, or that depend on a campaign selection the data cannot count, are not listed. */
export function Armoury({ warband, rules, ctx, member, unit, dispatch }: Props) {
  const listing = useMemo(() => armouryGroups(member, unit, warband, rules, ctx), [member, unit, warband, rules, ctx]);
  const upgrades = useMemo(() => upgradeRows(member, unit, warband, rules, ctx), [member, unit, warband, rules, ctx]);
  const hidden = listing.uncheckable + upgrades.uncheckable;

  const counter = (count: number, max: number | null, onAdd: () => void, onRemove: () => void, atMax: boolean, label: string) => (
    <div className={styles.count}>
      {count > 0 && (
        <button className="small" aria-label={`Remove one ${label}`} onClick={onRemove}>
          −
        </button>
      )}
      {count > 0 && (
        <span className={styles.n}>
          {count}
          {max !== null ? `/${max}` : ""}
        </span>
      )}
      <button className="small" aria-label={`Add ${label}`} disabled={atMax} onClick={onAdd}>
        +
      </button>
    </div>
  );

  return (
    <div className={`panel ${styles.panel}`}>
      <h2>Armoury</h2>
      {listing.groups.map((group) => (
        <section key={group.group}>
          <h3>{group.label}</h3>
          <ul className={styles.list}>
            {group.rows.map((row) => (
              <li key={row.item.id} className={styles.row}>
                <div className={styles.main}>
                  <span className={styles.name} title={row.item.rules || undefined}>
                    {row.item.name}
                  </span>
                  <span className={styles.detail}>
                    {[
                      row.item.range,
                      row.item.hands ? `${row.item.hands}H` : null,
                      ...row.item.keywords,
                      row.access.maxPerWarband != null ? `max ${row.access.maxPerWarband} per warband` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <span className={styles.price}>{row.access.fixed ? "built in" : priceText(row.cost)}</span>
                {counter(
                  row.count,
                  row.max,
                  () => dispatch({ type: "add-item", memberId: member.id, itemId: row.item.id }),
                  () => dispatch({ type: "remove-item", memberId: member.id, itemId: row.item.id }),
                  row.atMax,
                  row.item.name,
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {upgrades.rows.length > 0 && (
        <section>
          <h3>Upgrades</h3>
          <ul className={styles.list}>
            {upgrades.rows.map((row) => (
              <li key={row.upgrade.bsId} className={styles.row}>
                <div className={styles.main}>
                  <span className={styles.name} title={(row.upgrade.rules ?? []).map((r) => `${r.name}: ${r.text}`).join("\n") || undefined}>
                    {row.upgrade.name}
                  </span>
                  <span className={styles.detail}>
                    {[...(row.upgrade.rules ?? []).map((r) => r.name), row.upgrade.maxPerWarband != null ? `max ${row.upgrade.maxPerWarband} per warband` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <span className={styles.price}>{priceText(row.cost)}</span>
                {counter(
                  row.count,
                  row.max,
                  () => dispatch({ type: "add-upgrade", memberId: member.id, upgradeId: row.upgrade.bsId }),
                  () => dispatch({ type: "remove-upgrade", memberId: member.id, upgradeId: row.upgrade.bsId }),
                  row.atMax,
                  row.upgrade.name,
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {hidden > 0 && <p className="quiet">{hiddenText(hidden)}</p>}
    </div>
  );
}
