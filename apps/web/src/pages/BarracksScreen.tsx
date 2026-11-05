import { MemberList } from "../components/MemberList.js";
import { RecruitList } from "../components/RecruitList.js";
import { nextMemberId } from "../roster/reducer.js";
import { defaultKit } from "../roster/select.js";
import { useWarband } from "./warbandContext.js";
import styles from "./BarracksScreen.module.css";

/** Recruiting is staged like purchases: a recruit or a dismissal waits for "Confirm purchases". Names are edited in place. */
export function BarracksScreen() {
  const { rules, warband, confirmed, pending, rows, base, ctx, cost, validation, dispatch, stage } = useWarband();
  const n = warband.members.length;
  const freshId = () => nextMemberId([...confirmed.members, ...pending.recruits]);

  return (
    <div className={styles.grid}>
      <section className={styles.column}>
        <h2>
          Roster · {n} {n === 1 ? "model" : "models"}
        </h2>
        <MemberList
          rows={rows}
          factionId={warband.factionId}
          rules={rules}
          cost={cost}
          validation={validation}
          base={base}
          onRename={(row, name) => (row.pending === "add" ? stage({ type: "rename-recruit", memberId: row.member.id, name }) : dispatch({ type: "rename-member", memberId: row.member.id, name }))}
          manage={{
            onDuplicate: (row) => {
              const copy = { id: freshId(), unitId: row.member.unitId, equipmentItemIds: [...row.member.equipmentItemIds], ...(row.member.upgradeIds?.length ? { upgradeIds: [...row.member.upgradeIds] } : {}) };
              stage({ type: "stage-recruit", member: copy });
            },
            onRemove: (row) => stage(row.pending === "add" ? { type: "unstage-recruit", memberId: row.member.id } : { type: "stage-dismiss", memberId: row.member.id }),
            onKeep: (row) => stage({ type: "unstage-dismiss", memberId: row.member.id }),
          }}
        />
      </section>
      <section className={styles.column}>
        <RecruitList
          warband={warband}
          rules={rules}
          ctx={ctx}
          onAdd={(unit) => stage({ type: "stage-recruit", member: { id: freshId(), unitId: unit.id, equipmentItemIds: defaultKit(unit, warband, rules, ctx) } })}
        />
      </section>
    </div>
  );
}
