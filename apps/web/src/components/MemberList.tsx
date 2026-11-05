import { accessFor, findUnit, isEliteMember, upgradeFor, type MemberCost, type RosterScope, type RosterUnit, type RulesData, type ValidationResult, type WarbandCost } from "@tc/rules/browser";
import { useId, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { armouryHref } from "../pages/warbandContext.js";
import type { Offer, Purse } from "../roster/purse.js";
import { describeItem, describeUpgrade } from "../roster/describe.js";
import type { StagedMemberRow } from "../roster/staging.js";
import { memberTitle } from "../roster/select.js";
import { isBuiltIn, type MemberTraits } from "../roster/traits.js";
import { IconButton, IconLink } from "./IconButton.js";
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
  /** Warband screen: each row opens a detail panel, by its chevron or a click anywhere on the row outside its controls. */
  expand?: {
    isOpen: (memberId: string) => boolean;
    onToggle: (memberId: string) => void;
    details: (row: StagedMemberRow) => ReactNode;
  };
}

export function MemberList({ rows, roster, rules, cost, validation, base, onRename, manage, traitsFor, expand }: Props) {
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
          expand={expand}
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
  expand: Props["expand"];
}

// A click on the row toggles its details, except on the row's own controls,
// inside the open panel, or at the end of a text selection.
const clickTogglesRow = (e: MouseEvent) => {
  const target = e.target as Element;
  return !target.closest("a, button, input, select, textarea, label, [role='region']") && !window.getSelection()?.toString();
};

function MemberRow({ row, unit, cost, issues, rules, base, onRename, manage, traitsFor, expand }: RowProps) {
  const { member } = row;
  const leaving = row.pending === "remove";
  const title = memberTitle(member, unit);
  const detailsId = useId();
  const open = expand?.isOpen(member.id) ?? false;
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
    <li
      className={`${styles.row} ${row.pending === "add" ? styles.pendingAdd : ""} ${leaving ? styles.pendingRemove : ""} ${expand ? styles.expandable : ""}`}
      onClick={expand ? (e) => clickTogglesRow(e) && expand.onToggle(member.id) : undefined}
    >
      <div className={styles.title}>
        <span className={`${styles.unit} ${leaving ? styles.struck : ""}`}>{unit?.name ?? member.unitId}</span>
        {unit && isEliteMember(member, unit, rules) && <span className={styles.tag}>Elite</span>}
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
          <span className={styles.equip}>
            <IconLink to={armouryHref(base, member.id)} glyph="armoury" label="Equip" subject={title} tone="brass" />
          </span>
        )}
        {manage &&
          (leaving ? (
            <IconButton glyph="revert" label="Keep" subject={title} onClick={() => manage.onKeep(row)} />
          ) : (
            <>
              <PriceButton offer={manage.duplicateOffer(row)} purse={manage.purse} label={`Recruit another ${unit?.name ?? "model"} with this kit`} verb="Copy" onBuy={() => manage.onDuplicate(row)} />
              {row.pending === "add" ? (
                <IconButton glyph="revert" label="Undo" subject={`recruiting ${title}`} onClick={() => manage.onRemove(row)} />
              ) : (
                <IconButton glyph="dismiss" label="Dismiss" subject={title} tone="danger" onClick={() => manage.onRemove(row)} />
              )}
            </>
          ))}
        {expand && <IconButton glyph="chevron" label="Details" subject={`for ${title}`} expanded={open} controls={detailsId} onClick={() => expand.onToggle(member.id)} />}
      </div>
      {expand && (
        <div id={detailsId} className={styles.details} role="region" aria-label={`Details for ${title}`} hidden={!open}>
          {open && expand.details(row)}
        </div>
      )}
    </li>
  );
}
