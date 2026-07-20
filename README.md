# @tracht-digital-solutions/tds-tool-devkit

Developer & design utilities for the **TDS tools platform** (`tds-tools`). Fully
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
via the manual GitHub button. See `tds-tools-contract` for the platform model.
