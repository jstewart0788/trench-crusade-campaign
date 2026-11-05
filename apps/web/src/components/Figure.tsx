import { describeItem } from "../roster/describe.js";
import type { FigureView, KitEntry, SlotView } from "../roster/slots.js";
import { isBuiltIn } from "../roster/traits.js";
import { ItemDescription } from "./ItemDescription.js";
import styles from "./Figure.module.css";

interface Props {
  figure: FigureView;
  /** The slot whose picker is open. */
  openSlot?: string;
  onSlot: (slot: SlotView) => void;
  onRemove: (entry: KitEntry) => void;
  onKeep: (entry: KitEntry) => void;
}

const pendingChip = (entry: KitEntry) =>
  entry.pending === "add" ? <span className={styles.chipAdd}>pending</span> : entry.pending === "remove" ? <span className={styles.chipRemove}>removing</span> : null;

/** The model as a figure: one button per slot, a silhouette behind. */
export function Figure({ figure, openSlot, onSlot, onRemove, onKeep }: Props) {
  return (
    <div className={styles.wrap}>
      <div className={styles.figure}>
        <Silhouette />
        {figure.slots.map((slot) => (
          <Slot key={slot.id} slot={slot} open={openSlot === slot.id} onClick={() => onSlot(slot)} />
        ))}
      </div>
      {figure.unplaced.length > 0 && (
        <div className={styles.aside}>
          <h3>No room</h3>
          <ul className={styles.list}>
            {figure.unplaced.map((e) => (
              <li key={e.index}>
                <ItemDescription desc={describeItem(e.item)} expandable />
                {pendingChip(e)}
                {isBuiltIn(e) && e.pending !== "add" ? (
                  <span className={styles.builtIn}>built in</span>
                ) : (
                  <button className="small danger" onClick={() => onRemove(e)}>
                    {e.pending === "add" ? "Undo" : "Remove"}
                  </button>
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
                <ItemDescription desc={describeItem(e.item)} expandable struck />
                {pendingChip(e)}
                <button className="small" onClick={() => onKeep(e)}>
                  Keep
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Slot({ slot, open, onClick }: { slot: SlotView; open: boolean; onClick: () => void }) {
  const o = slot.occupant;
  const state = o ? (o.entry.pending === "add" ? styles.pendingAdd : o.entry.pending === "remove" ? styles.pendingRemove : styles.filled) : slot.coveredBy ? styles.covered : styles.empty;
  return (
    <button className={`${styles.slot} ${state} ${open ? styles.open : ""}`} style={{ gridArea: slot.id }} onClick={onClick} title={slot.hint} aria-pressed={open}>
      <span className={styles.label}>{slot.label}</span>
      {o ? (
        <>
          <span className={styles.item}>
            <ItemDescription desc={describeItem(o.entry.item)} struck={o.entry.pending === "remove"} />
          </span>
          {(o.spans || o.oneHandedByStrength || isBuiltIn(o.entry)) && (
            <span className={styles.note}>
              {[o.spans && "both hands", o.oneHandedByStrength && "one hand (Strong)", isBuiltIn(o.entry) && "built in"].filter(Boolean).join(" · ")}
            </span>
          )}
          {pendingChip(o.entry)}
          {o.attachments.map((a) => (
            <span key={a.index} className={styles.attachment}>
              <ItemDescription desc={describeItem(a.item)} struck={a.pending === "remove"} />
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

function Silhouette() {
  return (
    <svg className={styles.silhouette} viewBox="0 0 300 440" aria-hidden="true" focusable="false">
      <g fill="currentColor" fillOpacity="0.07" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2" strokeLinejoin="round">
        <circle cx="150" cy="52" r="30" />
        <path d="M138 84 h24 v14 h-24 z" />
        <path d="M110 100 h80 l14 20 v120 l-18 10 h-72 l-18 -10 v-120 z" />
        <path d="M92 118 l-34 22 l-18 96 l22 6 l22 -78 l8 -4 z" />
        <path d="M208 118 l34 22 l18 96 l-22 6 l-22 -78 l-8 -4 z" />
        <path d="M60 242 l-16 24 l10 14 l20 -16 l-4 -22 z" />
        <path d="M240 242 l16 24 l-10 14 l-20 -16 l4 -22 z" />
        <path d="M114 252 h30 l6 110 l-2 60 h-30 l-4 -60 z" />
        <path d="M156 252 h30 l0 110 l-4 60 h-30 l-2 -60 z" />
      </g>
    </svg>
  );
}
