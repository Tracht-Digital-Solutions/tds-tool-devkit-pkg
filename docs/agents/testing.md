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
