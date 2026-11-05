import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cx } from "./cx.js";
import styles from "./IconButton.module.css";

/** warband, barracks and armoury are the three screens: the tabs wear them, and every icon that goes to a screen uses its glyph. */
export type Glyph = "warband" | "barracks" | "armoury" | "dismiss" | "remove" | "revert" | "close" | "rules" | "copy" | "copied" | "shop" | "chevron";

interface Common {
  glyph: Glyph;
  /** The tooltip, and the start of the accessible name: "Remove". */
  label: string;
  /** What the action is on, appended to the accessible name: "Remove Bolt-Action Rifle". */
  subject?: string;
  /** danger: it takes something away (blood); brass: it goes somewhere to spend or equip. */
  tone?: "danger" | "brass";
}

const accessibleName = ({ label, subject }: Common) => (subject ? `${label} ${subject}` : label);

/**
 * A non-purchase action drawn as a glyph: ghost at rest, filled on hover and focus,
 * with its label as a tooltip on both. Price buttons are the purchases; these are everything else.
 */
export function IconButton({ onClick, expanded, controls, ...common }: Common & { onClick: () => void; expanded?: boolean; controls?: string }) {
  return (
    <button
      type="button"
      className={cx(styles.icon, common.tone && styles[common.tone])}
      data-glyph={common.glyph}
      aria-label={accessibleName(common)}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
    >
      <Inside {...common} />
    </button>
  );
}

export function IconLink({ to, ...common }: Common & { to: string }) {
  return (
    <Link to={to} className={cx(styles.icon, common.tone && styles[common.tone])} data-glyph={common.glyph} aria-label={accessibleName(common)}>
      <Inside {...common} />
    </Link>
  );
}

/** The control on a row of kit or upgrades: Remove it, or revert what is staged on it (Undo a pending add, Keep a pending removal). */
export function KitAction({ pending, name, onRemove, onKeep }: { pending?: "add" | "remove"; name: string; onRemove: () => void; onKeep: () => void }) {
  if (pending === "remove") return <IconButton glyph="revert" label="Keep" subject={name} onClick={onKeep} />;
  if (pending === "add") return <IconButton glyph="revert" label="Undo" subject={`adding ${name}`} onClick={onRemove} />;
  return <IconButton glyph="remove" label="Remove" subject={name} tone="danger" onClick={onRemove} />;
}

/** A glyph on its own, decorative: whatever carries it names the action. */
export function GlyphIcon({ glyph, className }: { glyph: Glyph; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" data-glyph-icon={glyph}>
      {GLYPHS[glyph]}
    </svg>
  );
}

function Inside({ glyph, label }: Common) {
  return (
    <>
      <GlyphIcon glyph={glyph} className={styles.glyph} />
      <span className={styles.tip} aria-hidden="true">
        {label}
      </span>
    </>
  );
}

const GLYPHS: Record<Glyph, ReactNode> = {
  warband: (
    <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M3.6 14.5V1.6" />
      <path d="M3.6 2.6h9.2l-2.4 3.1 2.4 3.1H3.6" />
      <path d="M2.2 14.5h2.8" />
    </g>
  ),
  armoury: (
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2.5 2.5 10.5 10.5M8.8 12.2l3.4-3.4M10.5 10.5l3 3" />
      <path d="M13.5 2.5 5.5 10.5M3.8 8.8l3.4 3.4M5.5 10.5l-3 3" />
    </g>
  ),
  dismiss: (
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2.5H3.5v11H7" />
      <path d="M6.5 8h7M10.8 5.3 13.5 8l-2.7 2.7" />
    </g>
  ),
  remove: (
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="5.6" />
      <path d="M5.3 8h5.4" />
    </g>
  ),
  revert: (
    <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6.5h5.8a3.4 3.4 0 0 1 0 6.8H6.5" />
      <path d="M6.6 3.8 3.9 6.5l2.7 2.7" />
    </g>
  ),
  close: <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
  rules: (
    <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
      <path d="M8 4.3C6.6 3.2 4.6 2.9 2 3.1v9.4c2.6-.2 4.6.1 6 1.2 1.4-1.1 3.4-1.4 6-1.2V3.1c-2.6-.2-4.6.1-6 1.2z" />
      <path d="M8 4.3v9.4" />
    </g>
  ),
  copy: (
    <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
      <path d="M10.5 5.5V3.7a1.2 1.2 0 0 0-1.2-1.2H3.7a1.2 1.2 0 0 0-1.2 1.2v5.6a1.2 1.2 0 0 0 1.2 1.2h1.8" />
    </g>
  ),
  copied: <path d="M3.2 8.6l3 3 6.6-7.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  barracks: (
    <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M8 3 1.8 13.3h12.4z" />
      <path d="M8 3V1.3l2.4.8L8 2.9" />
      <path d="M6.2 13.3 8 9.4l1.8 3.9" />
    </g>
  ),
  chevron: <path d="M3.8 6.2 8 10.4l4.2-4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  shop: (
    <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M2.8 6h10.4l-.9 7.5H3.7z" />
      <path d="M5.6 6V4.6a2.4 2.4 0 0 1 4.8 0V6" />
    </g>
  ),
};
