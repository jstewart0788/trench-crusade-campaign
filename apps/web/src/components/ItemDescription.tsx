import type { Description } from "../roster/describe.js";
import { cx } from "./cx.js";
import styles from "./ItemDescription.module.css";

interface Props {
  desc: Description;
  /** Adds a "Rules" disclosure with the full text; leave off inside buttons, where only hover works. */
  expandable?: boolean;
  struck?: boolean;
}

/** The one rendering of a piece of kit, an upgrade or an ability: name (full rules on hover), detail line, optional expandable rules. */
export function ItemDescription({ desc, expandable = false, struck = false }: Props) {
  return (
    <span className={styles.desc}>
      <span className={cx(styles.name, struck && styles.struck)} title={desc.rules || undefined}>
        {desc.name}
      </span>
      {desc.detail && <span className={styles.detail}>{desc.detail}</span>}
      {expandable && desc.rules && (
        <details className={styles.rules}>
          <summary>Rules</summary>
          <p>{desc.rules}</p>
        </details>
      )}
    </span>
  );
}
