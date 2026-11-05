import { findUnit, upgradeFor, type MemberCost, type RosterUnit, type RulesData, type ValidationResult, type Warband, type WarbandCost, type WarbandMember } from "@tc/rules/browser";
import type { Dispatch } from "react";
import { Link } from "react-router-dom";
import { armouryHref } from "../pages/warbandContext.js";
import type { RosterAction } from "../roster/reducer.js";
import { priceText } from "../roster/select.js";
import { type Pending } from "../roster/staging.js";
import styles from "./MemberList.module.css";

interface Props {
  warband: Warband;
  rules: RulesData;
  cost: WarbandCost;
  validation: ValidationResult;
  base: string;
  dispatch: Dispatch<RosterAction>;
  /** Barracks mode: duplicate and remove. The custom name is editable either way. */
  manage?: boolean;
  pending?: Pending;
}

export function MemberList({ warband, rules, cost, validation, base, dispatch, manage = false, pending = {} }: Props) {
  if (warband.members.length === 0) {
    return (
      <div className={`panel ${styles.empty}`}>
        No models yet. {manage ? "Recruit from the list on the right." : <Link to={`${base}/barracks`}>Recruit in the Barracks</Link>}
      </div>
    );
  }
  return (
    <ul className={styles.list}>
      {warband.members.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          unit={findUnit(rules, warband.factionId, member.unitId)}
          cost={cost.perMember.find((c) => c.memberId === member.id)}
          issues={validation.errors.filter((e) => e.memberId === member.id).length}
          pendingCount={(() => {
            const pm = pending[member.id];
            return pm ? pm.adds.length + pm.removes.length + pm.upgradeAdds.length + pm.upgradeRemoves.length : 0;
          })()}
          rules={rules}
          base={base}
          dispatch={dispatch}
          manage={manage}
        />
      ))}
    </ul>
  );
}

interface RowProps {
  member: WarbandMember;
  unit: RosterUnit | undefined;
  cost: MemberCost | undefined;
  issues: number;
  pendingCount: number;
  rules: RulesData;
  base: string;
  dispatch: Dispatch<RosterAction>;
  manage: boolean;
}

function MemberRow({ member, unit, cost, issues, pendingCount, rules, base, dispatch, manage }: RowProps) {
  const kit = [
    ...member.equipmentItemIds.map((id) => rules.equipmentById.get(id)?.name ?? id),
    ...(member.upgradeIds ?? []).map((id) => (unit && upgradeFor(unit, id)?.name) ?? id),
  ];
  return (
    <li className={styles.row}>
      <div className={styles.title}>
        <span className={styles.unit}>{unit?.name ?? member.unitId}</span>
        {unit?.elite && <span className={styles.tag}>Elite</span>}
        {unit?.mercenary && <span className={styles.tag}>Mercenary</span>}
        {issues > 0 && (
          <span className={styles.issues}>
            {issues} {issues === 1 ? "issue" : "issues"}
          </span>
        )}
        {pendingCount > 0 && <span className={styles.pending}>{pendingCount} pending</span>}
      </div>
      <input
        className={styles.nameInput}
        value={member.name ?? ""}
        placeholder="Custom name"
        aria-label={`Name for ${unit?.name ?? member.unitId}`}
        onChange={(e) => dispatch({ type: "rename-member", memberId: member.id, name: e.target.value })}
        onBlur={(e) => dispatch({ type: "rename-member", memberId: member.id, name: e.target.value.trim() })}
      />
      <span className={styles.kit}>{kit.length ? kit.join(", ") : <span className="muted">No equipment</span>}</span>
      <span className={styles.cost}>{cost ? priceText(cost) : ""}</span>
      <div className={styles.actions}>
        <Link to={armouryHref(base, member.id)} className={styles.equip}>
          Equip
        </Link>
        {manage && (
          <>
            <button className="small" onClick={() => dispatch({ type: "duplicate-member", memberId: member.id })}>
              Duplicate
            </button>
            <button className="small danger" onClick={() => dispatch({ type: "remove-member", memberId: member.id })}>
              Remove
            </button>
          </>
        )}
      </div>
    </li>
  );
}
