import { accessFor, findUnit, upgradeFor, type MemberCost, type RosterScope, type RosterUnit, type RulesData, type ValidationResult, type WarbandCost } from "@tc/rules/browser";
import { Link } from "react-router-dom";
import { armouryHref } from "../pages/warbandContext.js";
import type { Offer, Purse } from "../roster/purse.js";
import { describeItem, describeUpgrade } from "../roster/describe.js";
import type { StagedMemberRow } from "../roster/staging.js";
import { isBuiltIn, type MemberTraits } from "../roster/traits.js";
import { Price } from "./Price.js";
import { PriceButton } from "./PriceButton.js";
import { TraitsLine } from "./SkillsPanel.js";
import styles from "./MemberList.module.css";

interface Props {
  rows: StagedMemberRow[];
  roster: RosterScope;
  rules: RulesData;
  cost: WarbandCost;
  validation: ValidationResult;
  base: string;
  /** Names are never staged: a confirmed member's name goes to the roster, a recruit's to the pending recruit. */
  onRename: (row: StagedMemberRow, name: string) => void;
  /** When given, each row shows what the model always has on one line, and its kit line lists only purchases. */
  traitsFor?: (row: StagedMemberRow, unit: RosterUnit) => MemberTraits;
  /** Barracks mode: duplicate, dismiss or undo. */
  manage?: {
    purse: Purse;
    /** What another one of this model, kit and all, would cost, and whether the roster has room. */
    duplicateOffer: (row: StagedMemberRow) => Offer;
    onDuplicate: (row: StagedMemberRow) => void;
    onRemove: (row: StagedMemberRow) => void;
    onKeep: (row: StagedMemberRow) => void;
  };
}

export function MemberList({ rows, roster, rules, cost, validation, base, onRename, manage, traitsFor }: Props) {
  if (rows.length === 0) {
    return (
      <div className={`panel ${styles.empty}`}>
        No models yet. {manage ? "Recruit from the list on the right." : <Link to={`${base}/barracks`}>Recruit in the Barracks</Link>}
      </div>
    );
  }
  return (
    <ul className={styles.list}>
      {rows.map((row) => (
        <MemberRow
          key={row.member.id}
          row={row}
          unit={findUnit(rules, roster, row.member.unitId)}
          cost={cost.perMember.find((c) => c.memberId === row.member.id)}
          issues={validation.errors.filter((e) => e.memberId === row.member.id).length}
          rules={rules}
          base={base}
          onRename={onRename}
          manage={manage}
          traitsFor={traitsFor}
        />
      ))}
    </ul>
  );
}

interface RowProps {
  row: StagedMemberRow;
  unit: RosterUnit | undefined;
  cost: MemberCost | undefined;
  issues: number;
  rules: RulesData;
  base: string;
  onRename: Props["onRename"];
  manage: Props["manage"];
  traitsFor: Props["traitsFor"];
}

function MemberRow({ row, unit, cost, issues, rules, base, onRename, manage, traitsFor }: RowProps) {
  const { member } = row;
  const leaving = row.pending === "remove";
  const traits = unit && traitsFor ? traitsFor(row, unit) : undefined;
  const locked = new Set(traits?.skills.flatMap((t) => (t.upgrade ? [t.upgrade.id] : [])) ?? []);
  const kit = [
    ...member.equipmentItemIds
      .filter((id) => !(traits && unit && isBuiltIn({ access: accessFor(unit, id) })))
      .map((id) => {
        const item = rules.equipmentById.get(id);
        return { key: id, name: item?.name ?? id, rules: item ? describeItem(item).rules : "" };
      }),
    ...(member.upgradeIds ?? [])
      .filter((id) => !locked.has(id))
      .map((id) => {
        const upgrade = unit && upgradeFor(unit, id);
        return { key: id, name: upgrade ? upgrade.name : id, rules: upgrade ? describeUpgrade(upgrade).rules : "" };
      }),
  ];
  return (
    <li className={`${styles.row} ${row.pending === "add" ? styles.pendingAdd : ""} ${leaving ? styles.pendingRemove : ""}`}>
      <div className={styles.title}>
        <span className={`${styles.unit} ${leaving ? styles.struck : ""}`}>{unit?.name ?? member.unitId}</span>
        {unit?.elite && <span className={styles.tag}>Elite</span>}
        {unit?.mercenary && <span className={styles.tag}>Mercenary</span>}
        {row.pending === "add" && <span className={styles.pending}>pending</span>}
        {leaving && <span className={styles.leaving}>leaving</span>}
        {!leaving && issues > 0 && (
          <span className={styles.issues}>
            {issues} {issues === 1 ? "issue" : "issues"}
          </span>
        )}
        {row.changes > 0 && (
          <span className={styles.pending}>
            {row.changes} {row.changes === 1 ? "change" : "changes"}
          </span>
        )}
      </div>
      <input
        className={styles.nameInput}
        value={member.name ?? ""}
        placeholder="Custom name"
        aria-label={`Name for ${unit?.name ?? member.unitId}`}
        onChange={(e) => onRename(row, e.target.value)}
        onBlur={(e) => onRename(row, e.target.value.trim())}
      />
      <span className={`${styles.kit} ${leaving ? styles.struck : ""}`}>
        {kit.length ? (
          kit.map((k, i) => (
            <span key={`${k.key}-${i}`}>
              {i > 0 && ", "}
              <span title={k.rules || undefined}>{k.name}</span>
            </span>
          ))
        ) : (
          <span className="muted">No equipment</span>
        )}
      </span>
      {traits && (
        <span className={styles.traits}>
          <TraitsLine traits={traits} />
        </span>
      )}
      <span className={styles.cost}>{cost ? <Price cost={cost} /> : null}</span>
      <div className={styles.actions}>
        {!leaving && (
          <Link to={armouryHref(base, member.id)} className={styles.equip}>
            Equip
          </Link>
        )}
        {manage &&
          (leaving ? (
            <button className="small" onClick={() => manage.onKeep(row)}>
              Keep
            </button>
          ) : (
            <>
              <PriceButton offer={manage.duplicateOffer(row)} purse={manage.purse} label={`Recruit another ${unit?.name ?? "model"} with this kit`} verb="Copy" onBuy={() => manage.onDuplicate(row)} />
              <button className="small danger" onClick={() => manage.onRemove(row)}>
                {row.pending === "add" ? "Undo" : "Dismiss"}
              </button>
            </>
          ))}
      </div>
    </li>
  );
}
