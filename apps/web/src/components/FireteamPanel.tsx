import { findUnit, fireteamOffers, fireteamRules, isAnchor, type RulesData, type Warband } from "@tc/rules/browser";
import { useState, type Dispatch } from "react";
import type { RosterAction } from "../roster/reducer.js";
import { memberTitle } from "../roster/select.js";

interface Props {
  /** The confirmed roster: teams are formed on the roster sheet, not staged. */
  warband: Warband;
  rules: RulesData;
  dispatch: Dispatch<RosterAction>;
}

/**
 * Fireteams (Warbands p17): the teams on the roster and the ones the list's
 * rules allow now. Shown only when the list has a Fireteam rule it can use
 * (a team, or a model that can anchor one); nothing else is offered.
 */
export function FireteamPanel({ warband, rules, dispatch }: Props) {
  const offers = fireteamOffers(rules, warband);
  const teams = warband.fireteams ?? [];
  const relevant = fireteamRules(rules, warband).filter(
    ({ rule }) =>
      teams.some((t) => t.rule === rule.id) ||
      !rule.anchor ||
      warband.members.some((m) => {
        const u = findUnit(rules, warband, m.unitId);
        return u !== undefined && isAnchor(rule, m, u);
      }),
  );
  const [picked, setPicked] = useState<Record<string, [string, string]>>({});
  if (relevant.length === 0) return null;
  const title = (id: string) => {
    const m = warband.members.find((x) => x.id === id);
    return m ? memberTitle(m, findUnit(rules, warband, m.unitId), rules, warband) : id;
  };

  return (
    <section className="panel" aria-label="Fireteams">
      <h2>Fireteams</h2>
      {relevant.map(({ rule, max }) => {
        const mine = teams.filter((t) => t.rule === rule.id);
        const offer = offers.find((o) => o.rule.id === rule.id);
        const [a, b] = picked[rule.id] ?? ["", ""];
        const firsts = [...new Set(offer?.pairs.flatMap((p) => p) ?? [])];
        const seconds = a ? (offer?.pairs.filter((p) => p.includes(a)).map((p) => (p[0] === a ? p[1] : p[0])) ?? []) : [];
        return (
          <div key={rule.id}>
            <h3>
              {rule.name} <span className="muted">(p{rule.page}{max !== undefined ? `, up to ${max}` : ""})</span>
            </h3>
            <ul>
              {mine.map((t) => (
                <li key={t.memberIds.join("+")}>
                  {title(t.memberIds[0]!)} and {title(t.memberIds[1]!)}{" "}
                  <button type="button" onClick={() => dispatch({ type: "dissolve-fireteam", memberId: t.memberIds[0]! })}>
                    Dissolve
                  </button>
                </li>
              ))}
            </ul>
            {offer && (
              <div>
                <select aria-label={`${rule.name}: first model`} value={a} onChange={(e) => setPicked({ ...picked, [rule.id]: [e.target.value, ""] })}>
                  <option value="">First model</option>
                  {firsts.map((id) => (
                    <option key={id} value={id}>
                      {title(id)}
                    </option>
                  ))}
                </select>{" "}
                <select aria-label={`${rule.name}: second model`} value={b} disabled={!a} onChange={(e) => setPicked({ ...picked, [rule.id]: [a, e.target.value] })}>
                  <option value="">Second model</option>
                  {seconds.map((id) => (
                    <option key={id} value={id}>
                      {title(id)}
                    </option>
                  ))}
                </select>{" "}
                <button
                  type="button"
                  disabled={!a || !b}
                  onClick={() => {
                    dispatch({ type: "form-fireteam", rule: rule.id, memberIds: [a, b] });
                    setPicked({ ...picked, [rule.id]: ["", ""] });
                  }}
                >
                  Form Fireteam{rule.cost?.glory ? ` (+${rule.cost.glory} glory)` : ""}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
