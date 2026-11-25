import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, loadGeneratorEnv, type GeneratorEnv } from "../src/index.js";

export const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

let env: GeneratorEnv | undefined;
export function fixtureEnv(): GeneratorEnv {
  env ??= loadGeneratorEnv(ROOT);
  return env;
}

let catalog: ReturnType<typeof loadCatalog> | undefined;
export function fixtureCatalog() {
  catalog ??= loadCatalog(ROOT);
  return catalog;
}

