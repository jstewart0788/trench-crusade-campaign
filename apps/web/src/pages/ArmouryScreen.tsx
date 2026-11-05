import { findUnit } from "@tc/rules/browser";
import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Figure } from "../components/Figure.js";
import { Inventory } from "../components/Inventory.js";
import { Loadout } from "../components/Loadout.js";
import { SlotPicker } from "../components/SlotPicker.js";
import { memberTitle, upgradeRows } from "../roster/select.js";
import { kitEntries, layoutFigure, pickerRows, SLOTS, ZONE_LABELS, type KitEntry, type PickerRow, type SlotView, type Zone } from "../roster/slots.js";
import { baseMember, stagedUpgrades, type StagedEntry } from "../roster/staging.js";
import { useWarband } from "./warbandContext.js";
import styles from "./ArmouryScreen.module.css";

interface OpenPicker {
  zone: Zone;
  slotId?: string;
  slotLabel: string;
  hint: string;
  current?: KitEntry;
  coveredBy?: KitEntry;
}

export function ArmouryScreen() {
  const { rules, warband, confirmed, pending, rows, stage, base, ctx, cost, delta, validation, dispatch } = useWarband();
  const [params, setParams] = useSearchParams();
  const wanted = params.get("member");
  const member = warband.members.find((m) => m.id === wanted) ?? warband.members[0];
  const [picker, setPicker] = useState<OpenPicker>();
  const closePicker = useCallback(() => setPicker(undefined), []);

  const confirmedMember = member ? baseMember(confirmed, pending, member.id) : undefined;
  const unit = member ? findUnit(rules, warband.factionId, member.unitId) : undefined;
  const pm = member ? pending.members[member.id] : undefined;

  const kit = useMemo(() => (member && confirmedMember && unit ? kitEntries(confirmedMember, unit, rules, pm) : []), [member, confirmedMember, unit, rules, pm]);
  const figure = useMemo(() => (unit ? layoutFigure(kit, unit) : undefined), [kit, unit]);
  const listing = useMemo(
    () => (picker && member && unit ? pickerRows(picker.zone, member, unit, warband, rules, ctx, picker.current?.itemId ?? picker.coveredBy?.itemId) : undefined),
    [picker, member, unit, warband, rules, ctx],
  );
  const upgradeChoices = useMemo(() => (member && unit ? upgradeRows(member, unit, warband, rules, ctx) : { rows: [], uncheckable: 0 }), [member, unit, warband, rules, ctx]);

  if (!member || !confirmedMember) {
    return (
      <p className="panel muted">
        No models yet. <Link to={`${base}/barracks`}>Recruit some in the Barracks</Link> first.
      </p>
    );
  }
  const memberId = member.id;

  const remove = (entry: KitEntry) => stage(entry.pending === "add" ? { type: "unstage-add", memberId, itemId: entry.itemId } : { type: "stage-remove", memberId, itemId: entry.itemId });
  const keep = (entry: KitEntry) => stage({ type: "unstage-remove", memberId, itemId: entry.itemId });
  const pick = (row: PickerRow, attach: boolean) => {
    const replacing = attach ? undefined : (picker?.current ?? picker?.coveredBy);
    if (replacing) remove(replacing);
    stage({ type: "stage-add", memberId, itemId: row.item.id });
    setPicker(undefined);
  };
  const openSlot = (slot: SlotView) => {
    const spec = SLOTS.find((s) => s.id === slot.id)!;
    setPicker({ zone: slot.zone, slotId: slot.id, slotLabel: `${spec.label} · ${ZONE_LABELS[slot.zone]}`, hint: spec.hint, current: slot.occupant?.entry, coveredBy: slot.coveredBy });
  };
  const openInventory = () => setPicker({ zone: "inventory", slotLabel: "Inventory", hint: "equipment, ammunition and anything without a slot" });

  const removeUpgrade = (u: StagedEntry) => stage(u.pending === "add" ? { type: "unstage-add-upgrade", memberId, upgradeId: u.id } : { type: "stage-remove-upgrade", memberId, upgradeId: u.id });
  const keepUpgrade = (u: StagedEntry) => stage({ type: "unstage-remove-upgrade", memberId, upgradeId: u.id });

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <label>
          Equipping
          <select
            value={member.id}
            onChange={(e) => {
              setPicker(undefined);
              setParams({ member: e.target.value }, { replace: true });
            }}
          >
            {rows
              .filter((r) => r.pending !== "remove")
              .map(({ member: m, pending: p }) => (
                <option key={m.id} value={m.id}>
                  {memberTitle(m, findUnit(rules, warband.factionId, m.unitId))}
                  {p === "add" ? " (pending recruit)" : ""}
                </option>
              ))}
          </select>
        </label>
        <Link to={`${base}/barracks`}>Barracks</Link>
      </div>
      {unit && figure ? (
        <div className={styles.grid}>
          <div className={styles.column}>
            <Loadout
              member={member}
              unit={unit}
              before={delta.before.perMember.find((c) => c.memberId === member.id)}
              after={cost.perMember.find((c) => c.memberId === member.id)}
              issues={validation.errors.filter((e) => e.memberId === member.id).length}
              dispatch={dispatch}
            />
            <Figure figure={figure} openSlot={picker?.slotId} onSlot={openSlot} onRemove={remove} onKeep={keep} />
            <Inventory
              entries={figure.inventory}
              onAdd={openInventory}
              onRemove={remove}
              onKeep={keep}
              unit={unit}
              upgrades={stagedUpgrades(confirmedMember, pm)}
              upgradeChoices={upgradeChoices}
              onAddUpgrade={(upgradeId) => stage({ type: "stage-add-upgrade", memberId, upgradeId })}
              onRemoveUpgrade={removeUpgrade}
              onKeepUpgrade={keepUpgrade}
            />
          </div>
          <div className={styles.column}>
            {picker && listing ? (
              <SlotPicker
                zone={picker.zone}
                slotLabel={picker.slotLabel}
                hint={picker.hint}
                current={picker.current}
                coveredBy={picker.coveredBy}
                listing={listing}
                onPick={pick}
                onRemove={(e) => {
                  remove(e);
                  setPicker(undefined);
                }}
                onKeep={(e) => {
                  keep(e);
                  setPicker(undefined);
                }}
                onClose={closePicker}
              />
            ) : (
              <p className={`panel ${styles.hint}`}>Click a slot on the figure to equip it, or add to the inventory. Changes stay pending until you confirm purchases in the header.</p>
            )}
          </div>
        </div>
      ) : (
        <p className="panel error">
          {member.unitId} is not a unit this data knows; remove it in the Barracks.
        </p>
      )}
    </div>
  );
}
