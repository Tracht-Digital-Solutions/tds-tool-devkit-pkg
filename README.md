# @tracht-digital-solutions/tds-tool-devkit

Developer & design utilities for the **TDS tools platform** (`tds-tools-frontend`). Fully
client-side.

## Tools

| id | slug | premium | description |
|---|---|---|---|
| `json-formatter` | `json-formatter` | no | Format / validate / minify JSON with error location |
| `contrast-checker` | `kontrast-checker` | no | WCAG AA/AAA colour-contrast checker |

## Develop

```bash
npm install
npm run type-check
npm run test:run    # vitest — manifest contract + both islands
npm run build
```

## Tests

- **`src/index.test.ts`** — the manifest: unique ids/slugs, URL-safe slugs, the
  fields `composeToolPacks` and the public tool pages rely on, SEO length
  budgets, and that every declared `component` resolves to a file that is
  actually published via `files`.
- **`islands/ContrastChecker.test.tsx`** — the WCAG maths, driven through the
  rendered UI. Reference ratios come from the WCAG 2.1 definition (black on
  white = 21:1, `#767676` on white = 4.54:1), not from this implementation, and
  the AA/AAA thresholds (4.5 / 3 / 7) are tested from both sides.
- **`islands/JsonFormatter.test.tsx`** — format / minify / indent round-trips,
  and the syntax-error locator across every engine message shape.

The `.astro` shells are still validated at the **site** build. Release
on push to `main` (auto-release @latest; the manual button is for minor/major). See `tds-tools-contract-pkg` for the platform model.
