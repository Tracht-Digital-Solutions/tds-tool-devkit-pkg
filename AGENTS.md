# AGENTS.md — tds-tool-devkit-pkg

A **tool package** for the TDS tools platform (JSON formatter + WCAG contrast
checker). Read `tds-tools-contract-pkg`'s AGENTS.md for the platform model.

## Shape

- `src/index.ts` — the `ToolPackManifest` (two tools). Only file tsup compiles +
  `tsc` type-checks.
- `tools/*.astro` — shells the site's `/tools/[slug]` template renders.
- `islands/*.tsx` — hydrated React islands, fully client-side (no deps, no network).

## Tests

`npm run test:run` (vitest). Islands opt into jsdom with a `@vitest-environment`
docblock; the manifest suite runs in node.

- `src/index.test.ts` pins the manifest contract — ids/slugs, URL-safe slugs,
  SEO budgets, and that each `component` resolves to a file inside `files`.
  A bad `component` otherwise surfaces only as an ENOENT in the *site* build.
- The island logic (hex parsing, luminance, ratio, the JSON error locator) is
  module-private and is exercised **through the rendered UI** — don't export
  internals just to test them.
- Contrast reference ratios in the tests are derived from the WCAG 2.1 formula,
  not copied from this implementation, so they'd catch a wrong constant.

## Gotchas

- `component` = package subpath via `exports`, never relative.
- Tool `id` + `slug` globally unique across composed packs.
- Contrast maths follow the WCAG relative-luminance formula — keep the sRGB
  linearisation (`0.03928` threshold) intact.
- **`JSON.parse` error text is engine-specific.** V8 ≥19 usually reports
  *no* offset ("Unexpected token 'o', …\"…\" is not valid JSON") and sometimes
  reports its own "(line L column C)". `locate()` handles all three shapes;
  the original `/position (\d+)/`-only version silently showed no location at
  all for the common case, and double-reported for the other. Don't simplify it
  back without running `JsonFormatter.test.tsx`.
- Islands/.astro compile at the site build (not in tsconfig `include`).
- Version stays in the `0.1.x` line (site pins `^0.1.x`).
