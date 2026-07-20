# AGENTS.md — tds-tool-devkit

A **tool package** for the TDS tools platform (JSON formatter + WCAG contrast
checker). Read `tds-tools-contract`'s AGENTS.md for the platform model.

## Shape

- `src/index.ts` — the `ToolPackManifest` (two tools). Only file tsup compiles +
  `tsc` type-checks.
- `tools/*.astro` — shells the site's `/tools/[slug]` template renders.
- `islands/*.tsx` — hydrated React islands, fully client-side (no deps, no network).

## Gotchas

- `component` = package subpath via `exports`, never relative.
- Tool `id` + `slug` globally unique across composed packs.
- Contrast maths follow the WCAG relative-luminance formula — keep the sRGB
  linearisation (`0.03928` threshold) intact.
- Islands/.astro compile at the site build (not in tsconfig `include`).
- Version stays in the `0.1.x` line (site pins `^0.1.x`).
