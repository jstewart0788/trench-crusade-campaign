import type { LimitContext, RosterUnit, RulesData, Warband, WarbandMember } from "@tc/rules/browser";
import { useMemo, type Dispatch } from "react";
import type { RosterAction } from "../roster/reducer.js";
import { armouryGroups, memberLabel, priceText, upgradeRows } from "../roster/select.js";
import styles from "./Armoury.module.css";

interface Props {
  warband: Warband;
  rules: RulesData;
  ctx: LimitContext;
  member: WarbandMember;
  unit: RosterUnit;
  dispatch: Dispatch<RosterAction>;
}

export function Armoury({ warband, rules, ctx, member, unit, dispatch }: Props) {
  const groups = useMemo(() => armouryGroups(member, unit, warband, rules, ctx), [member, unit, warband, rules, ctx]);
  const upgrades = useMemo(() => upgradeRows(member, unit, warband, rules, ctx), [member, unit, warband, rules, ctx]);
  const s = unit.stats;

  return (
    <div className={`panel ${styles.panel}`}>
      <h2>Equip {memberLabel(member, unit)}</h2>
      <p className={styles.stats}>
        Mov {s.movement.raw} · Rng {s.ranged} · Mel {s.melee} · Arm {s.armour} · {s.base}
        {unit.keywords.length > 0 && <span className="muted"> · {unit.keywords.join(", ")}</span>}
      </p>

      {groups.map((group) => (
        <section key={group.group}>
          <h3>{group.label}</h3>
          <ul className={styles.list}>
            {group.rows.map((row) => (
              <li key={row.item.id} className={`${styles.row} ${row.gate.disabled ? styles.disabled : ""}`}>
                <div className={styles.main}>
                  <span className={styles.name} title={row.item.rules || undefined}>
                    {row.item.name}
                  </span>
                  <span className={styles.detail}>
                    {[row.item.range, row.item.hands ? `${row.item.hands}H` : null, ...row.item.keywords].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <span className={styles.price}>{row.access.fixed ? "built in" : priceText(row.cost)}</span>
                <div className={styles.count}>
                  {row.count > 0 && (
                    <button className="small" aria-label={`Remove one ${row.item.name}`} onClick={() => dispatch({ type: "remove-item", memberId: member.id, itemId: row.item.id })}>
                      −
                    </button>
                  )}
                  {row.count > 0 && (
                    <span className={styles.n}>
                      {row.count}
                      {row.max !== null ? `/${row.max}` : ""}
                    </span>
                  )}
                  <button
                    className="small"
                    aria-label={`Add ${row.item.name}`}
                    disabled={row.atMax || row.gate.disabled}
                    onClick={() => dispatch({ type: "add-item", memberId: member.id, itemId: row.item.id })}
                  >
                    +
                  </button>
                </div>
                {(row.gate.notes.length > 0 || row.access.conditionNote || row.access.maxPerWarband != null) && (
                  <div className={styles.notes}>
                    {row.gate.notes.map((n) => (
                      <span key={n} className="warning">
                        {n}
                      </span>
                    ))}
                    {row.access.conditionNote && <span>{row.access.conditionNote}</span>}
                    {row.access.maxPerWarband != null && <span>max {row.access.maxPerWarband} per warband</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {upgrades.length > 0 && (
        <section>
          <h3>Upgrades</h3>
          <ul className={styles.list}>
            {upgrades.map((row) => (
              <li key={row.upgrade.bsId} className={`${styles.row} ${row.gate.disabled ? styles.disabled : ""}`}>
                <div className={styles.main}>
                  <span className={styles.name} title={(row.upgrade.rules ?? []).map((r) => `${r.name}: ${r.text}`).join("\n") || undefined}>
                    {row.upgrade.name}
                  </span>
                  <span className={styles.detail}>{(row.upgrade.rules ?? []).map((r) => r.name).join(" · ")}</span>
                </div>
                <span className={styles.price}>{priceText(row.cost)}</span>
                <div className={styles.count}>
                  {row.count > 0 && (
                    <button className="small" aria-label={`Remove ${row.upgrade.name}`} onClick={() => dispatch({ type: "remove-upgrade", memberId: member.id, upgradeId: row.upgrade.bsId })}>
                      −
                    </button>
                  )}
                  {row.count > 0 && (
                    <span className={styles.n}>
                      {row.count}/{row.max}
                    </span>
                  )}
                  <button
                    className="small"
                    aria-label={`Add ${row.upgrade.name}`}
                    disabled={row.atMax || row.gate.disabled}
                    onClick={() => dispatch({ type: "add-upgrade", memberId: member.id, upgradeId: row.upgrade.bsId })}
                  >
                    +
                  </button>
                </div>
                {(row.gate.notes.length > 0 || row.upgrade.conditionNote || row.upgrade.maxPerWarband != null) && (
                  <div className={styles.notes}>
                    {row.gate.notes.map((n) => (
                      <span key={n} className="warning">
                        {n}
                      </span>
                    ))}
                    {row.upgrade.conditionNote && <span>{row.upgrade.conditionNote}</span>}
                    {row.upgrade.maxPerWarband != null && <span>max {row.upgrade.maxPerWarband} per warband</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
