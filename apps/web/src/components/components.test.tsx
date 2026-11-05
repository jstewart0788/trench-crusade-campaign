import { limitContext, loadRulesData, type RulesData, type Warband } from "@tc/rules";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { describeItem } from "../roster/describe.js";
import { createWarband, rosterReducer } from "../roster/reducer.js";
import { defaultKit, gateStatus } from "../roster/select.js";
import { kitEntries, layoutFigure, pickerRows, zoneOf, type KitEntry } from "../roster/slots.js";
import { memberTraits } from "../roster/traits.js";
import { Figure } from "./Figure.js";
import { Inventory } from "./Inventory.js";
import { ItemDescription } from "./ItemDescription.js";
import { SkillsPanel } from "./SkillsPanel.js";
import { SlotPicker } from "./SlotPicker.js";
import { evaluateGates } from "@tc/rules";

let data: RulesData;
beforeAll(() => {
  data = loadRulesData(resolve(import.meta.dirname, "../../../.."));
});

const noop = () => {};
const unit = (id: string) => data.unitsById.get(id)!;
const recruit = (factionId: string, unitId: string, extra: string[] = []): Warband => {
  const w = createWarband({ name: "t", factionId }, "w");
  const u = unit(unitId);
  return rosterReducer(w, { type: "add-member", unitId, equipmentItemIds: [...defaultKit(u, w, data, limitContext(w, data)), ...extra] });
};
const entries = (w: Warband): KitEntry[] => kitEntries(w.members[0]!, unit(w.members[0]!.unitId), data, undefined);
const entry = (w: Warband, itemId: string) => entries(w).find((e) => e.itemId === itemId)!;
const emptyListing = { rows: [], attachments: [], uncheckable: 0, unfit: {} };
const removeButtons = (html: string) => (html.match(/>(Remove|Undo)<\/button>/g) ?? []).length;

describe("built-in kit has no remove control; purchased kit does", () => {
  it("in the slot picker: a fixed weapon is locked, a bought one can be removed or swapped", () => {
    const sinEater = recruit("black-grail", "black-grail/sin-eater");
    const fixed = renderToStaticMarkup(<SlotPicker zone="melee" slotLabel="Melee" hint="" current={entry(sinEater, "tenderizer-maul")} listing={emptyListing} onPick={noop} onRemove={noop} onKeep={noop} onClose={noop} />);
    expect(fixed).toContain("Tenderizer Maul");
    expect(fixed).toContain("built in");
    expect(removeButtons(fixed)).toBe(0);
    expect(fixed).not.toContain("Swap for");

    const yeoman = recruit("new-antioch", "new-antioch/yeoman", ["bolt-action-rifle"]);
    const bought = renderToStaticMarkup(<SlotPicker zone="ranged" slotLabel="Ranged" hint="" current={entry(yeoman, "bolt-action-rifle")} listing={emptyListing} onPick={noop} onRemove={noop} onKeep={noop} onClose={noop} />);
    expect(removeButtons(bought)).toBe(1);
    expect(bought).toContain("Swap for");
  });

  it("in the inventory: a fixed item is not listed there at all, a bought one is, with Remove", () => {
    const archeologist = unit("iron-sultanate/archeologist");
    const fixedShovel = archeologist.equipmentAccess.find((a) => a.itemId === "shovel")!;
    expect(fixedShovel.fixed).toBe(true);
    const base = recruit("iron-sultanate", archeologist.id);
    const ctx = limitContext(base, data);
    const bought = archeologist.equipmentAccess.find((a) => {
      const item = data.equipmentById.get(a.itemId);
      return !a.fixed && item && zoneOf(entries(rosterReducer(base, { type: "add-item", memberId: "m1", itemId: a.itemId })).find((e) => e.itemId === a.itemId)!.classified) === "inventory" && gateStatus(evaluateGates(a.onlyWith, a.onlyWithout, base, data, ctx)) === "open";
    })!;
    const w = rosterReducer(base, { type: "add-item", memberId: "m1", itemId: bought.itemId });
    const figure = layoutFigure(entries(w), archeologist);
    expect(figure.inventory.map((e) => e.itemId)).toEqual(expect.arrayContaining(["shovel", bought.itemId]));
    const html = renderToStaticMarkup(
      <Inventory entries={figure.inventory} onAdd={noop} onRemove={noop} onKeep={noop} unit={archeologist} upgrades={[]} upgradeChoices={{ rows: [], uncheckable: 0 }} onAddUpgrade={noop} onRemoveUpgrade={noop} onKeepUpgrade={noop} />,
    );
    expect(html).toContain(data.equipmentById.get(bought.itemId)!.name);
    expect(html).not.toContain(">Shovel<");
    expect(removeButtons(html)).toBe(1);
  });

  it("on the figure: a fixed item that has no room is marked built in, not removable", () => {
    const sinEater = recruit("black-grail", "black-grail/sin-eater");
    const figure = layoutFigure(entries(sinEater), unit("black-grail/sin-eater"));
    const html = renderToStaticMarkup(<Figure figure={{ ...figure, unplaced: [entry(sinEater, "reinforced-armour")] }} onSlot={noop} onRemove={noop} onKeep={noop} />);
    expect(html).toContain("No room");
    expect(removeButtons(html)).toBe(0);
  });

  it("in the Skills & abilities panel: nothing has a remove control", () => {
    const sinEater = recruit("black-grail", "black-grail/sin-eater");
    const traits = memberTraits(sinEater.members[0]!, unit("black-grail/sin-eater"), sinEater, data, limitContext(sinEater, data));
    const html = renderToStaticMarkup(<SkillsPanel traits={traits} onUndo={noop} onKeep={noop} />);
    for (const name of ["Combat Helmet", "Reinforced Armour", "Tenderizer Maul"]) expect(html).toContain(name);
    expect(removeButtons(html)).toBe(0);
  });
});

