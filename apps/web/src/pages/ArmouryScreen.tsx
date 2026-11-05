import { effectiveStats, findUnit, itemCost, type ReplaceableBuiltIn } from "@tc/rules/browser";
import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Figure } from "../components/Figure.js";
import { Inventory } from "../components/Inventory.js";
import { Loadout } from "../components/Loadout.js";
import { SkillsPanel } from "../components/SkillsPanel.js";
import { SlotPicker } from "../components/SlotPicker.js";
import { memberTitle, upgradeRows } from "../roster/select.js";
import { cardKitEntries, kitEntries, layoutFigure, pickerRows, SLOTS, ZONE_LABELS, type KitEntry, type PickerRow, type SlotView, type Zone } from "../roster/slots.js";
import { baseMember, stagedUpgrades, type StagedEntry } from "../roster/staging.js";
import { isBuiltIn, memberTraits, openReplacements, type Trait } from "../roster/traits.js";
import { useWarband } from "./warbandContext.js";
import styles from "./ArmouryScreen.module.css";

interface OpenPicker {
  zone: Zone;
  slotId?: string;
  slotLabel: string;
  hint: string;
  current?: KitEntry;
  coveredBy?: KitEntry;
  /** Replace mode: the slot's replaceable built-in may be swapped now. */
  replace?: ReplaceableBuiltIn;
}

