import { findUnit, type RulesData, type ValidationResult, type Warband } from "@tc/rules/browser";
import { memberLabel } from "../roster/select.js";
import styles from "./ValidationPanel.module.css";

interface Props {
  warband: Warband;
  rules: RulesData;
  validation: ValidationResult;
  onSelect: (memberId: string) => void;
}

export function ValidationPanel({ warband, rules, validation, onSelect }: Props) {
  if (validation.ok && validation.warnings.length === 0) {
    return <div className={`panel ${styles.ok}`}>Rulebook-legal: nothing to fix.</div>;
  }

  const subject = (memberId?: string, unitId?: string) => {
    const member = memberId ? warband.members.find((m) => m.id === memberId) : undefined;
    if (member) return memberLabel(member, findUnit(rules, warband.factionId, member.unitId));
    if (unitId) return rules.unitsById.get(unitId)?.name ?? unitId;
    return undefined;
  };

  const row = (kind: "error" | "warning", memberId: string | undefined, unitId: string | undefined, message: string, key: string) => {
    const label = subject(memberId, unitId);
    return (
      <li key={key} className={kind}>
        {label &&
          (memberId ? (
            <button className={styles.link} onClick={() => onSelect(memberId)}>
              {label}
            </button>
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
