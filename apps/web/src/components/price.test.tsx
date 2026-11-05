import { limitContext, loadRulesData, type RulesData, type Warband } from "@tc/rules";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { createWarband, rosterReducer } from "../roster/reducer.js";
import { Price } from "./Price.js";
import { PriceButton } from "./PriceButton.js";
import { RecruitList } from "./RecruitList.js";

let data: RulesData;
beforeAll(() => {
  data = loadRulesData(resolve(import.meta.dirname, "../../../.."));
});

const noop = () => {};
const PURSE = { ducats: 290, threshold: 700, glory: 0, gloryPool: 0 };
const button = (offer: Parameters<typeof PriceButton>[0]["offer"], purse = PURSE) => renderToStaticMarkup(<PriceButton offer={offer} purse={purse} label="Buy it" onBuy={noop} />);

describe("PriceButton states", () => {
  it("affordable: a live crown price whose hint is the purse after", () => {
    const html = button({ cost: { ducats: 30, glory: 0 } });
    expect(html).toContain('data-state="buy"');
    expect(html).not.toContain("aria-disabled");
    expect(html).toContain('aria-label="ducats"');
    expect(html).toContain(">30<");
    expect(html).toContain("320/700");
    expect(html).toContain('aria-label="Buy it"');
  });

  it("unaffordable: dimmed, does nothing, and the reason is in the hint and the accessible name", () => {
    const html = button({ cost: { ducats: 30, glory: 0 } }, { ...PURSE, ducats: 685 });
    expect(html).toContain('data-state="over-threshold"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("Over threshold by 15");
    expect(html).toContain('aria-label="Buy it: Over threshold by 15"');
    expect(html).toContain(">30<");
  });

  it("capped: dimmed with the limit", () => {
    const html = button({ cost: { ducats: 70, glory: 0 }, cap: { count: 2, max: 2 } });
    expect(html).toContain('data-state="capped"');
    expect(html).toContain("Limit reached 2/2");
  });

  it("free: reads Free and still buys", () => {
    const html = button({ cost: { ducats: 0, glory: 0 } });
    expect(html).toContain(">Free<");
    expect(html).toContain('data-state="buy"');
    // The only crown is the hint's purse-after; the price itself has none.
    expect(html.match(/aria-label="ducats"/g)).toHaveLength(1);
    expect(html.indexOf('aria-label="ducats"')).toBeGreaterThan(html.indexOf(">Free<"));
  });

  it("glory: a sun price; blocked when the pool is short, and the hint carries the glory after", () => {
    const short = button({ cost: { ducats: 0, glory: 7 } });
    expect(short).toContain('aria-label="glory"');
    expect(short).toContain('data-state="over-glory"');
    expect(short).toContain("Short 7 glory");
    const ok = button({ cost: { ducats: 0, glory: 7 } }, { ...PURSE, gloryPool: 11 });
    expect(ok).toContain('data-state="buy"');
    expect(ok).toContain("7/11");
  });

  it("Price renders both currencies, Free, and a signed receipt line", () => {
    const both = renderToStaticMarkup(<Price cost={{ ducats: 110, glory: 4 }} />);
    expect(both).toContain('aria-label="ducats"');
    expect(both).toContain('aria-label="glory"');
    expect(renderToStaticMarkup(<Price cost={{ ducats: 0, glory: 0 }} />)).toContain(">Free<");
    expect(renderToStaticMarkup(<Price cost={{ ducats: 45, glory: 0 }} signed />)).toContain(">+45<");
    expect(renderToStaticMarkup(<Price cost={{ ducats: -30, glory: 0 }} signed />)).toContain(">-30<");
  });
});

describe("the Barracks recruit list", () => {
  it("prices every unit and blocks what the roster cannot take or pay for", () => {
    let w: Warband = createWarband({ name: "t", factionId: "new-antioch" }, "w");
    w = rosterReducer(w, { type: "add-member", unitId: "new-antioch/lieutenant", equipmentItemIds: [] });
    const purse = { ducats: 685, threshold: 700, glory: 0, gloryPool: 0 };
    const html = renderToStaticMarkup(<RecruitList warband={w} rules={data} ctx={limitContext(w, data)} purse={purse} onAdd={noop} />);
    const rowOf = (name: string) => {
      const at = html.indexOf(`>${name}<`);
      return html.slice(at, html.indexOf("</li>", at));
    };
    expect(rowOf("Lieutenant")).toContain('data-state="capped"');
    expect(rowOf("Lieutenant")).toContain("Limit reached 1/1");
    expect(rowOf("Lieutenant")).toContain("1 of 1");
    expect(rowOf("Yeoman")).toContain('data-state="over-threshold"');
    expect(rowOf("Yeoman")).toContain("Over threshold by 15");
    const glory = data.unitsByFaction.get("new-antioch")!.find((u) => (u.cost.glory ?? 0) > 0 && !u.onlyWith)!;
    expect(rowOf(glory.name)).toContain('data-state="over-glory"');
    expect(html).not.toMatch(/>Add</);
  });
});
