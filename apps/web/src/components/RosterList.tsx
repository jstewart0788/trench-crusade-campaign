import { findUnit, upgradeFor, type MemberCost, type RosterUnit, type RulesData, type ValidationResult, type Warband, type WarbandCost, type WarbandMember } from "@tc/rules/browser";
import type { Dispatch } from "react";
import type { RosterAction } from "../roster/reducer.js";
import { priceText } from "../roster/select.js";
import styles from "./RosterList.module.css";

interface Props {
  warband: Warband;
  rules: RulesData;
  cost: WarbandCost;
  validation: ValidationResult;
  selectedId?: string;
  onSelect: (memberId: string) => void;
  dispatch: Dispatch<RosterAction>;
}

export function RosterList({ warband, rules, cost, validation, selectedId, onSelect, dispatch }: Props) {
  if (warband.members.length === 0) {
    return <div className={`panel ${styles.empty}`}>No models yet. Add units from the list on the right.</div>;
  }
  return (
    <div className={styles.list}>
      <h3>
        Roster · {warband.members.length} {warband.members.length === 1 ? "model" : "models"}
      </h3>
      {warband.members.map((member) => (
        <MemberCard
          key={member.id}
          member={member}
          unit={findUnit(rules, warband.factionId, member.unitId)}
          cost={cost.perMember.find((c) => c.memberId === member.id)}
          issues={validation.errors.filter((e) => e.memberId === member.id).length}
          selected={member.id === selectedId}
          rules={rules}
          onSelect={onSelect}
          dispatch={dispatch}
        />
      ))}
    </div>
  );
}

interface CardProps {
  member: WarbandMember;
  unit: RosterUnit | undefined;
  cost: MemberCost | undefined;
  issues: number;
  selected: boolean;
  rules: RulesData;
  onSelect: (memberId: string) => void;
  dispatch: Dispatch<RosterAction>;
}

function MemberCard({ member, unit, cost, issues, selected, rules, onSelect, dispatch }: CardProps) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <div
      className={`${styles.card} ${selected ? styles.selected : ""}`}
      onClick={() => onSelect(member.id)}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onSelect(member.id)}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
    >
      <div className={styles.top}>
        <div className={styles.title}>
          <span className={styles.unit}>{unit?.name ?? member.unitId}</span>
          {unit?.elite && <span className={styles.tag}>Elite</span>}
          {unit?.mercenary && <span className={styles.tag}>Mercenary</span>}
          {issues > 0 && (
            <span className={styles.issues}>
              {issues} {issues === 1 ? "issue" : "issues"}
            </span>
          )}
        </div>
        <span className={styles.cost}>{cost ? priceText(cost) : ""}</span>
      </div>
      <input
        className={styles.nameInput}
        value={member.name ?? ""}
        placeholder="Custom name"
        aria-label={`Name for ${unit?.name ?? member.unitId}`}
        onClick={stop}
        onChange={(e) => dispatch({ type: "rename-member", memberId: member.id, name: e.target.value })}
        onBlur={(e) => dispatch({ type: "rename-member", memberId: member.id, name: e.target.value.trim() })}
      />
      <div className={styles.chips}>
        {member.equipmentItemIds.map((itemId, i) => (
          <Chip
            key={`${itemId}-${i}`}
            label={rules.equipmentById.get(itemId)?.name ?? itemId}
            onRemove={() => dispatch({ type: "remove-item", memberId: member.id, itemId })}
          />
        ))}
        {(member.upgradeIds ?? []).map((id, i) => (
          <Chip
            key={`${id}-${i}`}
            label={(unit && upgradeFor(unit, id)?.name) ?? id}
            upgrade
            onRemove={() => dispatch({ type: "remove-upgrade", memberId: member.id, upgradeId: id })}
          />
        ))}
        {member.equipmentItemIds.length === 0 && !member.upgradeIds?.length && <span className="muted">No equipment</span>}
      </div>
      <div className={styles.actions}>
        <button
          className="small"
          onClick={(e) => {
            stop(e);
            dispatch({ type: "duplicate-member", memberId: member.id });
          }}
        >
          Duplicate
        </button>
        <button
          className="small danger"
          onClick={(e) => {
            stop(e);
            dispatch({ type: "remove-member", memberId: member.id });
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function Chip({ label, upgrade = false, onRemove }: { label: string; upgrade?: boolean; onRemove: () => void }) {
  return (
    <span className={`${styles.chip} ${upgrade ? styles.upgradeChip : ""}`}>
      {label}
      <button
        className={styles.chipRemove}
        aria-label={`Remove ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        ×
      </button>
    </span>
  );
}
