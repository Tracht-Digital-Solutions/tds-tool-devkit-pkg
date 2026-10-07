# Architecture

## Layout

- `src/index.ts` — the `ToolPackManifest` with two tools. It is the only file tsup
  compiles and the only file `tsc` type-checks.
- `tools/*.astro` — tool shells that the site's `/tools/[slug]` template renders.
- `islands/*.tsx` — hydrated React islands. Fully client-side, no dependencies, no network.

## Manifest contract

- `component` is a package subpath resolved via `exports`, never relative.
- Tool `id` and `slug` must stay unique across all composed packs.
- `islands/` and `tools/` are not in this repo's tsconfig `include`. They compile in
  the `tds-tools-frontend` build, which is the real gate for a markup change.

## Contrast checker

The maths follow the WCAG 2.1 relative-luminance formula. Keep the sRGB linearisation
(`0.03928` threshold) intact.

## JSON formatter: error location

`JSON.parse` error text is engine-specific, and `locate()` handles all three shapes:

1. V8 ≥ 19 usually reports **no** offset (`Unexpected token 'o', …"…" is not valid JSON`).
2. V8 sometimes reports its own `(line L column C)`.
3. Other messages carry only `position N`, which is converted to line and column.

A `/position (\d+)/`-only matcher shows no location for the common case and
double-reports the other. Don't simplify it without running `JsonFormatter.test.tsx`.
