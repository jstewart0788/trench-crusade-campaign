import type { MemberCost, RosterUnit, WarbandMember } from "@tc/rules/browser";
import type { Dispatch } from "react";
import type { RosterAction } from "../roster/reducer.js";
import { priceText } from "../roster/select.js";
import styles from "./Loadout.module.css";

interface Props {
  member: WarbandMember;
  unit: RosterUnit;
  /** Model cost before and after pending purchases. */
  before: MemberCost | undefined;
  after: MemberCost | undefined;
  issues: number;
  dispatch: Dispatch<RosterAction>;
}

/** The selected member's name, stat line and running cost. */
export function Loadout({ member, unit, before, after, issues, dispatch }: Props) {
  const s = unit.stats;
  const changed = before && after && (before.ducats !== after.ducats || before.glory !== after.glory);
  return (
    <div className={`panel ${styles.panel}`}>
      <div className={styles.head}>
        <h2>{unit.name}</h2>
        {issues > 0 && (
          <span className={styles.issues}>
            {issues} {issues === 1 ? "issue" : "issues"}
          </span>
        )}
      </div>
      <input
        className={styles.nameInput}
        value={member.name ?? ""}
        placeholder="Custom name"
        aria-label={`Name for ${unit.name}`}
        onChange={(e) => dispatch({ type: "rename-member", memberId: member.id, name: e.target.value })}
        onBlur={(e) => dispatch({ type: "rename-member", memberId: member.id, name: e.target.value.trim() })}
      />
      <p className={styles.stats}>
        Mov {s.movement.raw} · Rng {s.ranged} · Mel {s.melee} · Arm {s.armour} · {s.base}
        {unit.keywords.length > 0 && <span className="muted"> · {unit.keywords.join(", ")}</span>}
      </p>
      <div className={styles.total}>
        <span className="muted">Model total</span>
        <span className="mono">
          {changed && before ? <span className={styles.was}>{priceText(before)} → </span> : null}
          {after ? priceText(after) : ""}
        </span>
      </div>
    </div>
  );
}
