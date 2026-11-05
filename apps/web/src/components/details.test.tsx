import { loadRulesData, toWarbandExport, type RulesData, type Warband, type WarbandMember } from "@tc/rules";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { contextFor, renderScreen } from "../pages/screens.testutil.js";
import { costLines, memberDetails, type MemberDetail } from "../roster/details.js";
import { EMPTY_PENDING, stagingReducer } from "../roster/staging.js";
import { iconActions } from "./iconActions.testutil.js";
import { MemberDetails } from "./MemberDetails.js";
import { MemberList } from "./MemberList.js";

let data: RulesData;
beforeAll(() => {
  data = loadRulesData(resolve(import.meta.dirname, "../../../.."));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const roster = (factionId: string, members: WarbandMember[], extra: Partial<Warband> = {}): Warband => ({ id: "w", name: "Details", factionId, gameNumber: 1, members, ...extra });
const detailOf = (w: Warband, memberId = "m1"): MemberDetail => {
  const d = memberDetails(w, data, "TEST");
  if (!("byId" in d)) throw new Error(d.error);
  return d.byId.get(memberId)!;
};
const render = (detail: MemberDetail) => renderToStaticMarkup(<MemberDetails detail={detail} modelsLoaded />);
const escaped = (text: string) => renderToStaticMarkup(<>{text}</>);
/** Printed as a paragraph, not only in a hover title. */
const printed = (text: string) => {
  if (!text.trim()) throw new Error("nothing to look for");
  return `>${escaped(text.trim())}</p>`;
};
const ledger = (detail: MemberDetail) => costLines(detail).lines.map((l) => [l.label, l.cost.ducats, l.cost.glory, l.builtIn]);
/** The equipment row for `name`, as rendered. */
const kitRow = (html: string, name: string) => html.split("<li ").find((li) => li.includes("data-kit=") && li.includes(`>${name}<`))!;

describe("expanded member details", () => {
  it("a Lieutenant with Standard Armour: the effective stat line, armour with its breakdown, every ability's text, the cost ledger", () => {
    const w = roster("new-antioch", [{ id: "m1", unitId: "new-antioch/lieutenant", name: "Captain Vane", equipmentItemIds: ["sword-axe", "pistol", "standard-armour"] }]);
    const detail = detailOf(w);
    expect(detail.member).toEqual(toWarbandExport(w, data, { code: "TEST", now: new Date(0) }).members[0]);

    const html = render(detail);
    for (const [k, v] of [["Mov", '6&quot;/Infantry'], ["Rng", "+2"], ["Mel", "+2"], ["Arm", "−1"], ["Base", "32mm"]]) expect(html).toContain(`<dt>${k}</dt><dd>${v}</dd>`);
    expect(html).toContain("Armour 0 profile, −1 (Standard Armour)");
    expect(html).toContain("Elite");

    const lieutenant = data.unitsById.get("new-antioch/lieutenant")!;
    for (const name of ["Hold Your Fire!", "Tough", "Leader"]) {
      const ability = lieutenant.abilities.find((a) => a.name === name)!;
      expect(html).toContain(printed(ability.text));
    }
    expect(iconActions(html)).toEqual([]);

    expect(ledger(detail)).toEqual([
      ["Lieutenant", 70, 0, false],
      ["Sword/Axe", 4, 0, false],
      ["Pistol", 6, 0, false],
      ["Standard Armour", 15, 0, false],
    ]);
    expect(costLines(detail).total).toEqual({ ducats: 95, glory: 0 });
    const costList = html.slice(html.indexOf('aria-label="Cost breakdown"'));
    expect(costList).toContain("Total");
    expect(costList).toContain(">95<");
    expect(html).toContain("default for this unit");
    expect(html).toContain(escaped(data.models!.byUnitId.get("new-antioch/lieutenant")!.nickname));
  });

  it("a Witchburner: fixed kit locked as built in, the card's Gavel as card kit, card abilities listed, glory price", () => {
    const w = roster("new-antioch", [{ id: "m1", unitId: "new-antioch/witchburner", equipmentItemIds: ["combat-helmet", "reinforced-armour"] }]);
    const detail = detailOf(w);
    const html = render(detail);
    for (const name of ["Combat Helmet", "Reinforced Armour"]) {
      const row = kitRow(html, name);
      expect(row).toContain('data-kit="built-in"');
      expect(row).toContain('aria-label="Built in, cannot be edited"');
    }
    const gavel = kitRow(html, "Gavel of Justice");
    expect(gavel).toContain('data-kit="card"');
    expect(gavel).toContain("on the unit card");
    expect(gavel).toContain("Wrath of God");
    for (const name of ["Negate Fear", "Critical", "Dignified Conduct", "Divine Judgement"]) expect(detail.member.abilities.map((a) => a.name)).toContain(name);
    expect(html).toContain("A Witchburner cannot take a Dash ACTION.</p>");
    // Built-in armour is in the printed profile already: no breakdown line.
    expect(html).not.toContain(" profile, ");
    expect(ledger(detail)).toEqual([
      ["Witchburner", 0, 5, false],
      ["Combat Helmet", 0, 0, true],
      ["Reinforced Armour", 0, 0, true],
    ]);
    expect(costLines(detail).total).toEqual({ ducats: 0, glory: 5 });
    expect(html.slice(html.indexOf('aria-label="Cost breakdown"'))).toContain('aria-label="glory"');
  });

  it("a Naval Raiders Raider: the Submachine Gun loadout spawns its hand-picked model, a Pistol one the default", () => {
    const { faction } = data.subfactionsById.get("heretic-naval-raiders")!;
    const raider = (itemIds: string[]) => detailOf(roster(faction.id, [{ id: "m1", unitId: "heretic-naval-raiders/heretic-raider", equipmentItemIds: itemIds }], { subfactionId: "heretic-naval-raiders" }));
    const smg = raider(["submachine-gun"]);
    expect(smg.member.model).toMatchObject({ source: "pick", guid: "827743" });
    const html = render(smg);
    expect(html).toContain(printed(data.equipmentById.get("submachine-gun")!.rules));
    expect(html).toContain('data-source="pick"');
    expect(html).toContain("your pick for this loadout");
    expect(html).toContain(escaped(smg.member.model!.nickname));
    const plain = raider(["pistol"]);
    expect(plain.member.model?.source).toBe("default");
    expect(render(plain)).toContain("default for this unit");
  });

  it("without the model map, or for a unit with no model, it says so instead of naming one", () => {
    const w = roster("new-antioch", [{ id: "m1", unitId: "new-antioch/lieutenant", equipmentItemIds: [] }]);
    const detail = detailOf(w);
    expect(renderToStaticMarkup(<MemberDetails detail={detail} modelsLoaded={false} />)).toContain("The model map did not load");
    expect(render({ ...detail, member: { ...detail.member, model: null } })).toContain("No model mapped");
  });

  it("lists the member's own validation issues and the Shrine's pre-game state", () => {
    const shrine = "trench-pilgrims/anchorite-shrine";
    const w = roster("trench-pilgrims", [
      { id: "m1", unitId: shrine, equipmentItemIds: [] },
      { id: "m2", unitId: "trench-pilgrims/trench-pilgrim", equipmentItemIds: [] },
    ]);
    const missing = render(detailOf(w));
    expect(missing).toContain("Issues");
    expect(missing).toContain("Anchorite Shrine must carry its Catherine Wheel (p59)");
    expect(render(detailOf(w, "m2"))).not.toContain("Catherine Wheel (p59)");

    const chosen = roster("trench-pilgrims", [{ ...w.members[0]!, equipmentItemIds: ["catherine-wheel"] }, w.members[1]!], { preGame: { brokenOnTheWheel: "m2" } });
    const shrineHtml = render(detailOf(chosen));
    expect(shrineHtml).toContain("Before this game");
    expect(shrineHtml).toContain("<strong>Broken on the Wheel</strong> (Trench Pilgrim)");
    expect(render(detailOf(chosen, "m2"))).toContain("Not deployed this game.");
  });
});

describe("expand controls on the Warband screen", () => {
  const storage = (expanded: Record<string, string[]>) => {
    const store = new Map([["tc.roster.expanded", JSON.stringify(expanded)]]);
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: () => {}, removeItem: () => {} } });
  };
  const screenRoster = () => {
    const w = roster("new-antioch", [
      { id: "m1", unitId: "new-antioch/lieutenant", name: "Captain Vane", equipmentItemIds: ["sword-axe", "pistol", "standard-armour"] },
      { id: "m2", unitId: "new-antioch/yeoman", equipmentItemIds: ["bolt-action-rifle"] },
      { id: "m3", unitId: "new-antioch/yeoman", equipmentItemIds: [] },
    ]);
    return { w, pending: stagingReducer(EMPTY_PENDING, { type: "stage-dismiss", memberId: "m2" }) };
  };
  const regions = (html: string) => [...html.matchAll(/<div id="([^"]+)" class="[^"]*" role="region" aria-label="([^"]+)"( hidden="")?>/g)].map(([, id, label, hidden]) => ({ id: id!, label: label!, hidden: !!hidden }));

  it("opens the rows remembered for this warband, each chevron naming and controlling its own region", () => {
    storage({ draft: ["m1", "m2"], ABCDEF: ["m3"] });
    const { w, pending } = screenRoster();
    const html = renderScreen("/w/draft", contextFor(data, w, pending));
    const chevrons = iconActions(html).filter((a) => a.glyph === "chevron");
    expect(chevrons.map((c) => [c.name, c.tip, c.attrs["aria-expanded"]])).toEqual([
      ["Details for Captain Vane (Lieutenant)", "Details", "true"],
      ["Details for Yeoman", "Details", "true"],
      ["Details for Yeoman", "Details", "false"],
    ]);
    const shown = regions(html);
    expect(shown.map((r) => [r.label, r.hidden])).toEqual([
      ["Details for Captain Vane (Lieutenant)", false],
      ["Details for Yeoman", false],
      ["Details for Yeoman", true],
    ]);
    expect(chevrons.map((c) => c.attrs["aria-controls"])).toEqual(shown.map((r) => r.id));
    expect(new Set(shown.map((r) => r.id)).size).toBe(3);

    const body = (i: number) => html.slice(html.indexOf(`id="${shown[i]!.id}"`)).split("</li>")[0]!;
    expect(body(0)).toContain("Armour 0 profile, −1 (Standard Armour)");
    // The Yeoman being dismissed is not in the staged roster's export: its details come from the confirmed one.
    expect(body(1)).toContain("Bolt-Action Rifle");
    expect(body(2)).not.toContain("<dt>");
  });

  it("starts closed when nothing is remembered, and leaves the closed row's markup as it was apart from the chevron", () => {
    storage({});
    const { w, pending } = screenRoster();
    const ctx = contextFor(data, w, pending);
    expect(iconActions(renderScreen("/w/draft", ctx)).filter((a) => a.glyph === "chevron").every((c) => c.attrs["aria-expanded"] === "false")).toBe(true);

    const props = { rows: ctx.rows, roster: ctx.warband, rules: data, cost: ctx.cost, validation: ctx.validation, base: "/w/draft", onRename: () => {} };
    const plain = renderToStaticMarkup(<MemoryRouter><MemberList {...props} /></MemoryRouter>);
    const closed = renderToStaticMarkup(<MemoryRouter><MemberList {...props} expand={{ isOpen: () => false, onToggle: () => {}, details: () => "never" }} /></MemoryRouter>);
    expect(closed).not.toContain("never");
    const strip = (html: string) =>
      html
        .replace(/<button[^>]*data-glyph="chevron"[\s\S]*?<\/button>/g, "")
        .replace(/<div id="[^"]*" class="[^"]*" role="region"[^>]*><\/div>/g, "")
        .replace(/ _expandable_[\w-]+/g, "")
        .replace(/class="([^"]*)"/g, (_m, c: string) => `class="${c.trim().replace(/\s+/g, " ")}"`);
    expect(strip(closed)).toBe(strip(plain));
  });
});
