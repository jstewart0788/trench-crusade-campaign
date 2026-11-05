import { findUnit } from "@tc/rules/browser";
import { Link, useSearchParams } from "react-router-dom";
import { Armoury } from "../components/Armoury.js";
import { Loadout } from "../components/Loadout.js";
import { memberTitle } from "../roster/select.js";
import { useWarband } from "./warbandContext.js";
import styles from "./ArmouryScreen.module.css";

export function ArmouryScreen() {
  const { rules, warband, base, ctx, cost, validation, dispatch } = useWarband();
  const [params, setParams] = useSearchParams();
  const wanted = params.get("member");
  const member = warband.members.find((m) => m.id === wanted) ?? warband.members[0];

  if (!member) {
    return (
      <p className="panel muted">
        No models yet. <Link to={`${base}/barracks`}>Recruit some in the Barracks</Link> first.
      </p>
    );
  }
  const unit = findUnit(rules, warband.factionId, member.unitId);

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <label>
          Equipping
          <select value={member.id} onChange={(e) => setParams({ member: e.target.value }, { replace: true })}>
            {warband.members.map((m) => (
              <option key={m.id} value={m.id}>
                {memberTitle(m, findUnit(rules, warband.factionId, m.unitId))}
              </option>
            ))}
          </select>
        </label>
        <Link to={`${base}/barracks`}>Barracks</Link>
      </div>
      {unit ? (
        <div className={styles.grid}>
          <Loadout
            member={member}
            unit={unit}
            rules={rules}
            cost={cost.perMember.find((c) => c.memberId === member.id)}
            issues={validation.errors.filter((e) => e.memberId === member.id).length}
            dispatch={dispatch}
          />
          <Armoury warband={warband} rules={rules} ctx={ctx} member={member} unit={unit} dispatch={dispatch} />
        </div>
      ) : (
        <p className="panel error">
          {member.unitId} is not a unit this data knows; remove it in the Barracks.
        </p>
      )}
    </div>
  );
}
