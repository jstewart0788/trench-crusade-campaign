import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildModelMap, buildRulesData, MODEL_MAP_FILE, RULES_FILES, type ModelMap, type RulesData, type RulesFileKey, type RulesFiles } from "./data.js";

export * from "./data.js";

/** Reads the six files under `<rootDir>/data/rules` as parsed JSON, without validating them. */
export function readRulesFiles(rootDir: string): RulesFiles {
  const read = (key: RulesFileKey) => JSON.parse(readFileSync(resolve(rootDir, RULES_FILES[key]), "utf8")) as unknown;
  return {
    factions: read("factions"),
    units: read("units"),
    equipment: read("equipment"),
    campaign: read("campaign"),
    scenarios: read("scenarios"),
    terrain: read("terrain"),
    unitRules: read("unitRules"),
  };
}

export function loadModelMap(rootDir: string): ModelMap {
  return buildModelMap(JSON.parse(readFileSync(resolve(rootDir, MODEL_MAP_FILE), "utf8")));
}

/** Loads and validates the rules data, plus the TTS model map when `<rootDir>/data/tts/models.json` exists. */
export function loadRulesData(rootDir: string): RulesData {
  const models = existsSync(resolve(rootDir, MODEL_MAP_FILE)) ? loadModelMap(rootDir) : undefined;
  return buildRulesData(readRulesFiles(rootDir), models);
}
