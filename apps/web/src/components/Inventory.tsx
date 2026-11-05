import { upgradeFor, type RosterUnit } from "@tc/rules/browser";
import { describeItem, describeUpgrade } from "../roster/describe.js";
import type { Purse } from "../roster/purse.js";
import { type UpgradeListing } from "../roster/select.js";
import type { KitEntry } from "../roster/slots.js";
import type { StagedEntry } from "../roster/staging.js";
import { isBuiltIn, isPermanentLocked } from "../roster/traits.js";
import { LockGlyph } from "./LockGlyph.js";
import { ItemDescription } from "./ItemDescription.js";
import { PriceButton } from "./PriceButton.js";
import styles from "./Inventory.module.css";

interface Props {
  entries: KitEntry[];
  onAdd: () => void;
  onRemove: (entry: KitEntry) => void;
  onKeep: (entry: KitEntry) => void;
  unit: RosterUnit;
  upgrades: StagedEntry[];
  upgradeChoices: UpgradeListing;
  onAddUpgrade: (upgradeId: string) => void;
  onRemoveUpgrade: (entry: StagedEntry) => void;
  onKeepUpgrade: (entry: StagedEntry) => void;
  /** Mandatory upgrades: listed under Skills & abilities, not here. */
  lockedUpgrades?: ReadonlySet<string>;
  purse: Purse;
}

const chip = (pending?: "add" | "remove") =>
  pending === "add" ? <span className={styles.chipAdd}>pending</span> : pending === "remove" ? <span className={styles.chipRemove}>removing</span> : null;

/** What was bought for the model and has no slot, plus its purchasable upgrades. Built-in kit and mandatory upgrades are not purchases; they live under Skills & abilities. */
export function Inventory({ entries: all, onAdd, onRemove, onKeep, unit, upgrades: allUpgrades, upgradeChoices, onAddUpgrade, onRemoveUpgrade, onKeepUpgrade, lockedUpgrades, purse }: Props) {
  const entries = all.filter((e) => !isBuiltIn(e));
  const upgrades = allUpgrades.filter((u) => !lockedUpgrades?.has(u.id));
  // upgradeChoices is computed on the staged member, so a pending upgrade already counts as taken.
  const offer = upgradeChoices.rows.filter((r) => !r.atMax);
  return (
    <div className={`panel ${styles.panel}`}>
      <div className={styles.head}>
        <h2>Inventory</h2>
        <button className="small" onClick={onAdd}>
          Shop for kit
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="muted">Nothing in the pack.</p>
      ) : (
        <ul className={styles.list}>
          {entries.map((e) => (
            <li key={e.index} className={isPermanentLocked(e) ? styles.locked : undefined} data-locked={isPermanentLocked(e) ? "true" : undefined}>
              <ItemDescription desc={describeItem(e.item, e.access)} expandable struck={e.pending === "remove"} />
              {chip(e.pending)}
              {isPermanentLocked(e) && e.pending !== "remove" ? (
                <span className={styles.permanent} title="Once equipped it cannot be removed or lost">
                  <LockGlyph /> permanent
                </span>
              ) : e.pending === "remove" ? (
                <button className="small" onClick={() => onKeep(e)}>
                  Keep
                </button>
              ) : (
                <button className="small danger" onClick={() => onRemove(e)}>
                  {e.pending === "add" ? "Undo" : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {(upgrades.length > 0 || offer.length > 0) && (
        <>
          <h3>Upgrades</h3>
          {upgrades.length > 0 && (
            <ul className={styles.list}>
              {upgrades.map((u, i) => {
                const upgrade = upgradeFor(unit, u.id);
                return (
                  <li key={`${u.id}-${i}`}>
                    {upgrade ? <ItemDescription desc={describeUpgrade(upgrade)} expandable struck={u.pending === "remove"} /> : <span>{u.id}</span>}
                    {chip(u.pending)}
                    {u.pending === "remove" ? (
                      <button className="small" onClick={() => onKeepUpgrade(u)}>
                        Keep
                      </button>
                    ) : (
                      <button className="small danger" onClick={() => onRemoveUpgrade(u)}>
                        {u.pending === "add" ? "Undo" : "Remove"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {offer.length > 0 && (
            <ul className={styles.offer}>
              {offer.map((row) => (
                <li key={row.upgrade.bsId} className={styles.offerRow}>
                  <ItemDescription desc={describeUpgrade(row.upgrade)} expandable />
                  <PriceButton
                    offer={{ cost: { ducats: row.cost.ducats, glory: row.cost.glory }, ...(row.cap ? { cap: row.cap } : {}) }}
                    purse={purse}
                    label={`Buy ${row.upgrade.name}`}
                    onBuy={() => onAddUpgrade(row.upgrade.bsId)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
