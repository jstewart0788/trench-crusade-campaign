import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The rules engine is consumed from source so the web app needs no prior
// build of @tc/rules and edits to the engine hot-reload here.
const rulesSrc = (file: string) => fileURLToPath(new URL(`../../packages/rules/src/${file}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@tc\/rules\/browser$/, replacement: rulesSrc("browser.ts") },
      { find: /^@tc\/rules$/, replacement: rulesSrc("index.ts") },
    ],
  },
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.API_URL ?? "http://127.0.0.1:3001", changeOrigin: true } },
  },
  test: { include: ["src/**/*.test.ts", "src/**/*.test.tsx"], environment: "node" },
});
