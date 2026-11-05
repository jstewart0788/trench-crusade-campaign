import type { ExportMember } from "@tc/rules/browser";
import { describeAbility, describeItem } from "../roster/describe.js";
import { costLines, isCardKit, signedArmour, type MemberDetail } from "../roster/details.js";
import { cx } from "./cx.js";
import { ItemDescription } from "./ItemDescription.js";
import { LockGlyph } from "./LockGlyph.js";
import { Price } from "./Price.js";
import styles from "./MemberDetails.module.css";

interface Props {
  detail: MemberDetail | undefined;
  /** Why there is no detail: the export refused the roster. */
  error?: string;
  /** The TTS model map reached this browser; without it the model cannot be named. */
  modelsLoaded: boolean;
}

/** Everything about one model, read from its TTS export entry. */
export function MemberDetails({ detail, error, modelsLoaded }: Props) {
  if (!detail) return <p className="error">Details unavailable{error ? `: ${error}` : "."}</p>;
  const { member, issues } = detail;
  const { lines, total } = costLines(detail);
  return (
    <div className={styles.details}>
      <div className={styles.column}>
        <Profile member={member} />
        {member.abilities.length > 0 && (
          <section>
            <h3>Abilities</h3>
            <ul className={styles.list}>
              {member.abilities.map((a) => (
                <li key={a.name}>
                  <ItemDescription desc={describeAbility(a)} rulesShown />
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h3>Equipment</h3>
          {member.equipment.length === 0 ? (
            <p className="muted">None</p>
          ) : (
            <ul className={styles.list}>
              {member.equipment.map((e, i) => (
                <li key={`${e.id}-${i}`} className={styles.row} data-kit={isCardKit(e) ? "card" : e.builtIn ? "built-in" : "bought"}>
                  <ItemDescription desc={describeItem(e)} rulesShown />
                  {isCardKit(e) ? (
                    <span className={styles.tag}>on the unit card</span>
                  ) : e.builtIn ? (
                    <span className={cx(styles.tag, styles.builtIn)}>
                      <LockGlyph /> built in
                    </span>
                  ) : (
                    <Price cost={e.cost} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        {member.upgrades.length > 0 && (
          <section>
            <h3>Upgrades</h3>
            <ul className={styles.list}>
              {member.upgrades.map((u, i) => (
                <li key={`${u.name}-${i}`} className={styles.row}>
                  <ItemDescription desc={{ name: u.name, detail: "", rules: u.text }} rulesShown />
                  <Price cost={u.cost} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className={styles.column}>
        {(member.preGame?.length || member.removedForGame) && (
          <section>
            <h3>Before this game</h3>
            {member.removedForGame && <p className={styles.note}>Not deployed this game.</p>}
            {member.preGame?.map((p) => (
              <p key={p.name} className={styles.note}>
                <strong>{p.name}</strong> ({p.victim}): {p.effect}
              </p>
            ))}
          </section>
        )}
        {issues.length > 0 && (
          <section>
            <h3>Issues</h3>
            <ul className={styles.issues}>
              {issues.map((issue, i) => (
                <li key={i} className={issue.kind}>
                  {issue.message}
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h3>Cost</h3>
          <ul className={styles.ledger} aria-label="Cost breakdown">
            {lines.map((l, i) => (
              <li key={i} className={styles.line}>
                <span>{l.label}</span>
                <span className={styles.dots} aria-hidden="true" />
                {l.builtIn ? <span className={styles.quiet}>built in</span> : <Price cost={l.cost} />}
              </li>
            ))}
            <li className={cx(styles.line, styles.total)}>
              <span>Total</span>
              <span className={styles.dots} aria-hidden="true" />
              <Price cost={total} />
            </li>
          </ul>
        </section>
        <section>
          <h3>TTS model</h3>
          {!modelsLoaded ? (
            <p className="muted">The model map did not load; the mod still spawns this model.</p>
          ) : member.model ? (
            <p className={styles.model}>
              <span className={styles.nickname}>{member.model.nickname}</span>
              <span className={styles.source} data-source={member.model.source}>
                {member.model.source === "pick" ? "your pick for this loadout" : "default for this unit"}
              </span>
            </p>
          ) : (
            <p className="muted">No model mapped: the mod spawns a plain base to bind your own.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Profile({ member }: { member: ExportMember }) {
  const s = member.stats;
  const fromKit = s.armourBreakdown.reduce((n, b) => n + b.delta, 0);
  const stats: [string, string][] = [
    ["Mov", s.movement.raw],
    ["Rng", s.ranged],
    ["Mel", s.melee],
    ["Arm", signedArmour(s.armour)],
    ["Base", s.base],
  ];
  return (
    <section>
      <dl className={styles.stats}>
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {s.armourBreakdown.length > 0 && (
        <p className={styles.armour}>
          Armour {signedArmour(s.armour - fromKit)} profile, {s.armourBreakdown.map((b) => `${signedArmour(b.delta)} (${b.name})`).join(", ")}
        </p>
      )}
      {member.unit.keywords.length > 0 && (
        <p className={styles.keywords}>
          <span className={styles.label}>Keywords</span> {member.unit.keywords.join(", ")}
        </p>
      )}
    </section>
  );
}
