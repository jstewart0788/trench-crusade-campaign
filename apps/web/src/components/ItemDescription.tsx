import { useId, useState } from "react";
import type { Description } from "../roster/describe.js";
import { cx } from "./cx.js";
import { IconButton } from "./IconButton.js";
import styles from "./ItemDescription.module.css";

interface Props {
  desc: Description;
  /** Adds a Rules toggle with the full text; leave off inside buttons, where only hover works. */
  expandable?: boolean;
  /** Prints the full rules under the name, with no toggle (a detail view that shows everything). */
  rulesShown?: boolean;
  struck?: boolean;
}

/** The one rendering of a piece of kit, an upgrade or an ability: name (full rules on hover), detail line, optional expandable rules. */
export function ItemDescription({ desc, expandable = false, rulesShown = false, struck = false }: Props) {
  const [open, setOpen] = useState(false);
  const rulesId = useId();
  const toggle = expandable && !rulesShown && !!desc.rules;
  return (
    <span className={styles.desc}>
      <span className={styles.nameLine}>
        <span className={cx(styles.name, struck && styles.struck)} title={(!rulesShown && desc.rules) || undefined}>
          {desc.name}
        </span>
        {toggle && <IconButton glyph="rules" label="Rules" subject={`for ${desc.name}`} expanded={open} controls={rulesId} onClick={() => setOpen((o) => !o)} />}
      </span>
      {desc.detail && <span className={styles.detail}>{desc.detail}</span>}
      {toggle && (
        <p id={rulesId} className={styles.rules} hidden={!open}>
          {desc.rules}
        </p>
      )}
      {rulesShown && desc.rules && <p className={styles.rules}>{desc.rules}</p>}
    </span>
  );
}
