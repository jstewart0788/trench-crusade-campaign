import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_FILES } from "../src/schema.js";

const repoRoot = resolve(import.meta.dirname, "../../..");

describe("rules data files validate against their schema", () => {
  for (const [rel, schema] of Object.entries(DATA_FILES)) {
    const abs = resolve(repoRoot, rel);
    const run = existsSync(abs) ? it : it.skip;
    run(rel, () => {
      const parsed = schema.safeParse(JSON.parse(readFileSync(abs, "utf8")));
      if (!parsed.success) {
        const issues = parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`);
        throw new Error(`${rel} failed validation:\n${issues.join("\n")}`);
      }
      expect(parsed.success).toBe(true);
    });
  }
});
