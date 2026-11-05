import { limitContext, loadRulesData, type RulesData, type Warband } from "@tc/rules";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { createWarband, rosterReducer } from "../roster/reducer.js";
import { kitEntries, layoutFigure, pickerRows } from "../roster/slots.js";
import { Figure } from "./Figure.js";
import { Inventory } from "./Inventory.js";
import { PreGamePanel } from "./PreGamePanel.js";
import { SlotPicker } from "./SlotPicker.js";

let data: RulesData;
beforeAll(() => {
  data = loadRulesData(resolve(import.meta.dirname, "../../../.."));
});

const noop = () => {};
const PURSE = { ducats: 300, threshold: 700, glory: 0, gloryPool: 0 };
const SHRINE = "trench-pilgrims/anchorite-shrine";
const METHODIUS = "trench-pilgrims/war-pilgrimage-of-saint-methodius";
const REPLACEMENTS = ["anti-materiel-rifle", "autocannon", "gas-censer", "heavy-flamethrower", "punt-gun", "trench-mortar"];
const removeButtons = (html: string) => (html.match(/>(Remove|Undo)<\/button>/g) ?? []).length;
const shrineWarband = (variantId: string | undefined, items: string[]): Warband =>
  rosterReducer(createWarband({ name: "p", factionId: "trench-pilgrims", ...(variantId ? { variantId } : {}) }, "w"), { type: "add-member", unitId: SHRINE, equipmentItemIds: items });
const unit = () => data.unitsById.get(SHRINE)!;
const wheel = (w: Warband) => kitEntries(w.members[0]!, unit(), data, undefined).find((e) => e.itemId === "catherine-wheel")!;
const replaceInfo = { name: "Catherine Wheel", text: "When you recruit an Anchorite Shrine, you can replace its Catherine Wheel.", page: 64 };

describe("the Shrine's wheel slot", () => {
  it("while recruiting under Methodius: the picker lists the six replacements, priced", () => {
    const w = shrineWarband(METHODIUS, ["catherine-wheel"]);
    const listing = pickerRows("melee", w.members[0]!, unit(), w, data, limitContext(w, data), "catherine-wheel", new Set(REPLACEMENTS));
    const html = renderToStaticMarkup(<SlotPicker zone="melee" slotLabel="Melee" hint="" current={wheel(w)} listing={listing} purse={PURSE} replace={replaceInfo} onPick={noop} onRemove={noop} onKeep={noop} onClose={noop} />);
    expect(html).toContain("Replace the Catherine Wheel with");
    expect((html.match(/data-state="buy"/g) ?? []).length).toBe(6);
    // On the Shrine they read 1-Handed, as they count (p64), not their 2-Handed profile.
    expect(html).toContain("48&quot; · 1H · +1 INJURY DICE");
    expect(html).not.toContain("· 2H ·");
    expect(html).not.toContain("It cannot be removed or swapped");
    expect(removeButtons(html)).toBe(0);
  });

  it("once confirmed (no replace mode) it is read-only built-in kit", () => {
    const w = shrineWarband(METHODIUS, ["catherine-wheel"]);
    const html = renderToStaticMarkup(<SlotPicker zone="melee" slotLabel="Melee" hint="" current={wheel(w)} listing={{ rows: [], attachments: [], uncheckable: 0, unfit: {} }} purse={PURSE} onPick={noop} onRemove={noop} onKeep={noop} onClose={noop} />);
    expect(html).toContain("Built-in kit: always carried. It cannot be removed or swapped.");
    expect(html).not.toContain("data-state=");
  });

  it("the figure marks the wheel locked, and says when it can still be swapped", () => {
    const w = shrineWarband(METHODIUS, ["catherine-wheel"]);
    const figure = layoutFigure(kitEntries(w.members[0]!, unit(), data, undefined), unit());
    const locked = renderToStaticMarkup(<Figure figure={figure} onSlot={noop} onRemove={noop} onKeep={noop} />);
    expect(locked).toContain("Catherine Wheel");
    expect(locked).toContain('data-locked="true"');
    expect(locked).not.toContain("swap while recruiting");
    const open = renderToStaticMarkup(<Figure figure={figure} onSlot={noop} onRemove={noop} onKeep={noop} replaceableNow={(e) => e.itemId === "catherine-wheel"} />);
    expect(open).toContain("built in · swap while recruiting");
  });
});

describe("permanent Anchorite Battlekit in the inventory", () => {
  it("a confirmed fitting shows locked with no Remove; a staged one can be undone", () => {
    const w = shrineWarband(METHODIUS, ["catherine-wheel", "gas-filters"]);
    const confirmed = kitEntries(w.members[0]!, unit(), data, undefined).filter((e) => e.itemId === "gas-filters");
    const props = { onAdd: noop, onRemove: noop, onKeep: noop, unit: unit(), upgrades: [], upgradeChoices: { rows: [], uncheckable: 0 }, onAddUpgrade: noop, onRemoveUpgrade: noop, onKeepUpgrade: noop, purse: PURSE };
    const lockedHtml = renderToStaticMarkup(<Inventory entries={confirmed} {...props} />);
    expect(lockedHtml).toContain("Gas Filters");
    expect(lockedHtml).toContain("permanent");
    expect(removeButtons(lockedHtml)).toBe(0);
    const staged = kitEntries(shrineWarband(METHODIUS, ["catherine-wheel"]).members[0]!, unit(), data, { adds: ["gas-filters"], removes: [], upgradeAdds: [], upgradeRemoves: [] }).filter((e) => e.itemId === "gas-filters");
    const stagedHtml = renderToStaticMarkup(<Inventory entries={staged} {...props} />);
    expect(stagedHtml).toContain(">Undo</button>");
    expect(stagedHtml).not.toContain("permanent");
  });
});

describe("the Before the game panel", () => {
  const roster = (variantId?: string) => {
    let w = shrineWarband(variantId, ["catherine-wheel"]);
    for (const unitId of ["trench-pilgrims/trench-pilgrim", "trench-pilgrims/ecclesiastic-prisoner", "trench-pilgrims/war-prophet"]) {
      w = rosterReducer(w, { type: "add-member", unitId, equipmentItemIds: [] });
    }
    return w;
  };

  it("offers only the models the rule allows", () => {
    const html = renderToStaticMarkup(<PreGamePanel warband={roster()} rules={data} dispatch={noop} />);
    expect(html).toContain("Broken on the Wheel");
    const options = [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);
    expect(options).toEqual([["", "No one"], ["m2", "Trench Pilgrim"], ["m3", "Ecclesiastic Prisoner"]]);
  });

  it("says why it is not allowed under Methodius, with no picker", () => {
    const html = renderToStaticMarkup(<PreGamePanel warband={roster(METHODIUS)} rules={data} dispatch={noop} />);
    expect(html).toContain("Not allowed: Mortal Sin");
    expect(html).toContain("(p64)");
    expect(html).not.toContain("<select");
  });

  it("shows the Shrine's protected state once a victim is chosen, and nothing without a Shrine", () => {
    const chosen = { ...roster(), preGame: { brokenOnTheWheel: "m2" } };
    expect(renderToStaticMarkup(<PreGamePanel warband={chosen} rules={data} dispatch={noop} />)).toContain("Trench Pilgrim is not deployed this game");
    const noShrine = rosterReducer(createWarband({ name: "p", factionId: "trench-pilgrims" }, "w"), { type: "add-member", unitId: "trench-pilgrims/trench-pilgrim", equipmentItemIds: [] });
    expect(renderToStaticMarkup(<PreGamePanel warband={noShrine} rules={data} dispatch={noop} />)).toBe("");
  });
});
