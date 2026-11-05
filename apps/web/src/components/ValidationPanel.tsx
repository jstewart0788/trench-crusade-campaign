import { findUnit, unitDisplayName, type RulesData, type ValidationResult, type Warband } from "@tc/rules/browser";
import { Link } from "react-router-dom";
import { memberLabel } from "../roster/select.js";
import styles from "./ValidationPanel.module.css";

interface Props {
  warband: Warband;
  rules: RulesData;
  validation: ValidationResult;
  /** Where a member's name should take the reader, e.g. the Armoury filtered to that member. */
  linkTo: (memberId: string) => string;
}

export function ValidationPanel({ warband, rules, validation, linkTo }: Props) {
  if (validation.ok && validation.warnings.length === 0) {
    return <div className={`panel ${styles.ok}`}>Rulebook-legal: nothing to fix.</div>;
  }

  const subject = (memberId?: string, unitId?: string) => {
    const member = memberId ? warband.members.find((m) => m.id === memberId) : undefined;
    if (member) return memberLabel(member, findUnit(rules, warband, member.unitId), rules, warband);
    const unit = unitId ? rules.unitsById.get(unitId) : undefined;
    if (unit) return unitDisplayName(rules, warband, unit);
    if (unitId) return unitId;
    return undefined;
  };

  const row = (kind: "error" | "warning", memberId: string | undefined, unitId: string | undefined, message: string, key: string) => {
    const label = subject(memberId, unitId);
    return (
      <li key={key} className={kind}>
        {label &&
          (memberId ? (
            <Link className={styles.link} to={linkTo(memberId)}>
              {label}
            </Link>
          ) : (
            <span className={styles.subject}>{label}</span>
          ))}
        <span>{message}</span>
      </li>
    );
  };

  return (
    <div className={`panel ${styles.panel}`}>
      {validation.errors.length > 0 && (
        <ul className={styles.list}>{validation.errors.map((e, i) => row("error", e.memberId, e.unitId, e.message, `e${i}`))}</ul>
      )}
      {validation.warnings.length > 0 && (
        <ul className={styles.list}>{validation.warnings.map((w, i) => row("warning", w.memberId, w.unitId, w.message, `w${i}`))}</ul>
      )}
    </div>
  );
}
