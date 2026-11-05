import { MemberList } from "../components/MemberList.js";
import { RecruitList } from "../components/RecruitList.js";
import { defaultKit } from "../roster/select.js";
import { useWarband } from "./warbandContext.js";
import styles from "./BarracksScreen.module.css";

export function BarracksScreen() {
  const { rules, warband, base, ctx, cost, validation, dispatch, pending } = useWarband();
  const n = warband.members.length;
  return (
    <div className={styles.grid}>
      <section className={styles.column}>
        <h2>
          Roster · {n} {n === 1 ? "model" : "models"}
        </h2>
        <MemberList warband={warband} rules={rules} cost={cost} validation={validation} base={base} dispatch={dispatch} manage pending={pending} />
      </section>
      <section className={styles.column}>
        <RecruitList
          warband={warband}
          rules={rules}
          ctx={ctx}
          onAdd={(unit) => dispatch({ type: "add-member", unitId: unit.id, equipmentItemIds: defaultKit(unit, warband, rules, ctx) })}
        />
      </section>
    </div>
  );
}
