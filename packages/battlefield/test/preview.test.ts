import { describe, expect, it } from "vitest";
import { generateBattlefield, renderPlanSvg } from "../src/index.js";
import { fixtureEnv } from "./fixtures.js";

// A small well-formedness check for the SVG the renderer writes: balanced,
// properly nested tags, quoted attributes, no bare ampersands or angle
// brackets in text. Enough to catch an unescaped label or a dropped close tag.
function assertWellFormedXml(xml: string): void {
  const token = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<\/([A-Za-z_][\w.:-]*)\s*>|<([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"<]*")*)\s*(\/?)>|([^<]+)|(<)/g;
  const stack: string[] = [];
  let roots = 0;
  let m: RegExpExecArray | null;
  while ((m = token.exec(xml))) {
    if (m[6] !== undefined) throw new Error(`bare < at ${m.index}`);
    if (m[5] !== undefined) {
      if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(m[5])) throw new Error(`bare & in text near ${m.index}`);
      continue;
    }
    if (m[1] !== undefined) {
      const open = stack.pop();
      if (open !== m[1]) throw new Error(`</${m[1]}> closes <${open ?? "nothing"}> at ${m.index}`);
      continue;
    }
    if (m[2] !== undefined) {
      if (!stack.length) roots++;
      if (m[4] !== "/") stack.push(m[2]);
    }
  }
  if (stack.length) throw new Error(`unclosed ${stack.join(", ")}`);
  if (roots !== 1) throw new Error(`${roots} root elements`);
}

describe("renderPlanSvg", () => {
  const env = fixtureEnv();

  it("writes well-formed XML with one trench rect per trench cell, every lined wall, the height marks and the legend", () => {
    const heights = Object.fromEntries(env.palette.pieces.map((p) => [p.id, p.heightIn]));
    for (const seed of [1, 7, 42]) {
      const layout = generateBattlefield({ scenarioId: "claim-no-mans-land", archetype: "trench-lines", seed }, env);
      const svg = renderPlanSvg(layout, { heights });
      expect(svg.startsWith('<?xml version="1.0"')).toBe(true);
      expect(() => assertWellFormedXml(svg)).not.toThrow();
      expect((svg.match(/<title>t-\d+-\d+ /g) ?? []).length).toBe(layout.stats.trenchCells);
      const walls = layout.cells.reduce((n, c) => n + (c.walls?.length ?? 0), 0);
      expect((svg.match(/<title>[NESW] wall: /g) ?? []).length).toBe(walls);
      expect((svg.match(/<title>ramp, climbs [NESW]<\/title>/g) ?? []).length).toBe(layout.plateau?.ramps.length ?? 0);
      expect((svg.match(/<title>plateau, top /g) ?? []).length).toBe(layout.plateau?.cells.length ?? 0);
      expect(svg).toContain(`seed ${seed}`);
      expect(svg).toContain("claim-no-mans-land");
      expect((svg.match(/<circle[^>]*fill="#ffffff" fill-opacity/g) ?? []).length).toBe(layout.objectives.length);
    }
  });

  it("escapes text it interpolates", () => {
    const layout = generateBattlefield({ scenarioId: "fields-of-glory", archetype: "trench-lines", seed: 3 }, env);
    const svg = renderPlanSvg(layout, { title: `Fish & chips <"'>` });
    expect(() => assertWellFormedXml(svg)).not.toThrow();
    expect(svg).toContain("Fish &amp; chips &lt;&quot;&apos;&gt;");
  });

  it("catches the kind of breakage the checker exists for", () => {
    expect(() => assertWellFormedXml("<svg><rect></svg>")).toThrow(/closes/);
    expect(() => assertWellFormedXml("<svg>a & b</svg>")).toThrow(/bare &/);
    expect(() => assertWellFormedXml("<svg></svg><svg/>")).toThrow(/root/);
  });
});
