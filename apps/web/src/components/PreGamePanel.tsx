import { findUnit, preGameChoices, type RulesData, type Warband } from "@tc/rules/browser";
import type { Dispatch } from "react";
import type { RosterAction } from "../roster/reducer.js";
import { memberTitle } from "../roster/select.js";
import styles from "./PreGamePanel.module.css";

interface Props {
  /** The confirmed roster: a choice may only name a model already on it. */
  warband: Warband;
  rules: RulesData;
  dispatch: Dispatch<RosterAction>;
}

/** Choices made before each game (Broken on the Wheel). Not purchases: stored at once, never staged. Renders nothing when no unit gives one. */
export function PreGamePanel({ warband, rules, dispatch }: Props) {
  const choices = preGameChoices(warband, rules);
  if (choices.length === 0) return null;
  return (
    <section className={`panel ${styles.panel}`} aria-label="Before the game">
      <h2>Before the game</h2>
      {choices.map((c) => {
        const victim = c.candidates.find((m) => m.id === c.chosen);
        const title = (id: string) => {
          const m = warband.members.find((x) => x.id === id)!;
          return memberTitle(m, findUnit(rules, warband, m.unitId), rules, warband);
        };
        return (
          <div key={c.rule.key} className={styles.choice}>
            <div className={styles.head}>
              <span className={styles.name}>{c.rule.name}</span>
              <span className="quiet">p{c.rule.page}</span>
            </div>
            {!c.available ? (
              <p className={styles.unavailable}>
                Not allowed: {c.rule.unavailable?.text ?? "its condition does not hold for this warband"}
                {c.rule.unavailable && ` (p${c.rule.unavailable.page})`}.
              </p>
            ) : c.candidates.length === 0 ? (
              <p className="muted">No {c.rule.victims.unitNames.join(" or ")} on the roster to choose.</p>
            ) : (
              <label className={styles.pick}>
                Victim
                <select value={victim?.id ?? ""} onChange={(e) => dispatch({ type: "set-pre-game", key: c.rule.key, memberId: e.target.value || null })}>
                  <option value="">No one</option>
                  {c.candidates.map((m) => (
                    <option key={m.id} value={m.id}>
                      {title(m.id)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {victim && (
              <p className={styles.effect}>
                {title(victim.id)} is not deployed this game. Until its first Out of Action the Shrine has {c.rule.summary.replace(/^Arm 0/, "Armour 0")}.
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
