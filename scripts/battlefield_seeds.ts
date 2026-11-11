// Picks the recommended seeds the API offers per scenario and writes
// data/tts/battlefield-seeds.json. Rerun after a generator change:
//   pnpm battlefields:seeds [--candidates 200] [--count 5]
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { densityBand, loadGeneratorEnv, pickSeeds, rateSeeds, selectableArchetypes } from "../packages/battlefield/src/index.js";

const root = resolve(import.meta.dirname, "..");
const flag = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const candidates = flag("candidates", 200);
const count = flag("count", 5);
const env = loadGeneratorEnv(root);
const seeds = Array.from({ length: candidates }, (_, i) => i + 1);
const scenarios = env.scenarios.map((s) => {
  // One seed list serves every archetype the panel offers for the scenario, so each seed is judged as all of them.
  const archetypes = selectableArchetypes(s);
  const rated = archetypes.map((a) => rateSeeds(env, s.id, seeds, a));
  const picked = pickSeeds(rated, count);
  rated.forEach((r, i) => {
    const b = densityBand(r);
    console.error(`${s.id} as ${archetypes[i]}: ${r.length} boards; median objects ${b.objectsMedian} (floor ${b.objectsFloor}), scatter ${b.scatter[1]} (band ${b.scatter[0]}-${b.scatter[2]}), terrain pieces ${b.terrain[1]} (band ${b.terrain[0]}-${b.terrain[2]})`);
  });
  for (const p of picked) console.error(`  seed ${p.seed}: ${p.fits.map((f) => `${f.archetype} objects ${f.objects} scatter ${f.scatter} terrain ${f.terrain} missing ${f.missing}${f.inBand ? "" : " (outside the band)"}`).join("; ")}`);
  return { id: s.id, archetypes, seeds: picked.map((p) => p.seed) };
});
const criteria =
  "as every archetype the scenario can be laid as: minimums met, no line or single file, objects at or above the 25th percentile; then scatter and terrain pieces between the 40th and 80th percentiles; then fewest missing pieces and shortfall rows, nearest the median density, fewest warnings, lowest seed";
writeFileSync(resolve(root, "data/tts/battlefield-seeds.json"), `${JSON.stringify({ candidates: `1-${candidates}`, count, criteria, scenarios }, null, 2)}\n`);
