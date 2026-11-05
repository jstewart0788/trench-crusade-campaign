import { findUnit, unitLimits } from "@tc/rules/browser";
import { MemberList } from "../components/MemberList.js";
import { RecruitList } from "../components/RecruitList.js";
import { nextMemberId } from "../roster/reducer.js";
import { defaultKit } from "../roster/select.js";
import { defaultUpgrades } from "../roster/traits.js";
import { useWarband } from "./warbandContext.js";
import styles from "./BarracksScreen.module.css";

/** Recruiting is staged like purchases: a recruit or a dismissal waits for "Confirm purchases". Names are edited in place. */
export function BarracksScreen() {
  const { rules, warband, confirmed, pending, rows, base, ctx, cost, validation, dispatch, stage, purse } = useWarband();
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
          roster={warband}
          rules={rules}
          cost={cost}
          validation={validation}
          base={base}
          onRename={(row, name) => (row.pending === "add" ? stage({ type: "rename-recruit", memberId: row.member.id, name }) : dispatch({ type: "rename-member", memberId: row.member.id, name }))}
          manage={{
            purse,
            duplicateOffer: (row) => {
              const unit = findUnit(rules, warband, row.member.unitId);
              const each = cost.perMember.find((c) => c.memberId === row.member.id);
              const max = unit ? unitLimits(unit, ctx).max : null;
              const count = unit ? warband.members.filter((m) => findUnit(rules, warband, m.unitId)?.id === unit.id).length : 0;
              return { cost: { ducats: each?.ducats ?? 0, glory: each?.glory ?? 0 }, ...(max !== null ? { cap: { count, max } } : {}) };
            },
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
          purse={purse}
          onAdd={(unit) => {
            const upgradeIds = defaultUpgrades(unit, warband, rules, ctx);
            stage({ type: "stage-recruit", member: { id: freshId(), unitId: unit.id, equipmentItemIds: defaultKit(unit, warband, rules, ctx), ...(upgradeIds.length ? { upgradeIds } : {}) } });
          }}
        />
      </section>
    </div>
  );
}
