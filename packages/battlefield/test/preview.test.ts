import { describe, expect, it } from "vitest";
import { escapeXml, generateBattlefield, pieceById, renderPlanSvg, terrainName, terrainOf } from "../src/index.js";
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

  // Lays three boards, which can pass the default 5s on a busy machine.
  it("writes well-formed XML with one trench rect per trench cell, every lined wall, the height marks and the legend", { timeout: 30_000 }, () => {
    const heights = Object.fromEntries(env.palette.pieces.map((p) => [p.id, p.heightIn]));
    for (const seed of [1, 7, 42]) {
      const layout = generateBattlefield({ scenarioId: "claim-no-mans-land", archetype: "trench-lines", seed }, env);
      const svg = renderPlanSvg(layout, { heights, rotYSense: env.palette.rotation.rotYSense });
      expect(svg.startsWith('<?xml version="1.0"')).toBe(true);
      expect(() => assertWellFormedXml(svg)).not.toThrow();
      expect((svg.match(/<title>t-\d+-\d+ /g) ?? []).length).toBe(layout.stats.trenchCells);
      const walls = layout.cells.reduce((n, c) => n + (c.walls?.length ?? 0), 0);
      expect((svg.match(/<title>[NESW] wall: /g) ?? []).length).toBe(walls);
      expect((svg.match(/<title>ramp, climbs [NESW]<\/title>/g) ?? []).length).toBe([...layout.plateaus, ...layout.hills].reduce((n, x) => n + x.ramps.length, 0));
      expect((svg.match(/<title>plateau, top /g) ?? []).length).toBe(layout.plateaus.reduce((n, x) => n + x.cells.length, 0));
      expect(svg).toContain(`seed ${seed}`);
      expect(svg).toContain("claim-no-mans-land");
      expect((svg.match(/<circle[^>]*fill="#ffffff" fill-opacity/g) ?? []).length).toBe(layout.objectives.length);
    }
  });

  it("names pieces and the legend as the table does, given the palette", () => {
    const layout = generateBattlefield({ scenarioId: "claim-no-mans-land", archetype: "trench-lines", seed: 7 }, env);
    const svg = renderPlanSvg(layout, { palette: env.palette, rotYSense: env.palette.rotation.rotYSense });
    expect(() => assertWellFormedXml(svg)).not.toThrow();
    const names = new Set(layout.pieces.map((p) => terrainName(terrainOf(pieceById(env.palette, p.paletteId), p.baseIn))));
    for (const name of names) expect(svg, name).toMatch(new RegExp(`>${escapeXml(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: \\([A-Za-z]\\))?: \\d+</text>`));
    expect(svg).toContain(escapeXml('Trench · 3" deep · Cover · Climb'));
  });

  it("marks each ruin's most solid face and labels tall pieces with their own measured height", () => {
    const heights = Object.fromEntries(env.palette.pieces.map((p) => [p.id, p.heightIn]));
    const layout = generateBattlefield({ scenarioId: "claim-no-mans-land", seed: 10 }, env);
    const svg = renderPlanSvg(layout, { heights, palette: env.palette, rotYSense: env.palette.rotation.rotYSense });
    expect(() => assertWellFormedXml(svg)).not.toThrow();
    const ruins = layout.pieces.filter((p) => p.layer === "surface" && pieceById(env.palette, p.paletteId).wallCover);
    expect(ruins.length).toBeGreaterThan(0);
    for (const p of ruins) expect(svg, p.id).toMatch(new RegExp(`<title>${p.id} [NESW] face, cover `));
    for (const p of layout.pieces.filter((x) => x.role === "building")) {
      const own = Math.round(pieceById(env.palette, p.paletteId).heightIn * 10) / 10;
      const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
      expect(svg, p.id).toMatch(new RegExp(`>${num(own)}in(?: on \\+[\\d.]+in)?<`));
      // Not its top above the table, ground tiles and all.
      expect(svg, p.id).not.toContain(`>${num(Math.round((p.baseIn + own) * 10) / 10)}in`);
    }
    expect(svg).toContain("most solid face");
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
