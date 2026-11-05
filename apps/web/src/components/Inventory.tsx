import { upgradeFor, type RosterUnit } from "@tc/rules/browser";
import { priceText, type UpgradeListing } from "../roster/select.js";
import type { KitEntry } from "../roster/slots.js";
import type { StagedEntry } from "../roster/staging.js";
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
}

const chip = (pending?: "add" | "remove") =>
  pending === "add" ? <span className={styles.chipAdd}>pending</span> : pending === "remove" ? <span className={styles.chipRemove}>removing</span> : null;

/** Everything carried that has no slot, plus the model's upgrades. */
export function Inventory({ entries, onAdd, onRemove, onKeep, unit, upgrades, upgradeChoices, onAddUpgrade, onRemoveUpgrade, onKeepUpgrade }: Props) {
  // upgradeChoices is computed on the staged member, so a pending upgrade already counts as taken.
  const offer = upgradeChoices.rows.filter((r) => !r.atMax);
  return (
    <div className={`panel ${styles.panel}`}>
      <div className={styles.head}>
        <h2>Inventory</h2>
        <button className="small" onClick={onAdd}>
          Add to inventory
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="muted">Nothing in the pack.</p>
      ) : (
        <ul className={styles.list}>
          {entries.map((e) => (
            <li key={e.index}>
              <span className={e.pending === "remove" ? styles.struck : ""}>{e.item.name}</span>
              {chip(e.pending)}
              {e.pending === "remove" ? (
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
                    <span className={u.pending === "remove" ? styles.struck : ""} title={(upgrade?.rules ?? []).map((r) => `${r.name}: ${r.text}`).join("\n") || undefined}>
                      {upgrade?.name ?? u.id}
                    </span>
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
                <li key={row.upgrade.bsId}>
                  <button className={styles.offerRow} onClick={() => onAddUpgrade(row.upgrade.bsId)} title={(row.upgrade.rules ?? []).map((r) => `${r.name}: ${r.text}`).join("\n") || undefined}>
                    <span>{row.upgrade.name}</span>
                    <span className={styles.price}>{priceText(row.cost)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
