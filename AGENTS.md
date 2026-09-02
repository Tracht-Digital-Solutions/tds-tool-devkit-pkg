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

- **This pack ships NO CSS — every control must carry a shared class.** The tools
  site renders the `blog` surface in its `data-flat` variant (it was `panel`
  until 2026-08-17), and a surface layer only sets tokens: they
  reach an element through `btn` / `chip` / `field-boxed` / `tds-card`. A
  `<button>` without `btn` therefore has no padding, no radius and no 44px touch
  target, and an `<input>` without `field-boxed` renders **invisible**, because
  Tailwind preflight zeroes borders.
  Until 2026-08-16 every button in this pack was bare and the markup wrote its own
  radii — `rounded-full` tabs (the *marketing* pill) and `rounded-lg` inputs, long
  after the site had moved to the panel. That is why the tools rounded differently
  from the panels. `npm run lint:primitives` runs in CI and fails on a bare
  control; the script is a byte-identical copy of the seed in `tds-ext-template-pkg`.
- **`status-pill` ist ein Etikett, keine Blockmeldung.** Die Plakette hat
  `white-space: nowrap` und Versalien und ist für ein Wort gedacht. Eine
  Fehlermeldung darin bricht nicht um, sondern macht das Dokument breiter als
  das Fenster: im JSON-Formatter waren es 460px bei 390px Fenster, weil die
  Meldung den Text des Browsers trägt und damit beliebig lang ist. Zu sehen
  ist davon nichts — `body { overflow-x: hidden }` schneidet den Überhang ab,
  man findet es nur, indem man `document.documentElement.scrollWidth` misst.
  Für eine Meldung über mehrere Zeilen ist `tds-alert` (`--success` /
  `--warning` / `--danger`) die richtige Klasse; tds-shared sagt das im
  Kommentar über `.status-pill` auch selbst. Ein `<span>` als kurzes Etikett
  neben etwas anderem bleibt eine Plakette.
- **The contrast SAMPLE panel is the one element here that draws its own 1px
  line, and it has to.** Every other edge in this pack comes from a shared
  class and therefore from `--tds-border-hairline`, which the tools site sets
  to 0 (`data-flat`). But the sample panel's FILL IS THE USER'S — at the
  default `#ffffff` it is the same white as the `.tds-card` behind it, so
  borderless it has no boundary at all and nothing shows which region is being
  measured. It uses `outline` (outside the fill, `outlineOffset: -1px`) rather
  than `border`, so the line cannot be mistaken for part of the colour pair
  under test, and `var(--color-line)` so it follows the theme. Do not
  "clean this up" into a shared class: a fill only separates against a
  DIFFERENT ground, and this one is arbitrary by design.
- **Never hand-author a radius, and do not reach for `rounded-[var(--tds-radius-*)]`
  either.** Tailwind does not generate arbitrary values out of a package inside
  `node_modules`, so from here that ships as no rule at all. Use the shared class.
- **Attribute order no longer matters, and neither does what you name a class
  constant** (fixed 2026-08-16). `lint-primitives` used to match a tag with
  `[^>]*>`, which stops at the first `>` — and an arrow handler
  (`onClick={() => …}`) supplies one, so a correctly classed control written after
  its handler was reported as bare. It also read `className={x}` as the literal
  text `x`, so `{field}` passed and `{area}` did not. The script now walks the tag
  tracking quotes and brace depth, and resolves a local `const` to its string.
  Both workarounds are gone; all 20 repos carry the identical fixed script.
- **`islands/` is NOT type-checked here** (`tsconfig` covers `src/**/*` only). The
  islands are compiled by the tds-tools-frontend build — that build is the real
  gate for a markup change, not `npm run type-check`.

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
