// Picks the recommended seeds the API offers per scenario and writes
// data/tts/battlefield-seeds.json. Rerun after a generator change:
//   pnpm battlefields:seeds [--candidates 30] [--count 5]
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadGeneratorEnv, recommendSeeds } from "../packages/battlefield/src/index.js";

const root = resolve(import.meta.dirname, "..");
const flag = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const candidates = flag("candidates", 30);
const count = flag("count", 5);
const env = loadGeneratorEnv(root);
const seeds = Array.from({ length: candidates }, (_, i) => i + 1);
const scenarios = env.scenarios.map((s) => {
  const picked = recommendSeeds(env, s.id, seeds, count);
  console.error(`${s.id}: ${picked.map((q) => `${q.seed}(w${q.warnings} r${q.shortfallRows} m${q.missing})`).join(" ") || "none"}`);
  return { id: s.id, seeds: picked.map((q) => q.seed) };
});
const out = { candidates: `1-${candidates}`, count, criteria: "minimums met; then fewest warnings, shortfall rows, missing pieces; lowest seed", scenarios };
writeFileSync(resolve(root, "data/tts/battlefield-seeds.json"), `${JSON.stringify(out, null, 2)}\n`);
