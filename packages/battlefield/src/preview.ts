import { DELTA, type Dir } from "./grid.js";
import type { Layout, LayoutCell, LayoutPiece } from "./layout.js";
import { pieceById, type Palette, type Role } from "./palette.js";
import { terrainName, terrainOf } from "./terrain.js";

// Top-down plan of a layout as a standalone SVG: the grid, deployment zones,
// objectives, height (raised plateau cells shaded, ramps with an uphill arrow,
// hills with their tiers, tall pieces marked), every trench cell drawn with its
// openings and how each wall is lined, dressing footprints by role, and a
// legend with the stats.

export interface PreviewOptions {
  pxPerIn: number;
  title?: string;
  /** Piece heights by palette id, so tall pieces are labelled with their real top height. */
  heights?: Readonly<Record<string, number>>;
  /** The palette's yaw sense, so turned pieces are drawn the way they stand on the table. */
  rotYSense?: "cw" | "ccw";
  /** The palette, so pieces and the legend carry the names the table shows on hover. */
  palette?: Palette;
}

const ROLE_STYLE: Record<Role, { fill: string; stroke: string; label: string; name: string }> = {
  ground: { fill: "none", stroke: "#cfc6ad", label: "", name: "Ground tile" },
  "trench-straight": { fill: "#6b5a3e", stroke: "#3f3425", label: "", name: "Trench straight" },
  "trench-corner": { fill: "#6b5a3e", stroke: "#3f3425", label: "", name: "Trench corner" },
  "trench-t": { fill: "#6b5a3e", stroke: "#3f3425", label: "", name: "Trench T" },
  "trench-entrance": { fill: "#6b5a3e", stroke: "#3f3425", label: "", name: "Trench entrance" },
  ramp: { fill: "#b8a67a", stroke: "#6d5c34", label: "", name: "Ramp" },
  hill: { fill: "#8fb97a", stroke: "#4f7a3c", label: "H", name: "Hill" },
  crater: { fill: "#b9a67c", stroke: "#7a6a47", label: "C", name: "Crater" },
  difficult: { fill: "#c4c08f", stroke: "#7d7a4a", label: "D", name: "Difficult" },
  dangerous: { fill: "#e5a04a", stroke: "#9a5f14", label: "X", name: "Dangerous" },
  wire: { fill: "#d9534f", stroke: "#8a2420", label: "W", name: "Barbed wire" },
  ruin: { fill: "#a97c50", stroke: "#5e3f1f", label: "R", name: "Ruin / wall" },
  building: { fill: "#8e6a4a", stroke: "#4a2f17", label: "B", name: "Ruined building" },
  tower: { fill: "#5f5fa8", stroke: "#2a2a6a", label: "T", name: "Tower" },
  cover: { fill: "#9c8f7a", stroke: "#4f463a", label: "c", name: "Upright cover" },
  landmark: { fill: "#6f6fb8", stroke: "#33337a", label: "L", name: "Landmark" },
  decor: { fill: "#c9a46a", stroke: "#7a5a2a", label: "", name: "Duckboard" },
  revetment: { fill: "#7a4f2a", stroke: "#3f2812", label: "", name: "Log fence" },
  scatter: { fill: "#b7a98c", stroke: "#6a5f4b", label: "", name: "Scattered terrain" },
};

