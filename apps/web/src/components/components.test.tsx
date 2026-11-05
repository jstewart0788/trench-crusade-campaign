import { limitContext, loadRulesData, type RulesData, type Warband } from "@tc/rules";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { describeItem } from "../roster/describe.js";
import { createWarband, rosterReducer } from "../roster/reducer.js";
import { defaultKit, gateStatus } from "../roster/select.js";
import { cardKitEntries, kitEntries, layoutFigure, pickerRows, zoneOf, type KitEntry } from "../roster/slots.js";
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
const PURSE = { ducats: 0, threshold: 700, glory: 0, gloryPool: 0 };
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
    const fixed = renderToStaticMarkup(<SlotPicker zone="melee" slotLabel="Melee" hint="" current={entry(sinEater, "tenderizer-maul")} listing={emptyListing} purse={PURSE} onPick={noop} onRemove={noop} onKeep={noop} onClose={noop} />);
    expect(fixed).toContain("Tenderizer Maul");
    expect(fixed).toContain("built in");
    expect(removeButtons(fixed)).toBe(0);
    expect(fixed).not.toContain("Swap for");

    const yeoman = recruit("new-antioch", "new-antioch/yeoman", ["bolt-action-rifle"]);
    const bought = renderToStaticMarkup(<SlotPicker zone="ranged" slotLabel="Ranged" hint="" current={entry(yeoman, "bolt-action-rifle")} listing={emptyListing} purse={PURSE} onPick={noop} onRemove={noop} onKeep={noop} onClose={noop} />);
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
      <Inventory purse={PURSE} entries={figure.inventory} onAdd={noop} onRemove={noop} onKeep={noop} unit={archeologist} upgrades={[]} upgradeChoices={{ rows: [], uncheckable: 0 }} onAddUpgrade={noop} onRemoveUpgrade={noop} onKeepUpgrade={noop} />,
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

describe("built-in kit is shown locked", () => {
  const LOCK = 'aria-label="Built in, cannot be edited"';
  // The markup of the figure's slot button whose label is `label`.
  const slotHtml = (html: string, label: string) => {
    const buttons = html.split("<button").slice(1).map((b) => "<button" + b.slice(0, b.indexOf("</button>")));
    return buttons.find((b) => b.includes(`>${label}`))!;
  };

  it("marks the Sin Eater's built-in slots locked with the lock glyph, and a bought helmet's slot not", () => {
    const sinEater = recruit("black-grail", "black-grail/sin-eater");
    const html = renderToStaticMarkup(<Figure figure={layoutFigure(entries(sinEater), unit("black-grail/sin-eater"))} onSlot={noop} onRemove={noop} onKeep={noop} />);
    for (const label of ["Head", "Torso"]) {
      const b = slotHtml(html, label);
      expect(b).toContain('data-locked="true"');
      expect(b).toContain(LOCK);
      expect(b).toContain("built in");
    }
    expect(slotHtml(html, "Head")).toContain("Combat Helmet");

    const yeoman = recruit("new-antioch", "new-antioch/yeoman", ["combat-helmet"]);
    const bought = renderToStaticMarkup(<Figure figure={layoutFigure(entries(yeoman), unit("new-antioch/yeoman"))} onSlot={noop} onRemove={noop} onKeep={noop} />);
    const head = slotHtml(bought, "Head");
    expect(head).toContain("Combat Helmet");
    expect(head).not.toContain("data-locked");
    expect(head).not.toContain(LOCK);
  });

  it("locks card kit on the figure the same way", () => {
    const knight = unit("court-of-the-seven-headed-serpent/hell-knight");
    const html = renderToStaticMarkup(<Figure figure={layoutFigure([], knight, cardKitEntries(knight, data))} onSlot={noop} onRemove={noop} onKeep={noop} />);
    const torso = slotHtml(html, "Torso");
    expect(torso).toContain("Infernal Iron Armour");
    expect(torso).toContain('data-locked="true"');
  });

  it("opens a locked slot's picker read-only: description, lock, no Remove, no list", () => {
    const sinEater = recruit("black-grail", "black-grail/sin-eater");
    const html = renderToStaticMarkup(<SlotPicker zone="head" slotLabel="Head" hint="" current={entry(sinEater, "combat-helmet")} listing={emptyListing} purse={PURSE} onPick={noop} onRemove={noop} onKeep={noop} onClose={noop} />);
    expect(html).toContain("Combat Helmet");
    expect(html).toContain("NEGATE SHRAPNEL");
    expect(html).toContain(LOCK);
    expect(html).toContain("Built-in kit: always carried");
    expect(removeButtons(html)).toBe(0);
    expect(html).not.toContain("Swap for");
  });

  it("gives the Skills panel's built-in kit the same lock", () => {
    const sinEater = recruit("black-grail", "black-grail/sin-eater");
    const traits = memberTraits(sinEater.members[0]!, unit("black-grail/sin-eater"), sinEater, data, limitContext(sinEater, data));
    const html = renderToStaticMarkup(<SkillsPanel traits={traits} />);
    expect((html.match(/data-locked="true"/g) ?? []).length).toBe(traits.builtIn.length);
    expect((html.match(new RegExp(LOCK, "g")) ?? []).length).toBe(traits.builtIn.length);
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
    const picker = renderToStaticMarkup(<SlotPicker zone="ranged" slotLabel="Ranged" hint="" listing={listing} purse={PURSE} onPick={noop} onRemove={noop} onKeep={noop} onClose={noop} />);
    expect(picker).toContain(compact);

    const armed = rosterReducer(w, { type: "add-item", memberId: "m1", itemId: rifle.id });
    const figure = renderToStaticMarkup(<Figure figure={layoutFigure(entries(armed), yeoman)} onSlot={noop} onRemove={noop} onKeep={noop} />);
    expect(figure).toContain(compact);

    // The expandable form (current row, inventory, panel) carries the same name and detail, then the rules disclosure.
    const expandable = renderToStaticMarkup(<ItemDescription desc={describeItem(rifle)} expandable />);
    const shared = compact.replace(/<\/span>$/, "");
    expect(expandable.startsWith(shared)).toBe(true);
    const current = renderToStaticMarkup(<SlotPicker zone="ranged" slotLabel="Ranged" hint="" current={entry(armed, rifle.id)} listing={emptyListing} purse={PURSE} onPick={noop} onRemove={noop} onKeep={noop} onClose={noop} />);
    expect(current).toContain(expandable);
  });
});
