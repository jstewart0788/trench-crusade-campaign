import { useId } from "react";
import { describeItem } from "../roster/describe.js";
import type { FigureView, KitEntry, SlotView } from "../roster/slots.js";
import { isBuiltIn } from "../roster/traits.js";
import { IconButton, KitAction } from "./IconButton.js";
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
        <Silhouette />
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

// An original trench soldier on a round base: helmet, gas mask, greatcoat, puttees.
// Each kit zone has its own part, lit while its slot is hovered or open.
function Silhouette() {
  const id = useId().replace(/:/g, "");
  const body = `url(#${id}-body)`;
  return (
    <svg className={styles.silhouette} viewBox="0 0 200 440" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.2" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.05" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.35" r="0.6">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.14" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-lens`} x="-1" y="-1" width="3" height="3">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <ellipse cx="100" cy="190" rx="100" ry="190" fill={`url(#${id}-glow)`} />

      <g className={styles.base}>
        <ellipse cx="100" cy="425" rx="80" ry="12" />
        <ellipse cx="100" cy="420" rx="80" ry="12" />
      </g>

      <g className={styles.part} fill={body}>
        <path d="M66 344H96L94 404H68Z" />
        <path d="M104 344H134L132 404H106Z" />
        <path d="M62 402H98L100 420H54Q54 408 62 402Z" />
        <path d="M102 402H138Q146 408 146 420H100Z" />
      </g>
      <g className={styles.detail}>
        <path d="M67 356L95 350M67 368L95 362M67 380L95 374M68 392L94 386M105 356L133 350M105 368L133 362M105 380L133 374M106 392L132 386" />
      </g>

      <g className={`${styles.part} ${styles.zoneRanged}`} fill={body}>
        <path d="M34 166Q16 176 14 212L10 300Q12 312 24 312L30 306L34 222L44 196Z" />
        <circle cx="20" cy="318" r="10" />
      </g>
      <g className={`${styles.part} ${styles.zoneMelee}`} fill={body}>
        <path d="M166 166Q184 176 186 212L190 300Q188 312 176 312L170 306L166 222L156 196Z" />
        <circle cx="180" cy="318" r="10" />
      </g>

      <g className={`${styles.part} ${styles.zoneTorso}`} fill={body}>
        <path d="M64 148H136Q160 152 168 166L162 262Q160 300 168 344L112 348L100 312L88 348L32 344Q40 300 38 262L32 166Q40 152 64 148Z" />
      </g>
      <g className={styles.detail}>
        <path d="M100 152V312" />
        <path d="M44 160L58 154L160 252L144 256Z" />
        <circle cx="88" cy="182" r="2.2" />
        <circle cx="88" cy="204" r="2.2" />
        <circle cx="88" cy="226" r="2.2" />
        <circle cx="112" cy="182" r="2.2" />
        <circle cx="112" cy="204" r="2.2" />
        <circle cx="112" cy="226" r="2.2" />
      </g>

      <g className={`${styles.part} ${styles.zoneGrenade}`} fill={body}>
        <path d="M36 252H164L163 266H37Z" />
        <rect x="93" y="249" width="14" height="20" rx="2" />
        <rect x="120" y="266" width="20" height="18" rx="2" />
        <ellipse cx="56" cy="276" rx="7" ry="9" />
        <ellipse cx="72" cy="278" rx="7" ry="9" />
      </g>

      <g className={`${styles.part} ${styles.zoneHead}`} fill={body}>
        <path d="M74 132H126L136 150H64Z" />
        <path d="M70 84H130C132 106 124 122 112 130H88C76 122 68 106 70 84Z" />
        <path d="M90 128H110L114 152H86Z" />
        <path d="M58 70C58 36 78 18 100 18C122 18 142 36 142 70L152 80L146 86H54L48 80Z" />
      </g>
      <g className={styles.detail}>
        <path d="M54 86H146M89 136H111M88 144H112" />
        <path d="M112 142C130 150 134 170 122 182" />
        <circle cx="64" cy="64" r="2.5" />
      </g>
      <g className={styles.lens}>
        <circle cx="86" cy="102" r="9" filter={`url(#${id}-lens)`} />
        <circle cx="114" cy="102" r="9" filter={`url(#${id}-lens)`} />
        <circle cx="86" cy="102" r="7" />
        <circle cx="114" cy="102" r="7" />
      </g>

      <g className={`${styles.ghost} ${styles.zoneOffhand}`}>
        <circle cx="22" cy="268" r="26" />
        <circle cx="22" cy="268" r="6" />
      </g>
    </svg>
  );
}