const ZONE_FILL = ["rgba(200,40,40,0.16)", "rgba(40,80,200,0.16)", "rgba(200,170,40,0.14)", "rgba(40,160,120,0.14)"];
const WALL_STYLE = { ledge: "#d8b878", logs: "#7a4f2a", revetment: "#7a4f2a" } as const;
const TALL_IN = 6;

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function renderPlanSvg(layout: Layout, options: Partial<PreviewOptions> = {}): string {
  const s = options.pxPerIn ?? 20;
  const nameOf = (p: LayoutPiece): string | null => (options.palette ? terrainName(terrainOf(pieceById(options.palette, p.paletteId), p.baseIn)) : null);
  const margin = 28;
  const titleH = 34;
  const legendW = 330;
  const board = layout.boardIn * s;
  const width = margin + board + margin + legendW + margin;
  const height = margin + titleH + Math.max(board, 760) + margin;
  const ox = margin;
  const oy = margin + titleH;
  const X = (x: number): number => ox + x * s;
  const Y = (y: number): number => oy + (layout.boardIn - y) * s;
  const out: string[] = [];
  const title = options.title ?? `${layout.archetype === "no-mans-land" ? "No Man's Land" : "Trench Lines"} — ${layout.scenarioId} — seed ${layout.seed}`;
  const byId = new Map(layout.pieces.map((p) => [p.id, p]));
  const cellBox = (cell: LayoutCell) => ({ x: X(cell.c * layout.cellIn), y: Y((cell.r + 1) * layout.cellIn), size: layout.cellIn * s });

  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  const frame = (h: number) => [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" font-family="Helvetica, Arial, sans-serif">`, `<rect width="${width}" height="${h}" fill="#f6f3ea"/>`];
  const svgAt = out.length;
  out.push(frame(height)[0]!);
  out.push(`<title>${escapeXml(title)}</title>`);
  out.push(`<defs><pattern id="raised" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#b9ab84"/><line x1="0" y1="0" x2="0" y2="8" stroke="#9c8d63" stroke-width="3"/></pattern></defs>`);
  const backgroundAt = out.length;
  out.push(frame(height)[1]!);
  out.push(`<text x="${margin}" y="${margin + 18}" font-size="18" font-weight="bold" fill="#2b2620">${escapeXml(title)}</text>`);
  out.push(`<rect x="${X(0)}" y="${Y(layout.boardIn)}" width="${board}" height="${board}" fill="#e8e1cf" stroke="#2b2620" stroke-width="2"/>`);

  layout.deploymentZones.forEach((zone, i) => {
    const pts = zone.polygon.map(([x, y]) => `${fmt(X(x))},${fmt(Y(y))}`).join(" ");
    const fill = zone.isDeployment ? ZONE_FILL[i % ZONE_FILL.length]! : "rgba(120,120,120,0.08)";
    const dash = zone.isDeployment ? "" : ` stroke-dasharray="6 4"`;
    out.push(`<polygon points="${pts}" fill="${fill}" stroke="#55504a" stroke-width="1"${dash}><title>${escapeXml(`${zone.label} (${zone.player})`)}</title></polygon>`);
    const [lx, ly] = zone.polygon[0]!;
    out.push(`<text x="${fmt(X(lx) + 4)}" y="${fmt(Y(ly) - 6)}" font-size="11" fill="#55504a">${escapeXml(zone.player)}</text>`);
  });

  // Height: plateau and hill cells (both stacked tiles) hatched with their top height, hills edged green, ramps with an arrow up the slope.
  for (const cell of layout.cells) {
    if (!cell.feature) continue;
    const { x, y, size } = cellBox(cell);
    if (cell.feature === "plateau" || cell.feature === "raised-trench" || cell.feature === "hill") {
      const hill = cell.feature === "hill";
      out.push(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${size}" height="${size}" fill="url(#raised)" stroke="${hill ? "#4f7a3c" : "#6d5c34"}" stroke-width="${hill ? 2.5 : 1.5}"><title>${escapeXml(`${hill ? "hill" : "plateau"}, top ${cell.topIn}in`)}</title></rect>`);
      if (cell.feature !== "raised-trench") out.push(`<text x="${fmt(x + 4)}" y="${fmt(y + 12)}" font-size="10" fill="#3f3425">${hill ? "hill " : ""}+${fmt(Math.round(cell.topIn * 10) / 10)}</text>`);
    } else if (cell.feature === "ramp" && cell.rampUp) {
      out.push(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${size}" height="${size}" fill="#d8c9a0" stroke="#6d5c34" stroke-width="1.5"><title>${escapeXml(`ramp, climbs ${cell.rampUp}`)}</title></rect>`);
      const [dx, dy] = DELTA[cell.rampUp as Dir];
      const cx = x + size / 2;
      const cy = y + size / 2;
      const len = size * 0.36;
      const tx = cx + dx * len;
      const ty = cy - dy * len;
      out.push(`<line x1="${fmt(cx - dx * len)}" y1="${fmt(cy + dy * len)}" x2="${fmt(tx)}" y2="${fmt(ty)}" stroke="#3f3425" stroke-width="2.5"/>`);
      const px = -dy * 6;
      const py = -dx * 6;
      out.push(`<polygon points="${fmt(tx + dx * 6)},${fmt(ty - dy * 6)} ${fmt(tx + px)},${fmt(ty + py)} ${fmt(tx - px)},${fmt(ty - py)}" fill="#3f3425"/>`);
    }
  }

  for (let i = 0; i <= layout.boardIn; i += layout.cellIn) {
    const heavy = i % 12 === 0;
    const stroke = heavy ? "#8d8572" : "#b9b09a";
    out.push(`<line x1="${X(i)}" y1="${Y(0)}" x2="${X(i)}" y2="${Y(layout.boardIn)}" stroke="${stroke}" stroke-width="${heavy ? 1.2 : 0.6}"/>`);
    out.push(`<line x1="${X(0)}" y1="${Y(i)}" x2="${X(layout.boardIn)}" y2="${Y(i)}" stroke="${stroke}" stroke-width="${heavy ? 1.2 : 0.6}"/>`);
  }

  const rectOf = (p: LayoutPiece) => {
    const [w, d] = p.footprintIn;
    const [cx, cy] = p.position;
    return { x: X(cx - w / 2), y: Y(cy + d / 2), w: w * s, h: d * s };
  };

  for (const p of layout.pieces.filter((p) => p.role === "crater" && p.layer === "ground")) {
    const r = rectOf(p);
    const style = ROLE_STYLE.crater;
    out.push(`<rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1"><title>${escapeXml(`${p.id} ${p.paletteId}`)}</title></rect>`);
    out.push(`<circle cx="${fmt(X(p.position[0]))}" cy="${fmt(Y(p.position[1]))}" r="${fmt(2.6 * s)}" fill="#8f7d58" stroke="${style.stroke}" stroke-width="1"/>`);
  }

  // Trench cells (and a trench dug into the plateau): the channel through each opening, each wall's lining.
  const channel = 1.6 * s;
  for (const cell of layout.cells.filter((c) => c.kind === "trench" || c.feature === "raised-trench")) {
    const { x, y, size } = cellBox(cell);
    const cx = x + size / 2;
    const cy = y + size / 2;
    const trenchId = cell.kind === "trench" ? cell.pieceId : cell.upperPieceIds.find((id) => byId.get(id)?.role.startsWith("trench"));
    const piece = trenchId ? byId.get(trenchId) : undefined;
    const openings = cell.kind === "trench" ? (cell.openings ?? []) : (["N", "E", "S", "W"] as const).filter((d) => !(cell.walls ?? []).some((w) => w.side === d));
    const raised = cell.feature === "raised-trench";
    out.push(`<rect x="${fmt(x + (raised ? 3 : 0))}" y="${fmt(y + (raised ? 3 : 0))}" width="${size - (raised ? 6 : 0)}" height="${size - (raised ? 6 : 0)}" fill="#6b5a3e" stroke="#3f3425" stroke-width="1"><title>${escapeXml(`${trenchId ?? cell.pieceId} ${piece?.paletteId ?? ""} rotY ${piece?.rotY ?? "?"} open ${openings.join("")}${raised ? " (dug into the plateau)" : ""}`)}</title></rect>`);
    for (const dir of openings) {
      const [dx, dy] = DELTA[dir as Dir];
      out.push(`<line x1="${fmt(cx)}" y1="${fmt(cy)}" x2="${fmt(cx + (dx * size) / 2)}" y2="${fmt(cy - (dy * size) / 2)}" stroke="#2a241b" stroke-width="${fmt(channel)}" stroke-linecap="butt"/>`);
    }
    out.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(channel / 2)}" fill="#2a241b"/>`);
    for (const wall of cell.walls ?? []) {
      const [dx, dy] = DELTA[wall.side as Dir];
      const inset = size * 0.3;
      const thick = wall.kind === "ledge" ? size * 0.16 : size * 0.09;
      const along = size * (wall.kind === "revetment" ? 0.86 : 0.8);
      const wx = cx + dx * inset;
      const wy = cy - dy * inset;
      const [w, h] = dx !== 0 ? [thick, along] : [along, thick];
      const dash = wall.kind === "revetment" ? ` stroke="#f0d9a8" stroke-width="0.8" stroke-dasharray="3 2"` : "";
      out.push(`<rect x="${fmt(wx - w / 2)}" y="${fmt(wy - h / 2)}" width="${fmt(w)}" height="${fmt(h)}" fill="${WALL_STYLE[wall.kind]}"${dash}><title>${escapeXml(`${wall.side} wall: ${wall.kind === "revetment" ? "log fence" : wall.kind === "ledge" ? "fire-step ledge" : "built-in logs"}`)}</title></rect>`);
    }
  }

  for (const p of layout.pieces.filter((p) => p.role === "decor")) {
    const r = rectOf(p);
    out.push(`<rect x="${fmt(r.x + r.w * 0.2)}" y="${fmt(r.y + r.h * 0.04)}" width="${fmt(r.w * 0.6)}" height="${fmt(r.h * 0.92)}" fill="${ROLE_STYLE.decor.fill}" fill-opacity="0.75"><title>${escapeXml(`${p.id} duckboard`)}</title></rect>`);
  }

  const free = layout.pieces.filter((p) => p.layer === "surface" && !p.cells && p.role !== "revetment" && p.role !== "decor");
  const groups = new Map<string, LayoutPiece[]>();
  for (const p of free) if (p.groupId) groups.set(p.groupId, [...(groups.get(p.groupId) ?? []), p]);
  for (const [id, members] of groups) {
    const rs = members.map(rectOf);
    const gx0 = Math.min(...rs.map((r) => r.x));
    const gy0 = Math.min(...rs.map((r) => r.y));
    const gx1 = Math.max(...rs.map((r) => r.x + r.w));
    const gy1 = Math.max(...rs.map((r) => r.y + r.h));
    out.push(`<rect x="${fmt(gx0 - 2)}" y="${fmt(gy0 - 2)}" width="${fmt(gx1 - gx0 + 4)}" height="${fmt(gy1 - gy0 + 4)}" fill="none" stroke="#55504a" stroke-width="0.8" stroke-dasharray="2 2"><title>${escapeXml(`group ${id}`)}</title></rect>`);
  }
  // Free pieces are drawn at their own size turned to their yaw (clockwise from above, as on the table).
  const turn = options.rotYSense === "ccw" ? -1 : 1;
  for (const p of free) {
    const style = ROLE_STYLE[p.role];
    const [w, d] = p.rotY % 90 === 0 && (p.rotY / 90) % 2 === 1 ? [p.sizeIn[1], p.sizeIn[0]] : p.sizeIn;
    const quarter = p.rotY % 90 === 0;
    const cx = X(p.position[0]);
    const cy = Y(p.position[1]);
    const transform = quarter ? "" : ` transform="rotate(${fmt(turn * p.rotY)} ${fmt(cx)} ${fmt(cy)})"`;
    const entryTall = p.role === "tower" || p.role === "building";
    out.push(`<rect x="${fmt(cx - (w * s) / 2)}" y="${fmt(cy - (d * s) / 2)}" width="${fmt(w * s)}" height="${fmt(d * s)}"${transform} fill="${style.fill}" fill-opacity="0.85" stroke="${style.stroke}" stroke-width="${entryTall ? 2.5 : 1.5}"><title>${escapeXml(`${nameOf(p) ? `${nameOf(p)}: ` : ""}${p.id} ${p.paletteId} rotY ${p.rotY}, rests at ${p.baseIn}in${p.objectiveId ? ` covers ${p.objectiveId}` : ""}${p.slot?.placement ? `, ${p.slot.placement}` : ""}`)}</title></rect>`);
    if (style.label) out.push(`<text x="${fmt(cx)}" y="${fmt(cy + 4)}" font-size="11" font-weight="bold" text-anchor="middle" fill="#1f1a14">${style.label}</text>`);
  }
  for (const p of free.filter((p) => p.role === "tower" || p.role === "building")) {
    const r = rectOf(p);
    const own = options.heights?.[p.paletteId];
    if (own === undefined || own < TALL_IN) continue;
    const tallIn = p.baseIn + own;
    const tx = r.x + r.w / 2;
    const ty = r.y - 4;
    out.push(`<polygon points="${fmt(tx)},${fmt(ty - 10)} ${fmt(tx - 6)},${fmt(ty)} ${fmt(tx + 6)},${fmt(ty)}" fill="#2a2a6a"/>`);
    out.push(`<text x="${fmt(tx + 9)}" y="${fmt(ty - 1)}" font-size="10" font-weight="bold" fill="#2a2a6a">${fmt(Math.round(tallIn * 10) / 10)}in</text>`);
  }

  for (const o of layout.objectives) {
    const cx = X(o.position[0]);
    const cy = Y(o.position[1]);
    const r = 0.6 * s;
    out.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="#ffffff" fill-opacity="0.9" stroke="#1f1a14" stroke-width="1.5"><title>${escapeXml(`${o.id}: ${o.label}${o.coverPieceId ? ` (covered by ${o.coverPieceId})` : o.requiresCover ? " (UNCOVERED)" : ""}`)}</title></circle>`);
    out.push(`<line x1="${fmt(cx - r)}" y1="${fmt(cy)}" x2="${fmt(cx + r)}" y2="${fmt(cy)}" stroke="#1f1a14" stroke-width="1"/>`);
    out.push(`<line x1="${fmt(cx)}" y1="${fmt(cy - r)}" x2="${fmt(cx)}" y2="${fmt(cy + r)}" stroke="#1f1a14" stroke-width="1"/>`);
    out.push(`<text x="${fmt(cx)}" y="${fmt(cy - r - 3)}" font-size="9" text-anchor="middle" fill="#1f1a14">${escapeXml(o.id)}</text>`);
  }

  for (const exit of layout.trench.exits) {
    const [dx, dy] = DELTA[exit.dir as Dir];
    const cx = X((exit.c + 0.5) * layout.cellIn) + (dx * layout.cellIn * s) / 2;
    const cy = Y((exit.r + 0.5) * layout.cellIn) - (dy * layout.cellIn * s) / 2;
    out.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="4" fill="#ffffff" stroke="#2a241b" stroke-width="1.5"><title>${escapeXml(`exit ${exit.dir} at ${exit.c},${exit.r}`)}</title></circle>`);
  }

  const lx = ox + board + margin;
  let ly = oy + 4;
  const line = (text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) => {
    ly += opts.size ?? 14;
    out.push(`<text x="${lx}" y="${ly}" font-size="${(opts.size ?? 14) - 2}" ${opts.bold ? 'font-weight="bold"' : ""} fill="${opts.color ?? "#2b2620"}">${escapeXml(text)}</text>`);
  };
  const swatch = (fill: string, stroke: string, text: string) => {
    ly += 18;
    out.push(`<rect x="${lx}" y="${ly - 12}" width="14" height="14" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`);
    out.push(`<text x="${lx + 20}" y="${ly}" font-size="12" fill="#2b2620">${escapeXml(text)}</text>`);
  };
  const counts = layout.stats.piecesByRole;
  line("Legend", { bold: true, size: 16 });
  const roleOrder: Role[] = ["trench-straight", "trench-corner", "trench-t", "revetment", "decor", "ramp", "hill", "crater", "difficult", "wire", "dangerous", "ruin", "building", "tower", "cover", "landmark", "scatter", "ground"];
  // With the palette, one line per name the table shows, drawn in the colour of the first role that carries it.
  const named = new Map<string, { role: Role; n: number }>();
  for (const role of roleOrder) {
    const n = counts[role] ?? 0;
    if (!n && role !== "ground") continue;
    const style = ROLE_STYLE[role];
    if (!options.palette || !n) {
      swatch(style.fill === "none" ? "#e8e1cf" : style.fill, style.stroke, `${style.name}${style.label ? ` (${style.label})` : ""}: ${n}`);
      continue;
    }
    for (const p of layout.pieces.filter((x) => x.role === role)) {
      const name = nameOf(p)!;
      named.set(name, { role: named.get(name)?.role ?? role, n: (named.get(name)?.n ?? 0) + 1 });
    }
  }
  for (const [name, { role, n }] of named) {
    const style = ROLE_STYLE[role];
    swatch(style.fill === "none" ? "#e8e1cf" : style.fill, style.stroke, `${name}${style.label ? ` (${style.label})` : ""}: ${n}`);
  }
  const plateauCells = layout.plateaus.reduce((n, p) => n + p.cells.length, 0);
  swatch("url(#raised)", "#6d5c34", `Plateau (stacked tiles): ${layout.plateaus.length ? `${layout.plateaus.length} with ${plateauCells} cells` : "none"}`);
  swatch(WALL_STYLE.ledge, "#7a5a2a", "Wall: fire-step ledge");
  swatch(WALL_STYLE.revetment, "#3f2812", "Wall: logs (built-in or fence, dashed)");
  ly += 8;
  line("Trench", { bold: true, size: 16 });
  const t = layout.trench;
  line(`${layout.stats.trenchCells} cells; spine ${t.mainPathLength} (${t.axis === "x" ? "west-east" : "south-north"}), ${t.branches} branches`);
  for (const dl of t.deploymentLines) line(`${dl.player} line: ${dl.cells.length} cells (${dl.variant}${dl.gaps.length ? `, ${dl.gaps.length + 1} sections` : ""}), comm ${dl.commCells.length}`);
  line(`straight ${layout.stats.trenchPieces.straight} · corner ${layout.stats.trenchPieces.corner} · T ${layout.stats.trenchPieces.t} · fences ${layout.stats.revetments}`);
  line(`search: ${layout.stats.trenchAttempts} attempt(s), ${layout.stats.coverShrinks} cover shrink(s)`);
  ly += 8;
  line("Height", { bold: true, size: 16 });
  for (const p of layout.plateaus) line(`${p.id === "plateau" ? "centre plateau" : p.id} ${p.cells.length} cells, ${p.ramps.length} ramp(s)${p.raisedTrench ? ", trench dug in" : ""}${p.tallPieceId ? ", tall piece on top" : ""}`);
  for (const h of layout.hills) line(`${h.id} ${h.cells.length} cells of stacked tiles, ${h.ramps.length} ramp(s)`);
  line(`${layout.stats.tallPieces} tall piece(s) (▲ = top height)`);
  ly += 8;
  line("Board", { bold: true, size: 16 });
  line(`${layout.boardIn}in square, ${layout.cellIn}in cells (${layout.grid.cols}x${layout.grid.rows}); north is up`);
  line(`parity: ${layout.parity.kind}; look: ${layout.aesthetic.primary}${layout.aesthetic.secondary ? ` + ${layout.aesthetic.secondary}` : ""}`);
  line(`dressing share ${Math.round(layout.stats.dressingShare * 100)}%; ${layout.stats.scatterPieces} scatter`);
  line(`${layout.stats.groundTiles} ground + ${layout.stats.stackedTiles} stacked tiles, ${layout.stats.dressingPieces} terrain pieces`);
  line(`${layout.stats.totalPieces} objects to spawn`);
  line(`objectives: ${layout.objectives.length}${layout.objectives.some((o) => o.requiresCover) ? " (cover required)" : ""}`);
  line("circle on edge = trench runs off the board");
  if (layout.stats.houseRules.length) line(`off the archetype list: ${layout.stats.houseRules.join(", ")}`, { size: 12, color: "#55504a" });
  if (layout.stats.shortfalls.length) {
    ly += 8;
    line("Shortfalls", { bold: true, size: 16, color: "#8a2420" });
    for (const sf of layout.stats.shortfalls) line(`${sf.typeId}: ${sf.placed} placed, min ${sf.min}, target ${sf.target}`, { color: sf.placed < sf.min ? "#8a2420" : "#7a5a14" });
  }
  if (layout.stats.warnings.length) {
    ly += 8;
    line("Warnings", { bold: true, size: 16, color: "#8a2420" });
    for (const w of layout.stats.warnings) line(w, { size: 12, color: "#8a2420" });
  }
  // A long legend runs past the board; the page grows to hold it.
  const full = Math.max(height, Math.ceil(ly + margin));
  [out[svgAt], out[backgroundAt]] = frame(full) as [string, string];
  out.push("</svg>");
  return out.join("\n");
}
