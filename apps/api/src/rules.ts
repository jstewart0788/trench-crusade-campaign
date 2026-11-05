import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { buildModelMap, buildRulesData, ModelMapFile, RULES_FILES, type RulesData, type RulesFileKey, type RulesFiles } from "@tc/rules";

interface Payload {
  json: Buffer;
  gzip: Buffer;
  etag: string;
}

export interface LoadedRules {
  dir: string;
  data: RulesData;
  files: RulesFiles;
  /** The six files as one JSON document, pre-serialised and pre-compressed: GET /api/rules sends these bytes. */
  json: Buffer;
  gzip: Buffer;
  etag: string;
  /** What the browser needs to name the model a member spawns as: each unit's chosen candidate and the loadout picks. GET /api/tts/models sends these bytes. */
  models?: Payload;
}

const payload = (value: unknown): Payload => {
  const json = Buffer.from(JSON.stringify(value));
  return { json, gzip: gzipSync(json), etag: `"${createHash("sha256").update(json).digest("hex").slice(0, 32)}"` };
};

/** The model map with only the candidates modelFor can return: a sixth of the size, the same answers. */
function chosenOnly(raw: unknown) {
  const file = ModelMapFile.parse(raw);
  const units = Object.entries(file.units).flatMap(([unitId, unit]) => {
    const chosen = unit.candidates.filter((c) => c.guid === unit.chosen && c.modId === unit.chosenModId && c.nickname === unit.chosenNickname);
    return chosen.length ? [[unitId, { ...unit, candidates: chosen }] as const] : [];
  });
  return { $schema: file.$schema, units: Object.fromEntries(units) };
}

/** Reads and validates the rules files once; the process serves this for its lifetime. */
export function loadRules(dir: string): LoadedRules {
  const files = {} as RulesFiles;
  for (const key of Object.keys(RULES_FILES) as RulesFileKey[]) {
    files[key] = JSON.parse(readFileSync(join(dir, basename(RULES_FILES[key])), "utf8")) as unknown;
  }
  const modelsPath = resolve(dir, "..", "tts", "models.json");
  const picksPath = resolve(dir, "..", "tts", "model-picks.json");
  const picks = existsSync(picksPath) ? (JSON.parse(readFileSync(picksPath, "utf8")) as unknown) : undefined;
  const rawModels = existsSync(modelsPath) ? (JSON.parse(readFileSync(modelsPath, "utf8")) as unknown) : undefined;
  const models = rawModels === undefined ? undefined : buildModelMap(rawModels, picks);
  const data = buildRulesData(files, models);
  return {
    dir,
    data,
    files,
    ...payload(files),
    ...(rawModels === undefined ? {} : { models: payload({ models: chosenOnly(rawModels), ...(picks === undefined ? {} : { picks }) }) }),
  };
}
