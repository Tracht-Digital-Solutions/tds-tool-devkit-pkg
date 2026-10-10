# Testing

`npm run test:run` runs vitest. Islands opt into jsdom with a `@vitest-environment`
docblock. The manifest suite runs in node.

- `src/index.test.ts` pins the manifest contract: ids and slugs, URL-safe slugs, SEO
  budgets, and that each `component` resolves to a file inside `files`. Otherwise a bad
  `component` only surfaces as an ENOENT in the **site** build.
- The island logic (hex parsing, luminance, ratio, the JSON error locator) is
  module-private and is tested **through the rendered UI**. Don't export internals just
  to test them.
- Contrast reference ratios in the tests are derived from the WCAG 2.1 formula, not
  copied from this implementation, so they catch a wrong constant.

## Designsystem-Studio

- `src/studio/engine.test.ts` — colour maths against WCAG reference values, determinism,
  global→component propagation, overrides surviving token edits, structurally distinct
  variants, emitted CSS parsing clean for every variant × kind.
- `src/studio/import.test.ts` (jsdom) — CSS/HTML/JSON import, sanitiser, page analysis that
  copies no content and marks what it could not determine, preview markup without
  scripts/handlers/navigation.
- `src/studio/exports.test.ts` — every format builds without script, DTCG validity, ZIP
  contents and the policy filter, the export route's fail-closed policy, the a11y
  assistant, the state rules, and **"a fresh design has no failures"** across every
  kind × variant: the generator must not produce what its own checker rejects.
- `islands/studio/Studio.test.tsx` (jsdom) — the guest flow, the sandbox, locked premium
  formats, saving when entitled, applying a suggestion. jsdom does not collapse
  `<details>`; a real browser does, so a click path that works here may need the section
  opened first in Playwright.
