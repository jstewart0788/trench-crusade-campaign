import type { Money } from "../roster/purse.js";
import { cx } from "./cx.js";
import { DucatGlyph, GloryGlyph } from "./Glyphs.js";
import styles from "./Price.module.css";

/** An amount as the shop shows it: crown and ducats, sun and glory, or "Free". */
export function Price({ cost, className, signed = false }: { cost: Money; className?: string; signed?: boolean }) {
  const sign = (n: number) => (signed && n > 0 ? "+" : "");
  if (cost.ducats === 0 && cost.glory === 0) return <span className={cx(styles.price, styles.free, className)}>{signed ? "±0" : "Free"}</span>;
  return (
    <span className={cx(styles.price, className)}>
      {cost.ducats !== 0 && (
        <span className={styles.ducats}>
          <DucatGlyph className={styles.glyph} />
          <span className={styles.amount}>
            {sign(cost.ducats)}
            {cost.ducats}
          </span>
        </span>
      )}
      {cost.glory !== 0 && (
        <span className={styles.glory}>
          <GloryGlyph className={styles.glyph} />
          <span className={styles.amount}>
            {sign(cost.glory)}
            {cost.glory}
          </span>
        </span>
      )}
    </span>
  );
}
