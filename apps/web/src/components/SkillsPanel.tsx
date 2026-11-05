import type { MemberTraits, Trait } from "../roster/traits.js";
import { cx } from "./cx.js";
import { IconButton } from "./IconButton.js";
import { ItemDescription } from "./ItemDescription.js";
import { LockGlyph } from "./LockGlyph.js";
import styles from "./SkillsPanel.module.css";

interface Props {
  traits: MemberTraits;
  /** Undo a pending restore of built-in kit or a mandatory upgrade (re-adding one the model was missing). */
  onUndo?: (trait: Trait) => void;
  /** Lift a pending removal of built-in kit or a mandatory upgrade. */
  onKeep?: (trait: Trait) => void;
}

/** Read-only: what the model always has. Nothing here can be removed. */
export function SkillsPanel({ traits, onUndo, onKeep }: Props) {
  const empty = !traits.abilities.length && !traits.builtIn.length && !traits.skills.length;
  return (
    <section className={cx("panel", styles.panel)} aria-label="Skills and abilities">
      <h2>Skills &amp; abilities</h2>
      {empty && <p className="muted">Nothing beyond its kit.</p>}
      <Group title="Abilities" traits={traits.abilities} />
      <Group title="Built-in kit" traits={traits.builtIn} onUndo={onUndo} onKeep={onKeep} locked />
      <Group title="Skills & upgrades" traits={traits.skills} onUndo={onUndo} onKeep={onKeep} />
    </section>
  );
}

function Group({ title, traits, onUndo, onKeep, locked = false }: { title: string; traits: Trait[]; onUndo?: Props["onUndo"]; onKeep?: Props["onKeep"]; locked?: boolean }) {
  if (traits.length === 0) return null;
  return (
    <div>
      <h3>{title}</h3>
      <ul className={styles.list}>
        {traits.map((t) => (
          <li key={t.key} className={cx(styles.item, locked && !t.pending && styles.locked)} data-locked={locked && !t.pending ? "true" : undefined}>
            <ItemDescription desc={t.desc} expandable struck={t.pending === "remove"} />
            <span className={styles.meta}>
              {locked && !t.pending && <LockGlyph className={styles.lock} />}
              {t.where && <span className={styles.where}>{t.where}</span>}
              {t.pending === "add" && <span className={styles.chipAdd}>pending</span>}
              {t.pending === "remove" && <span className={styles.chipRemove}>removing</span>}
              {t.pending === "add" && onUndo && <IconButton glyph="revert" label="Undo" subject={`adding ${t.desc.name}`} onClick={() => onUndo(t)} />}
              {t.pending === "remove" && onKeep && <IconButton glyph="revert" label="Keep" subject={t.desc.name} onClick={() => onKeep(t)} />}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One compact line for a roster row: names only, rules on hover. */
export function TraitsLine({ traits }: { traits: MemberTraits }) {
  const parts: [string, Trait[]][] = [
    ["Abilities", traits.abilities],
    ["Built in", traits.builtIn.filter((t) => t.pending !== "remove")],
    ["Skills", traits.skills.filter((t) => t.pending !== "remove")],
  ];
  const shown = parts.filter(([, list]) => list.length > 0);
  if (shown.length === 0) return null;
  return (
    <span className={styles.line}>
      {shown.map(([label, list], i) => (
        <span key={label}>
          {i > 0 && " · "}
          <span className={styles.lineLabel}>{label}:</span>{" "}
          {list.map((t, j) => (
            <span key={t.key}>
              {j > 0 && ", "}
              <span className={styles.lineName} title={t.desc.rules || undefined}>
                {t.desc.name}
              </span>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}
