import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateBattlefield, type Archetype, type GenerateOptions } from "./generate.js";
import { loadCatalog, loadGeneratorEnv } from "./load.js";
import { renderPlanSvg } from "./preview.js";
import { DEFAULT_TTS_OPTIONS, layoutToObjectStates } from "./tts.js";

// pnpm --filter @tc/battlefield generate --scenario claim-no-mans-land --seed 7 --out layout.json [--tts out.json] [--svg out.svg] [--archetype trench-lines|no-mans-land, default the scenario's own] [--decor]
// pnpm --filter @tc/battlefield preview [--scenario claim-no-mans-land] [--seeds 1-10] [--out-dir preview]

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPO_ROOT = resolve(PACKAGE_ROOT, "../..");

function parseArgs(argv: string[]): { command: string; flags: Map<string, string> } {
  const [command = "", ...rest] = argv;
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!arg.startsWith("--")) throw new Error(`unexpected argument ${arg}`);
    const eq = arg.indexOf("=");
    if (eq > 0) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags.set(arg.slice(2), "true");
    } else {
      flags.set(arg.slice(2), next);
      i++;
    }
  }
  return { command, flags };
}

function parseSeeds(spec: string): number[] {
  const range = /^(\d+)-(\d+)$/.exec(spec);
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }
  return spec.split(",").map((s) => Number(s.trim()));
}

function optionsFromFlags(flags: Map<string, string>): Partial<GenerateOptions> {
  const options: Partial<GenerateOptions> = {};
  const axis = flags.get("axis");
  if (axis === "x" || axis === "y" || axis === "auto") options.axis = axis;
  const branches = flags.get("branches");
  if (branches !== undefined) options.branches = branches === "auto" ? "auto" : Number(branches);
  if (flags.has("decor")) options.decor = flags.get("decor") !== "false";
  return options;
}

function writeOut(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function usage(): never {
  console.error("usage: generate --scenario <id> --seed <n> [--archetype trench-lines|no-mans-land, default the scenario's own] [--board <in>, default the scenario's own] [--axis x|y|auto] [--branches n|auto] [--decor, lay decorative scatter too] [--out layout.json] [--tts objects.json] [--svg plan.svg] [--mat-top 0.9] [--root <repo>]");
  console.error("       preview [--scenario <id>] [--archetype trench-lines|no-mans-land, default the scenario's own] [--seeds 1-10] [--decor] [--out-dir packages/battlefield/preview] [--root <repo>]");
  process.exit(2);
}

function main(): void {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const root = resolve(flags.get("root") ?? DEFAULT_REPO_ROOT);
  const env = loadGeneratorEnv(root);
  // Left out, each scenario is laid at its own battlefield size.
  const boardIn = flags.has("board") ? Number(flags.get("board")) : undefined;
  const options = optionsFromFlags(flags);
  // Left out, each scenario is laid as its own archetype.
  const archetypeFlag = flags.get("archetype");
  if (archetypeFlag !== undefined && archetypeFlag !== "trench-lines" && archetypeFlag !== "no-mans-land") usage();
  const archetype: Archetype | undefined = archetypeFlag;
  const heights = Object.fromEntries(env.palette.pieces.map((p) => [p.id, p.heightIn]));

  if (command === "generate") {
    const scenarioId = flags.get("scenario");
    const seedRaw = flags.get("seed");
    if (!scenarioId || seedRaw === undefined) usage();
    const seed = Number(seedRaw);
    const layout = generateBattlefield({ scenarioId, archetype, seed, boardIn, options }, env);
    const out = flags.get("out");
    if (out) writeOut(resolve(out), JSON.stringify(layout, null, 2));
    const tts = flags.get("tts");
    if (tts) {
      const states = layoutToObjectStates(layout, env.palette, loadCatalog(root), { matTopY: Number(flags.get("mat-top") ?? DEFAULT_TTS_OPTIONS.matTopY) });
      writeOut(resolve(tts), JSON.stringify(states, null, 2));
    }
    const svg = flags.get("svg");
    if (svg) writeOut(resolve(svg), renderPlanSvg(layout, { heights, rotYSense: env.palette.rotation.rotYSense, palette: env.palette }));
    if (!out && !tts && !svg) process.stdout.write(`${JSON.stringify(layout, null, 2)}\n`);
    const s = layout.stats;
    console.error(`seed ${seed} ${scenarioId}: ${s.trenchCells} trench cells (${layout.trench.axis}), ${s.dressingPieces} dressing, ${s.totalPieces} objects${s.shortfalls.length ? `, shortfalls ${s.shortfalls.map((f) => `${f.typeId}=${f.placed}/${f.target}`).join(" ")}` : ""}${s.warnings.length ? `, warnings: ${s.warnings.join("; ")}` : ""}`);
    return;
  }

  if (command === "preview") {
    const scenarioId = flags.get("scenario") ?? "claim-no-mans-land";
    const seeds = parseSeeds(flags.get("seeds") ?? "1-10");
    const outDir = resolve(flags.get("out-dir") ?? resolve(PACKAGE_ROOT, "preview"));
    for (const seed of seeds) {
      const layout = generateBattlefield({ scenarioId, archetype, seed, boardIn, options }, env);
      const path = resolve(outDir, `${scenarioId}-seed-${seed}.svg`);
      writeOut(path, renderPlanSvg(layout, { heights, rotYSense: env.palette.rotation.rotYSense, palette: env.palette }));
      const s = layout.stats;
      const roles = Object.entries(s.piecesByRole)
        .filter(([role]) => role !== "ground")
        .map(([role, n]) => `${role}=${n}`)
        .join(" ");
      const lines = layout.trench.deploymentLines.map((l) => `${l.player}:${l.cells.length}(${l.insideCells} inside)+${l.commCells.length}`).join(" ");
      const plateau = layout.plateaus.length ? layout.plateaus.map((p) => `${p.id} ${p.cells.length}c/${p.ramps.length}r${p.raisedTrench ? "+trench" : ""}${p.tallPieceId ? "+tall" : ""}`).join(", ") : "no plateau";
      console.log(`seed ${seed}: ${s.trenchCells} trench cells (cross ${layout.trench.mainPathLength}, lines ${lines || "none"}, ${layout.trench.branches} branches), ${plateau}, ${layout.hills.length} hill(s), ${s.tallPieces} tall, ${s.dressingPieces} terrain pieces, ${s.scatterPieces} scatter, ${s.totalPieces} objects; parity ${layout.parity.kind}, look ${layout.aesthetic.primary}${layout.aesthetic.secondary ? `+${layout.aesthetic.secondary}` : ""} | ${roles}${s.shortfalls.length ? ` | shortfalls ${s.shortfalls.map((f) => `${f.typeId}=${f.placed}/${f.target}`).join(" ")}` : ""}`);
      console.log(`  objects by category: ${Object.entries(s.objectsByCategory).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(", ")}`);
      console.log(`  dressing share: ${(s.dressingShare * 100).toFixed(1)}% (${Math.round(s.dressingShare * s.totalPieces)} of ${s.totalPieces} objects fill terrain or scatter slots)`);
      console.log(`  scatter by role: ${Object.entries(s.scatterByRole).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(", ") || "none"}`);
    }
    return;
  }
  usage();
}

main();
