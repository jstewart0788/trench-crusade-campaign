import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests run against the rules source so they need no prior build of @tc/rules.
const rulesSrc = fileURLToPath(new URL("../rules/src/index.ts", import.meta.url));

export default defineConfig({
  resolve: { alias: [{ find: /^@tc\/rules$/, replacement: rulesSrc }] },
  test: { include: ["test/**/*.test.ts"] },
});
