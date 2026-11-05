import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests run against the rules and battlefield sources so they need no prior build.
const rulesSrc = fileURLToPath(new URL("../../packages/rules/src/index.ts", import.meta.url));
const battlefieldSrc = fileURLToPath(new URL("../../packages/battlefield/src/index.ts", import.meta.url));

export default defineConfig({
  resolve: { alias: [{ find: /^@tc\/rules$/, replacement: rulesSrc }, { find: /^@tc\/battlefield$/, replacement: battlefieldSrc }] },
  test: { include: ["test/**/*.test.ts"] },
});
