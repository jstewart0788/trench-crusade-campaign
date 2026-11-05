import { useEffect, useRef } from "react";
import { describeItem } from "../roster/describe.js";
import type { Money, Purse } from "../roster/purse.js";
import { hiddenText } from "../roster/select.js";
import { unfitLines, ZONE_LABELS, type KitEntry, type PickerListing, type PickerRow, type Zone } from "../roster/slots.js";
import { isBuiltIn } from "../roster/traits.js";
import { IconButton, KitAction } from "./IconButton.js";
import { ItemDescription } from "./ItemDescription.js";
import { LockGlyph } from "./LockGlyph.js";
import { PriceButton } from "./PriceButton.js";
import styles from "./SlotPicker.module.css";

interface Props {
  zone: Zone;
  slotLabel: string;
  hint: string;
  /** What the slot holds now, if anything; a pick replaces it. */
  current?: KitEntry;
  /** Hands covered by an item anchored in the sibling slot. */
  coveredBy?: KitEntry;
  listing: PickerListing;
  /** The staged roster's spend; every row's price button weighs against it. */
  purse: Purse;
  /** What swapping out the slot's current item gives back. */
  refund?: Money;
  /** The slot holds a replaceable built-in that may be swapped now (at recruitment): its replacements are listed. */
  replace?: { name: string; text: string; page: number };
  /** `attach` picks are added alongside the slot's weapon; the rest replace it. */
  onPick: (row: PickerRow, attach: boolean) => void;
  onRemove: (entry: KitEntry) => void;
  onKeep: (entry: KitEntry) => void;
  onClose: () => void;
}

/** Side panel: what the clicked slot holds and what else it could hold. Escape or Close dismisses it. */
export function SlotPicker({ zone, slotLabel, hint, current, coveredBy, listing, purse, refund, replace, onPick, onRemove, onKeep, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Built-in kit is never removed or swapped out; a pending restore of one is still undoable.
  const held = current ?? coveredBy;
  const locked = held !== undefined && isBuiltIn(held) && held.pending !== "add" && !replace;

  const groups = new Map<string, PickerRow[]>();
  for (const row of listing.rows) {
    const list = groups.get(row.access.group) ?? [];
    list.push(row);
    groups.set(row.access.group, list);
  }

  return (
    <div className={`panel ${styles.panel}`} ref={panel} tabIndex={-1} role="dialog" aria-label={`${slotLabel} picker`}>
      <div className={styles.head}>
        <div>
          <h2>{slotLabel}</h2>
          <p className="quiet">{hint}</p>
        </div>
        <IconButton glyph="close" label="Close" subject="picker" onClick={onClose} />
      </div>

      {held && (
        <div className={`${styles.current} ${locked ? styles.currentLocked : ""}`} data-locked={locked ? "true" : undefined}>
          <span className={styles.held}>
            {!current && <span className="muted">Taken by{held.classified.bayonet ? " a fixed bayonet" : " a weapon in both hands"}: </span>}
            <ItemDescription desc={describeItem(held.item, held.access)} expandable struck={held.pending === "remove"} />
            {held.pending === "add" && <span className={styles.chipAdd}>pending</span>}
            {held.pending === "remove" && <span className={styles.chipRemove}>removing</span>}
          </span>
          {held.pending !== "remove" && (locked || replace) ? (
            <span className={styles.builtIn}>
              <LockGlyph /> built in
            </span>
          ) : (
            <KitAction pending={held.pending} name={held.item.name} onKeep={() => onKeep(held)} onRemove={() => onRemove(held)} />
          )}
        </div>
      )}

      {listing.attachments.length > 0 && (
        <section>
          <h3>Attach</h3>
          <ul className={styles.list}>
            {listing.attachments.map((row) => (
              <li key={row.item.id}>
                <Row row={row} purse={purse} onBuy={() => onPick(row, true)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {locked ? (
        <p className={styles.lockedNote}>Built-in kit: always carried. It cannot be removed or swapped.</p>
      ) : replace ? (
        <>
          <p className={styles.lockedNote}>
            Built-in, but while recruiting it may be replaced (p{replace.page}). {replace.text}
          </p>
          <h3>Replace the {replace.name} with</h3>
        </>
      ) : (
        <h3>{current ? "Swap for" : coveredBy ? `Replace with (${ZONE_LABELS[zone]})` : "Choose"}</h3>
      )}
      {locked ? null : listing.rows.length === 0 ? (
        <p className="muted">Nothing fits here with the rest of the kit as it is.</p>
      ) : (
        [...groups].map(([group, rows]) => (
          <section key={group}>
            {groups.size > 1 && <h3 className={styles.group}>{rows[0]!.access.group.replace(/-/g, " ")}</h3>}
            <ul className={styles.list}>
              {rows.map((row) => (
                <li key={row.item.id}>
                  <Row row={row} purse={purse} refund={refund} onBuy={() => onPick(row, false)} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {unfitLines(listing.unfit).map((line) => (
        <p key={line} className="quiet">
          {line}
        </p>
      ))}
      {listing.uncheckable > 0 && <p className="quiet">{hiddenText(listing.uncheckable)}</p>}
    </div>
  );
}

function Row({ row, purse, refund, onBuy }: { row: PickerRow; purse: Purse; refund?: Money; onBuy: () => void }) {
  const counts = [
    row.count > 0 ? `${row.count}${row.max !== null ? `/${row.max}` : ""} on model` : null,
    row.warbandMax !== null ? `${row.warbandCount}/${row.warbandMax} in warband` : null,
  ].filter(Boolean);
  return (
    <div className={styles.row}>
      <span className={styles.main}>
        <ItemDescription desc={describeItem(row.item, row.access)} />
        {counts.length > 0 && <span className={styles.counts}>{counts.join(" · ")}</span>}
      </span>
      {row.access.fixed ? (
        <span className={styles.builtIn}>
          <LockGlyph /> built in
        </span>
      ) : (
        <PriceButton
          offer={{ cost: { ducats: row.cost.ducats, glory: row.cost.glory }, ...(refund ? { refund } : {}), ...(row.cap ? { cap: row.cap } : {}) }}
          purse={purse}
          label={`Buy ${row.item.name}`}
          onBuy={onBuy}
        />
      )}
    </div>
  );
}
