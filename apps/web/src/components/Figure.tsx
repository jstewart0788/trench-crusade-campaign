import { describeItem } from "../roster/describe.js";
import { poseOf } from "../roster/pose.js";
import type { FigureView, KitEntry, SlotView } from "../roster/slots.js";
import { isBuiltIn } from "../roster/traits.js";
import { IconButton, KitAction } from "./IconButton.js";
import { FigureArt } from "./FigureArt.js";
import { ItemDescription } from "./ItemDescription.js";
import { LockGlyph } from "./LockGlyph.js";
import styles from "./Figure.module.css";

interface Props {
  figure: FigureView;
  /** The slot whose picker is open. */
  openSlot?: string;
  onSlot: (slot: SlotView) => void;
  onRemove: (entry: KitEntry) => void;
  onKeep: (entry: KitEntry) => void;
  /** Built-in kit that may still be swapped (a pending recruit's replaceable default). */
  replaceableNow?: (entry: KitEntry) => boolean;
}

const pendingChip = (entry: KitEntry) =>
  entry.pending === "add" ? <span className={styles.chipAdd}>pending</span> : entry.pending === "remove" ? <span className={styles.chipRemove}>removing</span> : null;

/** The model as a paper doll: the figure in the middle, its slots either side. */
export function Figure({ figure, openSlot, onSlot, onRemove, onKeep, replaceableNow }: Props) {
  return (
    <div className={styles.wrap}>
      <div className={styles.figure}>
        <FigureArt pose={poseOf(figure)} />
        {figure.slots.map((slot) => (
          <Slot key={slot.id} slot={slot} open={openSlot === slot.id} onClick={() => onSlot(slot)} replaceable={!!slot.occupant && !!replaceableNow?.(slot.occupant.entry)} />
        ))}
      </div>
      {figure.unplaced.length > 0 && (
        <div className={styles.aside}>
          <h3>No room</h3>
          <ul className={styles.list}>
            {figure.unplaced.map((e) => (
              <li key={e.index}>
                <ItemDescription desc={describeItem(e.item, e.access)} expandable />
                {pendingChip(e)}
                {isBuiltIn(e) && e.pending !== "add" ? (
                  <span className={styles.builtIn}>built in</span>
                ) : (
                  <KitAction pending={e.pending} name={e.item.name} onKeep={() => onKeep(e)} onRemove={() => onRemove(e)} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {figure.leaving.length > 0 && (
        <div className={styles.aside}>
          <h3>Leaving</h3>
          <ul className={styles.list}>
            {figure.leaving.map((e) => (
              <li key={e.index}>
                <ItemDescription desc={describeItem(e.item, e.access)} expandable struck />
                {pendingChip(e)}
                <IconButton glyph="revert" label="Keep" subject={e.item.name} onClick={() => onKeep(e)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Slot({ slot, open, onClick, replaceable }: { slot: SlotView; open: boolean; onClick: () => void; replaceable: boolean }) {
  const o = slot.occupant;
  const held = o?.entry ?? slot.coveredBy;
  // Built-in kit is shown in its slot, locked: clicking opens the picker read-only.
  const locked = held !== undefined && isBuiltIn(held) && held.pending === undefined;
  const state = o
    ? o.entry.pending === "add"
      ? styles.pendingAdd
      : o.entry.pending === "remove"
        ? styles.pendingRemove
        : locked
          ? styles.locked
          : styles.filled
    : slot.coveredBy
      ? `${styles.covered} ${locked ? styles.locked : ""}`
      : styles.empty;
  return (
    <button
      className={`${styles.slot} ${state} ${open ? styles.open : ""}`}
      style={{ gridArea: slot.id }}
      onClick={onClick}
      title={locked ? "Built-in kit: always carried" : slot.hint}
      aria-pressed={open}
      data-locked={locked ? "true" : undefined}
      data-zone={slot.zone}
    >
      <span className={styles.label}>
        {slot.label}
        {locked && <LockGlyph className={styles.lock} />}
      </span>
      {o ? (
        <>
          <span className={styles.item}>
            <ItemDescription desc={describeItem(o.entry.item, o.entry.access)} struck={o.entry.pending === "remove"} />
          </span>
          {(o.spans || o.oneHandedByStrength || isBuiltIn(o.entry)) && (
            <span className={styles.note}>
              {[o.spans && "both hands", o.oneHandedByStrength && "one hand (Strong)", isBuiltIn(o.entry) && (replaceable ? "built in · swap while recruiting" : "built in")].filter(Boolean).join(" · ")}
            </span>
          )}
          {pendingChip(o.entry)}
          {o.attachments.map((a) => (
            <span key={a.index} className={styles.attachment}>
              <ItemDescription desc={describeItem(a.item, a.access)} struck={a.pending === "remove"} />
              {pendingChip(a)}
            </span>
          ))}
        </>
      ) : slot.coveredBy ? (
        <span className={styles.coveredBy} title={describeItem(slot.coveredBy.item).rules || undefined}>
          {slot.coveredBy.classified.bayonet ? `${slot.coveredBy.item.name} (fixed)` : slot.coveredBy.item.name}
        </span>
      ) : (
        <span className={styles.hint}>empty</span>
      )}
    </button>
  );
}
