import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { buildModelMap, buildRulesData, RULES_FILES, type RulesData, type RulesFileKey, type RulesFiles } from "@tc/rules";

export interface LoadedRules {
  dir: string;
  data: RulesData;
  files: RulesFiles;
  /** The six files as one JSON document, pre-serialised and pre-compressed: GET /api/rules sends these bytes. */
  json: Buffer;
  gzip: Buffer;
  etag: string;
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
  const models = existsSync(modelsPath) ? buildModelMap(JSON.parse(readFileSync(modelsPath, "utf8")), picks) : undefined;
  const data = buildRulesData(files, models);
  const json = Buffer.from(JSON.stringify(files));
  const etag = `"${createHash("sha256").update(json).digest("hex").slice(0, 32)}"`;
  return { dir, data, files, json, gzip: gzipSync(json), etag };
}
