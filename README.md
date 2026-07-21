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
npm run build
```

The `.astro` shells + `.tsx` islands are validated at the **site** build. Release
on push to `main` (auto-release @latest; the manual button is for minor/major). See `tds-tools-contract-pkg` for the platform model.
