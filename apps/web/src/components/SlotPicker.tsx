import { useEffect, useRef } from "react";
import { hiddenText, priceText } from "../roster/select.js";
import { ZONE_LABELS, type KitEntry, type PickerListing, type PickerRow, type Zone } from "../roster/slots.js";
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
  /** `attach` picks are added alongside the slot's weapon; the rest replace it. */
  onPick: (row: PickerRow, attach: boolean) => void;
  onRemove: (entry: KitEntry) => void;
  onKeep: (entry: KitEntry) => void;
  onClose: () => void;
}

/** Side panel: what the clicked slot holds and what else it could hold. Escape or Close dismisses it. */
export function SlotPicker({ zone, slotLabel, hint, current, coveredBy, listing, onPick, onRemove, onKeep, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
        <button className="small" onClick={onClose} aria-label="Close picker">
          Close
        </button>
      </div>

      {current && (
        <div className={styles.current}>
          <span className={current.pending === "remove" ? styles.struck : ""}>
            {current.item.name}
            {current.pending === "add" && <span className={styles.chipAdd}>pending</span>}
            {current.pending === "remove" && <span className={styles.chipRemove}>removing</span>}
          </span>
          {current.pending === "remove" ? (
            <button className="small" onClick={() => onKeep(current)}>
              Keep
            </button>
          ) : (
            <button className="small danger" onClick={() => onRemove(current)}>
              {current.pending === "add" ? "Undo" : "Remove"}
            </button>
          )}
        </div>
      )}
      {coveredBy && !current && (
        <div className={styles.current}>
          <span className="muted">
            Taken by {coveredBy.item.name}
            {coveredBy.classified.bayonet ? " (fixed bayonet)" : " (both hands)"}
          </span>
          {coveredBy.pending === "remove" ? (
            <button className="small" onClick={() => onKeep(coveredBy)}>
              Keep
            </button>
          ) : (
            <button className="small danger" onClick={() => onRemove(coveredBy)}>
              {coveredBy.pending === "add" ? "Undo" : "Remove"}
            </button>
          )}
        </div>
      )}

      {listing.attachments.length > 0 && (
        <section>
          <h3>Attach</h3>
          <ul className={styles.list}>
            {listing.attachments.map((row) => (
              <li key={row.item.id}>
                <Row row={row} onClick={() => onPick(row, true)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <h3>{current ? "Swap for" : coveredBy ? `Replace with (${ZONE_LABELS[zone]})` : "Choose"}</h3>
      {listing.rows.length === 0 ? (
        <p className="muted">Nothing fits here with the rest of the kit as it is.</p>
      ) : (
        [...groups].map(([group, rows]) => (
          <section key={group}>
            {groups.size > 1 && <h3 className={styles.group}>{rows[0]!.access.group.replace(/-/g, " ")}</h3>}
            <ul className={styles.list}>
              {rows.map((row) => (
                <li key={row.item.id}>
                  <Row row={row} onClick={() => onPick(row, false)} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {listing.uncheckable > 0 && <p className="quiet">{hiddenText(listing.uncheckable)}</p>}
    </div>
  );
}

function Row({ row, onClick }: { row: PickerRow; onClick: () => void }) {
  return (
    <button className={styles.row} onClick={onClick}>
      <span className={styles.main}>
        <span className={styles.name} title={row.item.rules || undefined}>
          {row.item.name}
        </span>
        <span className={styles.detail}>{[row.item.range, row.item.hands ? `${row.item.hands}H` : null, ...row.item.keywords].filter(Boolean).join(" · ")}</span>
      </span>
      <span className={styles.price}>{row.access.fixed ? "built in" : priceText(row.cost)}</span>
      <span className={styles.counts}>
        {row.count > 0 && `${row.count}${row.max !== null ? `/${row.max}` : ""} on model`}
        {row.warbandMax !== null && ` ${row.warbandCount}/${row.warbandMax} in warband`}
      </span>
    </button>
  );
}