export function ArmouryScreen() {
  const { rules, warband, confirmed, pending, rows, stage, base, ctx, cost, delta, validation, dispatch, purse } = useWarband();
  const [params, setParams] = useSearchParams();
  const wanted = params.get("member");
  const member = warband.members.find((m) => m.id === wanted) ?? warband.members[0];
  const [picker, setPicker] = useState<OpenPicker>();
  const closePicker = useCallback(() => setPicker(undefined), []);

  const confirmedMember = member ? baseMember(confirmed, pending, member.id) : undefined;
  const unit = member ? findUnit(rules, warband, member.unitId) : undefined;
  const pm = member ? pending.members[member.id] : undefined;

  const kit = useMemo(() => (member && confirmedMember && unit ? kitEntries(confirmedMember, unit, rules, pm) : []), [member, confirmedMember, unit, rules, pm]);
  const card = useMemo(() => (unit ? cardKitEntries(unit, rules) : []), [unit, rules]);
  const figure = useMemo(() => (unit ? layoutFigure(kit, unit, card) : undefined), [kit, unit, card]);
  // Built-in kit is never swapped out, so it is never the item a pick replaces.
  const replaceable = (e: KitEntry | undefined) => (e && !isBuiltIn(e) ? e : undefined);
  // A replaceable built-in may be swapped only while its model is a pending recruit and the rule's gate holds (p64).
  const recruitPending = rows.find((r) => r.member.id === member?.id)?.pending === "add";
  const swappable = useMemo(() => (member && unit ? openReplacements(member, unit, warband, rules, ctx, recruitPending) : []), [member, unit, recruitPending, warband, rules, ctx]);
  const replaceRuleFor = (e: KitEntry | undefined) => (e?.access?.replaceableDefault ? swappable.find((r) => r.itemId === e.itemId) : undefined);
  const listing = useMemo(
    () =>
      picker && member && unit
        ? picker.replace
          ? pickerRows(picker.zone, member, unit, warband, rules, ctx, picker.replace.itemId, new Set(picker.replace.replacements.itemIds))
          : pickerRows(picker.zone, member, unit, warband, rules, ctx, (replaceable(picker.current) ?? replaceable(picker.coveredBy))?.itemId)
        : undefined,
    [picker, member, unit, warband, rules, ctx],
  );
  const traits = useMemo(() => (confirmedMember && unit ? memberTraits(confirmedMember, unit, warband, rules, ctx, pm) : undefined), [confirmedMember, unit, warband, rules, ctx, pm]);
  const lockedUpgrades = useMemo(() => new Set((traits?.skills ?? []).flatMap((t) => (t.upgrade ? [t.upgrade.id] : []))), [traits]);
  const upgradeChoices = useMemo(() => (member && unit ? upgradeRows(member, unit, warband, rules, ctx) : { rows: [], uncheckable: 0 }), [member, unit, warband, rules, ctx]);

  if (!member || !confirmedMember) {
    return (
      <p className="panel muted">
        No models yet. <Link to={`${base}/barracks`}>Recruit some in the Barracks</Link> first.
      </p>
    );
  }
  const memberId = member.id;

  const remove = (entry: KitEntry) => {
    stage(entry.pending === "add" ? { type: "unstage-add", memberId, itemId: entry.itemId } : { type: "stage-remove", memberId, itemId: entry.itemId });
    // Undoing a replacement puts the built-in it replaced back.
    if (entry.pending === "add" && entry.access?.replaces) stage({ type: "unstage-remove", memberId, itemId: entry.access.replaces });
  };
  const keep = (entry: KitEntry) => {
    stage({ type: "unstage-remove", memberId, itemId: entry.itemId });
    // Keeping the built-in drops whatever was about to replace it: the slot holds one.
    if (entry.access?.replaceableDefault) for (const r of kit.filter((k) => k.access?.replaces === entry.itemId && k.pending === "add")) stage({ type: "unstage-add", memberId, itemId: r.itemId });
  };
  const pick = (row: PickerRow, attach: boolean) => {
    const builtIn = picker?.replace ? kit.find((k) => k.itemId === picker.replace!.itemId && k.pending !== "remove") : undefined;
    const replacing = attach ? undefined : (builtIn ?? replaceable(picker?.current) ?? replaceable(picker?.coveredBy));
    if (replacing) remove(replacing);
    stage({ type: "stage-add", memberId, itemId: row.item.id });
    setPicker(undefined);
  };
  const openSlot = (slot: SlotView) => {
    const spec = SLOTS.find((s) => s.id === slot.id)!;
    const rule = replaceRuleFor(slot.occupant?.entry) ?? replaceRuleFor(slot.coveredBy);
    setPicker({
      zone: slot.zone,
      slotId: slot.id,
      slotLabel: `${spec.label} · ${ZONE_LABELS[slot.zone]}`,
      hint: spec.hint,
      current: slot.occupant?.entry,
      coveredBy: slot.coveredBy,
      ...(rule ? { replace: rule } : {}),
    });
  };
  const openInventory = () => setPicker({ zone: "inventory", slotLabel: "Inventory", hint: "equipment, ammunition and anything without a slot" });

  const removeUpgrade = (u: StagedEntry) => stage(u.pending === "add" ? { type: "unstage-add-upgrade", memberId, upgradeId: u.id } : { type: "stage-remove-upgrade", memberId, upgradeId: u.id });
  const keepUpgrade = (u: StagedEntry) => stage({ type: "unstage-remove-upgrade", memberId, upgradeId: u.id });
  const undoTrait = (t: Trait) => {
    if (t.kit) stage({ type: "unstage-add", memberId, itemId: t.kit.itemId });
    else if (t.upgrade) stage({ type: "unstage-add-upgrade", memberId, upgradeId: t.upgrade.id });
  };
  const keepTrait = (t: Trait) => {
    if (t.kit) stage({ type: "unstage-remove", memberId, itemId: t.kit.itemId });
    else if (t.upgrade) stage({ type: "unstage-remove-upgrade", memberId, upgradeId: t.upgrade.id });
  };

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
                  {memberTitle(m, findUnit(rules, warband, m.unitId))}
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
              stats={effectiveStats(unit, warband, rules, ctx)}
              member={member}
              unit={unit}
              before={delta.before.perMember.find((c) => c.memberId === member.id)}
              after={cost.perMember.find((c) => c.memberId === member.id)}
              issues={validation.errors.filter((e) => e.memberId === member.id).length}
              dispatch={dispatch}
            />
            <Figure figure={figure} openSlot={picker?.slotId} onSlot={openSlot} onRemove={remove} onKeep={keep} replaceableNow={(e) => replaceRuleFor(e) !== undefined} />
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
              lockedUpgrades={lockedUpgrades}
              purse={purse}
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
                purse={purse}
                {...(picker.replace ? { replace: { name: picker.replace.name, text: picker.replace.replacements.text, page: picker.replace.replacements.page } } : {})}
                refund={(() => {
                  const swapped = replaceable(picker.current) ?? replaceable(picker.coveredBy);
                  if (!swapped) return undefined;
                  const line = itemCost(rules, warband, member.unitId, swapped.itemId);
                  return { ducats: line.ducats, glory: line.glory };
                })()}
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
              <>
                {traits && <SkillsPanel traits={traits} onUndo={undoTrait} onKeep={keepTrait} />}
                <p className={`panel ${styles.hint}`}>Click a slot on the figure to equip it, or add to the inventory. Changes stay pending until you confirm purchases in the header.</p>
              </>
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
