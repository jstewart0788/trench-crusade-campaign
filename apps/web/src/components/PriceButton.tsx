import { useEffect, useRef, useState } from "react";
import { purchase, type Offer, type Purse } from "../roster/purse.js";
import { cx } from "./cx.js";
import { DucatGlyph, GloryGlyph } from "./Glyphs.js";
import { Price } from "./Price.js";
import styles from "./PriceButton.module.css";

interface Props {
  offer: Offer;
  purse: Purse;
  /** What is being bought, for screen readers: "Recruit Yeoman". */
  label: string;
  onBuy: () => void;
  /** A word before the price on actions that are not plain buys ("Copy"). */
  verb?: string;
}

/**
 * The price is the action. Pressing it buys (stages) the thing; hovering or
 * focusing shows the purse after the purchase, or why it cannot be bought.
 * A blocked price stays visible and readable but does nothing.
 */
export function PriceButton({ offer, purse, label, onBuy, verb }: Props) {
  const p = purchase(purse, offer);
  const blocked = p.state !== "buy";
  const [bought, setBought] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const buy = () => {
    if (blocked) return;
    onBuy();
    setBought(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setBought(false), 650);
  };

  const showGlory = offer.cost.glory !== 0 || purse.glory !== 0;
  return (
    <button
      type="button"
      className={cx(styles.button, blocked && styles.blocked, bought && styles.bought)}
      data-state={p.state}
      aria-disabled={blocked ? "true" : undefined}
      aria-label={`${label}${blocked && p.reason ? `: ${p.reason}` : ""}`}
      onClick={buy}
    >
      {verb && <span className={styles.verb}>{verb}</span>}
      <Price cost={offer.cost} />
      <span className={styles.hint} role="tooltip">
        {blocked ? (
          p.reason
        ) : (
          <>
            →
            <span className={styles.hintPart}>
              <DucatGlyph className={styles.hintGlyph} />
              {p.after.ducats}/{purse.threshold}
            </span>
            {showGlory && (
              <span className={cx(styles.hintPart, styles.hintGlory)}>
                <GloryGlyph className={styles.hintGlyph} />
                {p.after.glory}
                {purse.gloryPool !== undefined ? `/${purse.gloryPool}` : ""}
              </span>
            )}
          </>
        )}
      </span>
    </button>
  );
}
