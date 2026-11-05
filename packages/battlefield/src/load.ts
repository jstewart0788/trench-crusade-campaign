import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { Scenario } from "@tc/rules";
import type { ArchetypeSpec } from "./dressing.js";
import type { GeneratorEnv } from "./generate.js";
import { parseCatalog, parsePalette, type Catalog, type Palette } from "./palette.js";
import { ScenarioGeometry } from "./scenario.js";

// Node-side readers. The generator itself never touches the filesystem; the
// browser or the API can build the same GeneratorEnv from JSON they already
// have (scenarios from @tc/rules' RulesData, the palette and catalog over HTTP).

export const PALETTE_FILE = "data/tts/palette.json";
export const CATALOG_FILE = "data/tts/catalog.json";
export const SCENARIOS_FILE = "data/rules/scenarios.json";
export const TERRAIN_FILE = "data/rules/terrain.json";

const readJson = (rootDir: string, rel: string): unknown => JSON.parse(readFileSync(resolve(rootDir, rel), "utf8")) as unknown;

export function loadPalette(rootDir: string): Palette {
  return parsePalette(readJson(rootDir, PALETTE_FILE));
}

export function loadCatalog(rootDir: string): Catalog {
  return parseCatalog(readJson(rootDir, CATALOG_FILE));
}

const ScenariosGeometryFile = z.object({ scenarios: z.array(ScenarioGeometry) }).passthrough();

const ArchetypeFile = z
  .object({
    archetypes: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          composition: z.array(z.object({ typeId: z.string(), count: z.string().optional(), required: z.boolean() }).passthrough()),
          density: z.enum(["sparse", "medium", "dense"]),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export function loadScenarioGeometry(rootDir: string): ScenarioGeometry[] {
  return ScenariosGeometryFile.parse(readJson(rootDir, SCENARIOS_FILE)).scenarios;
}

export function loadArchetypes(rootDir: string): ArchetypeSpec[] {
  return ArchetypeFile.parse(readJson(rootDir, TERRAIN_FILE)).archetypes;
}

/** The geometry slice of a scenario already validated by @tc/rules. */
export function geometryOf(scenario: Scenario): ScenarioGeometry {
  return ScenarioGeometry.parse(scenario);
}

export function loadGeneratorEnv(rootDir: string): GeneratorEnv {
  return { scenarios: loadScenarioGeometry(rootDir), archetypes: loadArchetypes(rootDir), palette: loadPalette(rootDir) };
}
