import { upgradeFor, type MemberCost, type RosterUnit, type RulesData, type WarbandMember } from "@tc/rules/browser";
import type { Dispatch } from "react";
import type { RosterAction } from "../roster/reducer.js";
import { priceText } from "../roster/select.js";
import styles from "./Loadout.module.css";

interface Props {
  member: WarbandMember;
  unit: RosterUnit;
  rules: RulesData;
  cost: MemberCost | undefined;
  issues: number;
  dispatch: Dispatch<RosterAction>;
}

/** The selected member's current kit, with removal. */
export function Loadout({ member, unit, rules, cost, issues, dispatch }: Props) {
  const s = unit.stats;
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
      <h3>Carrying</h3>
      <div className={styles.chips}>
        {member.equipmentItemIds.map((itemId, i) => (
          <Chip key={`${itemId}-${i}`} label={rules.equipmentById.get(itemId)?.name ?? itemId} onRemove={() => dispatch({ type: "remove-item", memberId: member.id, itemId })} />
        ))}
        {(member.upgradeIds ?? []).map((id, i) => (
          <Chip key={`${id}-${i}`} label={upgradeFor(unit, id)?.name ?? id} upgrade onRemove={() => dispatch({ type: "remove-upgrade", memberId: member.id, upgradeId: id })} />
        ))}
        {member.equipmentItemIds.length === 0 && !member.upgradeIds?.length && <span className="muted">Nothing yet</span>}
      </div>
      <div className={styles.total}>
        <span className="muted">Model total</span>
        <span className="mono">{cost ? priceText(cost) : ""}</span>
      </div>
    </div>
  );
}

function Chip({ label, upgrade = false, onRemove }: { label: string; upgrade?: boolean; onRemove: () => void }) {
  return (
    <span className={`${styles.chip} ${upgrade ? styles.upgradeChip : ""}`}>
      {label}
      <button className={styles.chipRemove} aria-label={`Remove ${label}`} onClick={onRemove}>
        ×
      </button>
    </span>
  );
}
