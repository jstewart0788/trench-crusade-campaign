import { DELTA, type Dir } from "./grid.js";
import type { Layout, LayoutPiece } from "./layout.js";
import type { Role } from "./palette.js";

// Top-down plan of a layout as a standalone SVG: the grid, deployment zones,
// objectives, every trench cell drawn with its openings so connectivity can be
// read by eye, dressing footprints by role, and a legend with the stats.

export interface PreviewOptions {
  pxPerIn: number;
  title?: string;
}

const ROLE_STYLE: Record<Role, { fill: string; stroke: string; label: string; name: string }> = {
  ground: { fill: "none", stroke: "#cfc6ad", label: "", name: "Ground tile" },
  "trench-straight": { fill: "#6b5a3e", stroke: "#3f3425", label: "", name: "Trench straight" },
  "trench-corner": { fill: "#6b5a3e", stroke: "#3f3425", label: "", name: "Trench corner" },
  "trench-t": { fill: "#6b5a3e", stroke: "#3f3425", label: "", name: "Trench T" },
  "trench-entrance": { fill: "#6b5a3e", stroke: "#3f3425", label: "", name: "Trench entrance" },
  hill: { fill: "#8fb97a", stroke: "#4f7a3c", label: "H", name: "Hill" },
  crater: { fill: "#b9a67c", stroke: "#7a6a47", label: "C", name: "Crater" },
  difficult: { fill: "#c4c08f", stroke: "#7d7a4a", label: "D", name: "Difficult" },
  dangerous: { fill: "#e5a04a", stroke: "#9a5f14", label: "X", name: "Dangerous" },
  wire: { fill: "#d9534f", stroke: "#8a2420", label: "W", name: "Barbed wire" },
  ruin: { fill: "#a97c50", stroke: "#5e3f1f", label: "R", name: "Ruin / wall" },
  landmark: { fill: "#6f6fb8", stroke: "#33337a", label: "L", name: "Landmark" },
};

