import { limitContext, loadRulesData, type RulesData, type Warband } from "@tc/rules";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { contextFor as screenContext, renderScreen } from "../pages/screens.testutil.js";
import { describeItem, describeUpgrade } from "../roster/describe.js";
import { createWarband, rosterReducer } from "../roster/reducer.js";
import { defaultKit } from "../roster/select.js";
import { kitEntries, layoutFigure, zoneOf, type KitEntry } from "../roster/slots.js";
import { EMPTY_PENDING, stagingReducer, type Pending, type StagingAction } from "../roster/staging.js";
import { memberTraits } from "../roster/traits.js";
import { Figure } from "./Figure.js";
import { iconActions } from "./iconActions.testutil.js";
import { Inventory } from "./Inventory.js";
import { ItemDescription } from "./ItemDescription.js";
import { SkillsPanel } from "./SkillsPanel.js";
import { SlotPicker } from "./SlotPicker.js";
import { Tabs } from "./Tabs.js";
import { TtsCode } from "./TtsCode.js";

let data: RulesData;
beforeAll(() => {
  data = loadRulesData(resolve(import.meta.dirname, "../../../.."));
});

const noop = () => {};
const PURSE = { ducats: 0, threshold: 700, glory: 0, gloryPool: 0 };
const unit = (id: string) => data.unitsById.get(id)!;
const names = (html: string) => iconActions(html).map((a) => a.name);
const emptyListing = { rows: [], attachments: [], uncheckable: 0, unfit: {} };

const contextFor = (confirmed: Warband, pending: Pending) => screenContext(data, confirmed, pending);

/** Lieutenant m1 and Yeoman m2 confirmed; m2 is being dismissed and Yeoman m3 recruited. */
function roster() {
  let w = createWarband({ name: "Icons", factionId: "new-antioch" }, "w");
  for (const id of ["new-antioch/lieutenant", "new-antioch/yeoman"]) {
    w = rosterReducer(w, { type: "add-member", unitId: id, equipmentItemIds: defaultKit(unit(id), w, data, limitContext(w, data)) });
  }
  w = rosterReducer(w, { type: "rename-member", memberId: "m1", name: "Captain Vane" });
  const actions: StagingAction[] = [
    { type: "stage-dismiss", memberId: "m2" },
    { type: "stage-recruit", member: { id: "m3", unitId: "new-antioch/yeoman", equipmentItemIds: [] } },
  ];
  return { confirmed: w, pending: actions.reduce(stagingReducer, EMPTY_PENDING) };
}

/** Every icon action must be named for assistive tech, the name must start with what the tooltip shows, and the glyph and tooltip must stay out of the name. */
function expectWellFormed(html: string) {
  const actions = iconActions(html);
  expect(actions.length).toBeGreaterThan(0);
  for (const a of actions) {
    expect(a.name, a.glyph).not.toBe("");
    expect(a.tip, a.name).not.toBe("");
    expect(a.name.startsWith(a.tip), `${a.name} / ${a.tip}`).toBe(true);
    expect(a.decorationHidden, a.name).toBe(true);
    if (a.tag === "button") expect(a.attrs.type).toBe("button");
  }
  return actions;
}

