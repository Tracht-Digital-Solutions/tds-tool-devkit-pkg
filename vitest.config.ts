import { defineConfig } from "vitest/config";

/**
 * Tool packs are published as source (`islands/` + `tools/` ship verbatim, only
 * `src/` is bundled by tsup), so the tests run against the same files the tools
 * site composes at build time.
 *
 *  - `src/index.test.ts` — the manifest: ids/slugs, the fields the tools site
 *    and `composeToolPacks` rely on, and that every declared `component` path
 *    actually exists in the published `files` list.
 *  - `islands/*.test.tsx` — the two islands in jsdom. Their logic (WCAG maths,
 *    JSON parse/format) lives in module-private helpers, so it is exercised
 *    through the rendered UI rather than by exporting internals just for tests.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}", "islands/**/*.test.{ts,tsx}"],
    environment: "node",
    restoreMocks: true,
  },
});