const ZONE_FILL = ["rgba(200,40,40,0.16)", "rgba(40,80,200,0.16)", "rgba(200,170,40,0.14)", "rgba(40,160,120,0.14)"];

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function renderPlanSvg(layout: Layout, options: Partial<PreviewOptions> = {}): string {
  const s = options.pxPerIn ?? 20;
  const margin = 28;
  const titleH = 34;
  const legendW = 300;
  const board = layout.boardIn * s;
  const width = margin + board + margin + legendW + margin;
  const height = margin + titleH + board + margin;
  const ox = margin;
  const oy = margin + titleH;
  const X = (x: number): number => ox + x * s;
  const Y = (y: number): number => oy + (layout.boardIn - y) * s;
  const out: string[] = [];
  const title = options.title ?? `Trench Lines — ${layout.scenarioId} — seed ${layout.seed}`;

  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif">`);
  out.push(`<title>${escapeXml(title)}</title>`);
  out.push(`<rect width="${width}" height="${height}" fill="#f6f3ea"/>`);
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

  for (const p of layout.pieces.filter((p) => p.role === "ground")) {
    const r = rectOf(p);
    out.push(`<rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" fill="none" stroke="#cfc6ad" stroke-width="1" stroke-dasharray="3 3"/>`);
  }

  for (const p of layout.pieces.filter((p) => p.role === "crater" && p.layer === "ground")) {
    const r = rectOf(p);
    const style = ROLE_STYLE.crater;
    out.push(`<rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1"><title>${escapeXml(`${p.id} ${p.paletteId}`)}</title></rect>`);
    out.push(`<circle cx="${fmt(X(p.position[0]))}" cy="${fmt(Y(p.position[1]))}" r="${fmt(2.6 * s)}" fill="#8f7d58" stroke="${style.stroke}" stroke-width="1"/>`);
  }

  const channel = 1.6 * s;
  for (const cell of layout.cells.filter((c) => c.kind === "trench")) {
    const x0 = X(cell.c * layout.cellIn);
    const y0 = Y((cell.r + 1) * layout.cellIn);
    const size = layout.cellIn * s;
    const cx = x0 + size / 2;
    const cy = y0 + size / 2;
    const piece = layout.pieces.find((p) => p.id === cell.pieceId);
    out.push(`<rect x="${fmt(x0)}" y="${fmt(y0)}" width="${size}" height="${size}" fill="#6b5a3e" stroke="#3f3425" stroke-width="1"><title>${escapeXml(`${cell.pieceId} ${piece?.paletteId ?? ""} rotY ${piece?.rotY ?? "?"} open ${(cell.openings ?? []).join("")}`)}</title></rect>`);
    for (const dir of cell.openings ?? []) {
      const [dx, dy] = DELTA[dir as Dir];
      out.push(`<line x1="${fmt(cx)}" y1="${fmt(cy)}" x2="${fmt(cx + (dx * size) / 2)}" y2="${fmt(cy - (dy * size) / 2)}" stroke="#2a241b" stroke-width="${fmt(channel)}" stroke-linecap="butt"/>`);
    }
    out.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(channel / 2)}" fill="#2a241b"/>`);
  }

  for (const p of layout.pieces.filter((p) => p.layer === "surface")) {
    const style = ROLE_STYLE[p.role];
    const r = rectOf(p);
    out.push(`<rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" fill="${style.fill}" fill-opacity="0.85" stroke="${style.stroke}" stroke-width="1.5"><title>${escapeXml(`${p.id} ${p.paletteId} rotY ${p.rotY}${p.objectiveId ? ` covers ${p.objectiveId}` : ""}`)}</title></rect>`);
    if (style.label) out.push(`<text x="${fmt(r.x + r.w / 2)}" y="${fmt(r.y + r.h / 2 + 4)}" font-size="11" font-weight="bold" text-anchor="middle" fill="#1f1a14">${style.label}</text>`);
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
  line("Legend", { bold: true, size: 16 });
  const roleOrder: Role[] = ["trench-straight", "trench-corner", "trench-t", "crater", "difficult", "wire", "dangerous", "ruin", "landmark", "hill", "ground"];
  for (const role of roleOrder) {
    const n = layout.stats.piecesByRole[role] ?? 0;
    if (!n && role !== "ground") continue;
    const style = ROLE_STYLE[role];
    ly += 18;
    out.push(`<rect x="${lx}" y="${ly - 12}" width="14" height="14" fill="${style.fill === "none" ? "#e8e1cf" : style.fill}" stroke="${style.stroke}" stroke-width="1"/>`);
    out.push(`<text x="${lx + 20}" y="${ly}" font-size="12" fill="#2b2620">${escapeXml(`${style.name}${style.label ? ` (${style.label})` : ""}: ${n}`)}</text>`);
  }
  ly += 8;
  line("Trench", { bold: true, size: 16 });
  const t = layout.trench;
  line(`axis ${t.axis === "x" ? "west-east" : "south-north"}, ${layout.stats.trenchCells} cells, main run ${t.mainPathLength}`);
  line(`${t.branches} branches (${t.loops} loops), ${t.exits.length} edge exits`);
  line(`straight ${layout.stats.trenchPieces.straight} · corner ${layout.stats.trenchPieces.corner} · T ${layout.stats.trenchPieces.t}`);
  line(`search: ${layout.stats.trenchAttempts} attempt(s), ${layout.stats.coverShrinks} cover shrink(s)`);
  ly += 8;
  line("Board", { bold: true, size: 16 });
  line(`${layout.boardIn}in square, ${layout.cellIn}in cells (${layout.grid.cols}x${layout.grid.rows}); north is up`);
  line(`${layout.stats.groundTiles} ground tiles, ${layout.stats.dressingPieces} dressing, ${layout.stats.totalPieces} objects`);
  line(`objectives: ${layout.objectives.length}${layout.objectives.some((o) => o.requiresCover) ? " (cover required)" : ""}`);
  line("circle on edge = trench runs off the board");
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
  out.push("</svg>");
  return out.join("\n");
}