describe("the Skills & abilities panel", () => {
  it("shows the unit's abilities with their rules text", () => {
    const lt = recruit("new-antioch", "new-antioch/lieutenant");
    const lieutenant = unit("new-antioch/lieutenant");
    const traits = memberTraits(lt.members[0]!, lieutenant, lt, data, limitContext(lt, data));
    const html = renderToStaticMarkup(<SkillsPanel traits={traits} />);
    expect(html).toContain("Abilities");
    for (const a of lieutenant.abilities.filter((x) => ["Hold Your Fire!", "Tough", "Leader"].includes(x.name))) {
      expect(html).toContain(a.name.replace("!", "!"));
    }
    const tough = lieutenant.abilities.find((a) => a.name === "Tough")!;
    expect(html).toContain(renderToStaticMarkup(<p>{tough.text.trim()}</p>));
    expect(html).not.toContain("Skirmisher");
  });
});

describe("one description for kit, wherever it is shown", () => {
  it("an equipped item renders the same description as its picker row", () => {
    const w = recruit("new-antioch", "new-antioch/yeoman");
    const yeoman = unit("new-antioch/yeoman");
    const rifle = data.equipmentById.get("submachine-gun")!;
    const compact = renderToStaticMarkup(<ItemDescription desc={describeItem(rifle)} />);
    expect(compact).toContain("16&quot; · 2H · ASSAULT");
    expect(compact).toContain(`title="**Quick Bursts`);

    const listing = pickerRows("ranged", w.members[0]!, yeoman, w, data, limitContext(w, data));
    expect(listing.rows.some((r) => r.item.id === rifle.id)).toBe(true);
    const picker = renderToStaticMarkup(<SlotPicker zone="ranged" slotLabel="Ranged" hint="" listing={listing} onPick={noop} onRemove={noop} onKeep={noop} onClose={noop} />);
    expect(picker).toContain(compact);

    const armed = rosterReducer(w, { type: "add-item", memberId: "m1", itemId: rifle.id });
    const figure = renderToStaticMarkup(<Figure figure={layoutFigure(entries(armed), yeoman)} onSlot={noop} onRemove={noop} onKeep={noop} />);
    expect(figure).toContain(compact);

    // The expandable form (current row, inventory, panel) carries the same name and detail, then the rules disclosure.
    const expandable = renderToStaticMarkup(<ItemDescription desc={describeItem(rifle)} expandable />);
    const shared = compact.replace(/<\/span>$/, "");
    expect(expandable.startsWith(shared)).toBe(true);
    const current = renderToStaticMarkup(<SlotPicker zone="ranged" slotLabel="Ranged" hint="" current={entry(armed, rifle.id)} listing={emptyListing} onPick={noop} onRemove={noop} onKeep={noop} onClose={noop} />);
    expect(current).toContain(expandable);
  });
});