describe("icon actions carry an accessible name", () => {
  it("Warband screen: Recruit in the Barracks, Equip on every model not leaving, Details on every model", () => {
    const { confirmed, pending } = roster();
    const html = renderScreen("/w/draft", contextFor(confirmed, pending));
    const actions = expectWellFormed(html);
    expect(actions.map((a) => [a.name, a.attrs.href])).toEqual([
      ["Recruit in the Barracks", "/w/draft/barracks"],
      ["Equip Captain Vane (Lieutenant)", "/w/draft/armoury?member=m1"],
      ["Details for Captain Vane (Lieutenant)", undefined],
      ["Details for Yeoman", undefined],
      ["Equip Yeoman", "/w/draft/armoury?member=m3"],
      ["Details for Yeoman", undefined],
    ]);
    expect(actions.map((a) => a.tip)).toEqual(["Recruit in the Barracks", "Equip", "Details", "Details", "Equip", "Details"]);
    expect(html).not.toContain(">Equip<\/a>");
  });

  it("Barracks: Equip and Dismiss a confirmed model, Keep one being dismissed, Equip and Undo a pending recruit; the Copy price button is unchanged", () => {
    const { confirmed, pending } = roster();
    const html = renderScreen("/w/draft/barracks", contextFor(confirmed, pending));
    expectWellFormed(html);
    expect(names(html)).toEqual(["Equip Captain Vane (Lieutenant)", "Dismiss Captain Vane (Lieutenant)", "Keep Yeoman", "Equip Yeoman", "Undo recruiting Yeoman"]);
    const glyphs = Object.fromEntries(iconActions(html).map((a) => [a.name, a.glyph]));
    expect(glyphs["Dismiss Captain Vane (Lieutenant)"]).toBe("dismiss");
    expect(glyphs["Keep Yeoman"]).toBe("revert");
    expect(glyphs["Undo recruiting Yeoman"]).toBe("revert");
    expect(html).toContain('aria-label="Recruit another Lieutenant with this kit');
    expect(html).toContain('aria-label="Recruit another Yeoman with this kit');
    expect((html.match(/>Copy<\/span>/g) ?? []).length).toBe(2);
  });

  it("Armoury: the toolbar's Barracks link", () => {
    const { confirmed, pending } = roster();
    const html = renderScreen("/w/draft/armoury?member=m1", contextFor(confirmed, pending));
    expectWellFormed(html);
    const barracks = iconActions(html).find((a) => a.glyph === "barracks")!;
    expect([barracks.name, barracks.attrs.href]).toEqual(["Barracks", "/w/draft/barracks"]);
  });

  describe("kit rows", () => {
    // A Yeoman with every item it may buy, laid out: the inventory-zone ones are what the Inventory lists.
    const inventoryItems = () => {
      const yeoman = unit("new-antioch/yeoman");
      const every = yeoman.equipmentAccess.filter((a) => !a.fixed).map((a) => a.itemId);
      const member = { id: "m1", unitId: yeoman.id, equipmentItemIds: every };
      return [...new Set(kitEntries(member, yeoman, data, undefined).filter((e) => zoneOf(e.classified) === "inventory").map((e) => e.itemId))].slice(0, 3);
    };

    it("Inventory: Shop for kit, then Remove, Undo or Keep on each item and upgrade, named for it", () => {
      const yeoman = unit("new-antioch/yeoman");
      const [a, b, c] = inventoryItems();
      const member = { id: "m1", unitId: yeoman.id, equipmentItemIds: [a!, b!] };
      const entries = kitEntries(member, yeoman, data, { adds: [c!], removes: [b!], upgradeAdds: [], upgradeRemoves: [] });
      const inv = layoutFigure(entries, yeoman).inventory;
      const mole = yeoman.upgrades!.find((g) => g.name === "Trench Mole")!;
      const html = renderToStaticMarkup(
        <Inventory
          purse={PURSE}
          entries={inv}
          unit={yeoman}
          upgrades={[{ id: mole.bsId }, { id: mole.bsId, pending: "add" }, { id: mole.bsId, pending: "remove" }]}
          upgradeChoices={{ rows: [], uncheckable: 0 }}
          onAdd={noop}
          onRemove={noop}
          onKeep={noop}
          onAddUpgrade={noop}
          onRemoveUpgrade={noop}
          onKeepUpgrade={noop}
        />,
      );
      expectWellFormed(html);
      const item = (id: string) => data.equipmentById.get(id)!;
      const kitNames = names(html).filter((n) => !n.startsWith("Rules for"));
      expect(kitNames.sort()).toEqual(["Shop for kit", `Remove ${item(a!).name}`, `Keep ${item(b!).name}`, `Undo adding ${item(c!).name}`, "Remove Trench Mole", "Undo adding Trench Mole", "Keep Trench Mole"].sort());
      const danger = iconActions(html).filter((x) => x.attrs.class?.includes("danger"));
      expect(danger.map((x) => x.tip)).toEqual(["Remove", "Remove"]);
    });

    it("Slot picker: Close, and Remove, Undo or Keep on what the slot holds", () => {
      const yeoman = unit("new-antioch/yeoman");
      const rifle = (owned: boolean, pending?: "add" | "remove") => {
        const member = { id: "m1", unitId: yeoman.id, equipmentItemIds: owned ? ["bolt-action-rifle"] : [] };
        const pm = { adds: pending === "add" ? ["bolt-action-rifle"] : [], removes: pending === "remove" ? ["bolt-action-rifle"] : [], upgradeAdds: [], upgradeRemoves: [] };
        return kitEntries(member, yeoman, data, pm).find((e) => e.itemId === "bolt-action-rifle")!;
      };
      const picker = (current: KitEntry) => renderToStaticMarkup(<SlotPicker zone="ranged" slotLabel="Ranged" hint="" current={current} listing={emptyListing} purse={PURSE} onPick={noop} onRemove={noop} onKeep={noop} onClose={noop} />);
      const held = picker(rifle(true));
      expectWellFormed(held);
      expect(names(held)).toEqual(["Close picker", "Remove Bolt-Action Rifle"]);
      expect(iconActions(held)[0]!.tip).toBe("Close");
      expect(names(picker(rifle(true, "remove")))).toEqual(["Close picker", "Keep Bolt-Action Rifle"]);
      expect(names(picker(rifle(false, "add")))).toEqual(["Close picker", "Undo adding Bolt-Action Rifle"]);
    });

    it("Figure: Remove or Undo kit with no room, Keep kit that is leaving", () => {
      const yeoman = unit("new-antioch/yeoman");
      const [a, b, c] = inventoryItems();
      const entries = kitEntries({ id: "m1", unitId: yeoman.id, equipmentItemIds: [a!, b!] }, yeoman, data, { adds: [c!], removes: [b!], upgradeAdds: [], upgradeRemoves: [] });
      const at = (id: string, pending?: "add" | "remove") => entries.find((e) => e.itemId === id && e.pending === pending)!;
      const figure = { ...layoutFigure([], yeoman), unplaced: [at(a!), at(c!, "add")], leaving: [at(b!, "remove")] };
      const html = renderToStaticMarkup(<Figure figure={figure} onSlot={noop} onRemove={noop} onKeep={noop} />);
      expectWellFormed(html);
      const item = (id: string) => data.equipmentById.get(id)!.name;
      expect(names(html).filter((n) => !n.startsWith("Rules for"))).toEqual([`Remove ${item(a!)}`, `Undo adding ${item(c!)}`, `Keep ${item(b!)}`]);
    });

    it("Skills & abilities: Undo a restored built-in, Keep one being removed", () => {
      let w = createWarband({ name: "t", factionId: "black-grail" }, "w");
      const sinEater = unit("black-grail/sin-eater");
      w = rosterReducer(w, { type: "add-member", unitId: sinEater.id, equipmentItemIds: defaultKit(sinEater, w, data, limitContext(w, data)) });
      const traits = memberTraits(w.members[0]!, sinEater, w, data, limitContext(w, data));
      const [first, second] = traits.builtIn;
      const staged = { ...traits, builtIn: [{ ...first!, pending: "add" as const }, { ...second!, pending: "remove" as const }] };
      const html = renderToStaticMarkup(<SkillsPanel traits={staged} onUndo={noop} onKeep={noop} />);
      expectWellFormed(html);
      const controls = names(html).filter((n) => !n.startsWith("Rules for"));
      expect(controls).toEqual([`Undo adding ${first!.desc.name}`, `Keep ${second!.desc.name}`]);
    });
  });

  it("Rules: a toggle named for the item, collapsed, controlling the hidden rules text", () => {
    const rifle = data.equipmentById.get("submachine-gun")!;
    const desc = describeItem(rifle);
    const html = renderToStaticMarkup(<ItemDescription desc={desc} expandable />);
    const [toggle] = expectWellFormed(html);
    expect([toggle!.name, toggle!.tip, toggle!.glyph, toggle!.attrs["aria-expanded"]]).toEqual(["Rules for Submachine Gun", "Rules", "rules", "false"]);
    expect(html).toMatch(new RegExp(`<p id="${toggle!.attrs["aria-controls"]}"[^>]*hidden=""`));
    expect(renderToStaticMarkup(<ItemDescription desc={desc} />)).not.toContain("data-glyph");
    const mole = describeUpgrade(unit("new-antioch/yeoman").upgrades!.find((g) => g.name === "Trench Mole")!);
    expect(mole.rules).not.toBe("");
    expect(names(renderToStaticMarkup(<ItemDescription desc={mole} expandable />))).toEqual(["Rules for Trench Mole"]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("the tabs wear the screen glyphs with their labels, and every icon that goes to a screen draws that screen's glyph", () => {
    const tabs = renderToStaticMarkup(
      <MemoryRouter>
        <Tabs base="/w/draft" />
      </MemoryRouter>,
    );
    const tabGlyphs = [...tabs.matchAll(/<a [^>]*>(<svg[^>]*data-glyph-icon="(\w+)"[^>]*>([\s\S]*?)<\/svg>)([^<]+)<\/a>/g)].map(([, svg, glyph, drawing, label]) => ({ glyph: glyph!, drawing: drawing!, label: label!, hidden: svg!.includes('aria-hidden="true"') }));
    expect(tabGlyphs.map((t) => [t.label, t.glyph, t.hidden])).toEqual([
      ["Warband", "warband", true],
      ["Barracks", "barracks", true],
      ["Armoury", "armoury", true],
    ]);
    const drawingOf = Object.fromEntries(tabGlyphs.map((t) => [t.glyph, t.drawing]));
    expect(new Set(Object.values(drawingOf)).size).toBe(3);

    const { confirmed, pending } = roster();
    const ctx = contextFor(confirmed, pending);
    const links = ["/w/draft", "/w/draft/barracks", "/w/draft/armoury?member=m1"].flatMap((path) => iconActions(renderScreen(path, ctx)).filter((a) => a.tag === "a"));
    expect(links.map((a) => a.name)).toEqual(expect.arrayContaining(["Recruit in the Barracks", "Equip Captain Vane (Lieutenant)", "Barracks"]));
    for (const a of links) {
      const screen = /\/armoury(\?|$)/.test(a.attrs.href!) ? "armoury" : /\/barracks$/.test(a.attrs.href!) ? "barracks" : "warband";
      expect(a.glyph, a.name).toBe(screen);
      expect(a.drawing, a.name).toBe(drawingOf[screen]);
    }
  });

  it("TTS code: copy the code and copy the URL", () => {
    vi.stubGlobal("window", { location: { origin: "https://tc.example" } });
    const html = renderToStaticMarkup(<TtsCode code="ABC123" />);
    const actions = expectWellFormed(html);
    expect(actions.map((a) => [a.name, a.glyph])).toEqual([
      ["Copy TTS import code", "copy"],
      ["Copy URL", "copy"],
    ]);
  });
});
