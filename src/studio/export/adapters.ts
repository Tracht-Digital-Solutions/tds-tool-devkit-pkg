/**
 * Export adapters. Every format is built from the SAME resolved project; an
 * adapter only decides how to write it down. Adding a format = one adapter in
 * `ADAPTERS` plus its id in `policy.ts` — the generator is not touched.
 *
 * Exports contain HTML and CSS (or CSS-adjacent config) only. No adapter emits
 * JavaScript; `exports.test.ts` scans every output for script.
 */

import { parseColor, toHex } from "../color";
import { baseCss, componentsCss, emitCss, indent, sanitizeCss, tokensCss } from "../css";
import type { DesignProject } from "../model";
import { previewBody, scaffoldCss, type PreviewView } from "../previews";
import { resolveProject, type ResolvedProject } from "../resolve";
import { autoTheme, COLOR_ROLES, type ResolvedTheme } from "../themes";
import { parseShadow, spaceScale, typeScale } from "../tokens";
import { EXPORT_FORMATS, type ExportFormat } from "../policy";
import { createZip } from "./zip";

export interface ExportFile {
  path: string;
  mime: string;
  content: string | Uint8Array;
}

export interface ExportAdapter {
  id: ExportFormat;
  label: { de: string; en: string };
  description: { de: string; en: string };
  /** The files this format consists of. The first is the single-download file. */
  files(r: ResolvedProject): ExportFile[];
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const CSS = "text/css; charset=utf-8";

/** A safe file-name stem from the project name. */
export function fileStem(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return base || "designsystem";
}

function exampleHtml(r: ResolvedProject, view: PreviewView, cssHref: string | null): string {
  const p = r.project.prefix;
  const css = cssHref ? `<link rel="stylesheet" href="${cssHref}">` : `<style>\n${emitCss(r)}</style>`;
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${r.project.name.replace(/[<>&"]/g, "")} — ${view === "components" ? "Komponenten" : view === "panel" ? "Panel" : "Landingpage"}</title>
${css}
<style>
/* Nur für diese Beispielseite: Layout der Demo, nicht Teil der Komponentenbibliothek. */
${scaffoldCss(p)}
</style>
</head>
<body class="${p}-body">
${previewBody(p, view, "de", false)}
</body>
</html>
`;
}

function readme(r: ResolvedProject, included: ExportFormat[], omitted: ExportFormat[]): string {
  const p = r.project.prefix;
  const lines = [
    `# ${r.project.name}`,
    "",
    "Erzeugt mit dem Designsystem-Studio auf tools.tracht-digital.de. Reines HTML und CSS — keine JavaScript-Abhängigkeiten.",
    "",
    "## Einbinden",
    "",
    "```html",
    `<link rel="stylesheet" href="css/designsystem.css">`,
    `<body class="${p}-body"> … </body>`,
    "```",
    "",
    "## Themes",
    "",
    "Ohne Attribut folgt die Seite der Systemeinstellung (`prefers-color-scheme`). Ein Theme fest wählen:",
    "",
    "```html",
    `<html data-theme="${r.themes[0]?.def.id ?? "light"}">`,
    "```",
    "",
    `Verfügbare Themes: ${r.themes.map((t) => `\`${t.def.id}\` (${t.def.name})`).join(", ")}.`,
    "",
    "## Komponenten",
    "",
    `- Buttons: \`.${p}-btn\`, \`.${p}-btn.${p}-btn--secondary\`, Formular-Button \`.${p}-btn.${p}-submit\``,
    `- Links: \`.${p}-link\``,
    `- Überschriften: \`.${p}-heading .${p}-h1\` … \`.${p}-h4\`; Text: \`.${p}-text\`, \`.${p}-lead\`, \`.${p}-text--muted\``,
    `- Karten: \`.${p}-card\` mit \`.${p}-card__title\``,
    `- Formulare: \`.${p}-form\`, \`.${p}-field\`, \`.${p}-label\`, \`.${p}-input\` (input, textarea, select)`,
    `- Navigation: \`.${p}-nav\`, \`.${p}-nav__brand\`, \`.${p}-nav__links\`, \`.${p}-nav__link\` (aktiv: \`aria-current="page"\`), \`.${p}-nav__toggle\` (nur Optik)`,
    `- Footer: \`.${p}-footer\`, \`.${p}-footer__links\``,
    `- Layout: \`.${p}-container\`, \`.${p}-section\`, \`.${p}-grid\`, \`.${p}-stack\`, \`.${p}-row\``,
    "",
    "Beispiele: `examples/`. Die Navigation-Toggle-Schaltfläche ist rein gestalterisch; das Öffnen des Menüs müssen Sie selbst umsetzen.",
    "",
    "## Ebenen",
    "",
    `Das CSS nutzt Kaskadenebenen (\`@layer ${p}-tokens, ${p}-base, ${p}-imported, ${p}-components\`). Eigenes CSS ohne Ebene gewinnt immer gegen die erzeugten Regeln.`,
    "",
    "## Dateien",
    "",
    ...included.map((f) => `- ${FORMAT_NOTES[f]}`),
  ];
  if (omitted.length) {
    lines.push("", `Nicht enthalten (für Ihr Konto nicht freigeschaltet): ${omitted.join(", ")}.`);
  }
  lines.push(
    "",
    "## Barrierefreiheit",
    "",
    "Das Studio prüft Kontraste, Fokuszustände, Zielgrößen und Bewegung des Designsystems. Eine vollständige WCAG-Konformität der späteren Website kann es nicht garantieren — sie hängt von Inhalt, HTML-Struktur und Umsetzung ab.",
    "",
  );
  return lines.join("\n");
}

const FORMAT_NOTES: Record<ExportFormat, string> = {
  css: "`css/designsystem.css` — das vollständige Designsystem",
  variables: "`css/tokens.css` — nur die CSS Custom Properties (alle Themes)",
  html: "`examples/*.html` — Beispielseiten (Komponenten, Panel, Landingpage)",
  scss: "`scss/_designsystem.scss` — Sass-Variablen, Theme-Map und Komponenten (Dart Sass, `@use`)",
  json: "`tokens/design-tokens.json` — Design Tokens im DTCG-Format, inklusive Studio-Projekt zum erneuten Öffnen",
  tailwind: "`tailwind/tailwind.theme.css` (Tailwind CSS v4, `@theme`) und `tailwind/tailwind-v3.theme.json` (`theme.extend` für v3)",
  bootstrap: "`bootstrap/_bootstrap-overrides.scss` (vor Bootstrap 5.3 importieren) und `bootstrap/bootstrap-theme.css` (Laufzeit-Variablen)",
  zip: "dieses Paket",
};

// --- SCSS --------------------------------------------------------------------

function scss(r: ResolvedProject): string {
  const p = r.project.prefix;
  const t = r.tokens;
  const ts = typeScale(t);
  const sp = spaceScale(t);
  const sass = (v: string) => v.replace(/#\{/g, "# {");
  const lines = [
    `// ${r.project.name.replace(/[\r\n]/g, " ")} — Designsystem (SCSS)`,
    "// Erzeugt mit dem Designsystem-Studio (tools.tracht-digital.de). Dart Sass ≥ 1.33.",
    '@use "sass:map";',
    "",
    `$${p}-font-body: ${sass(t.font.body)} !default;`,
    `$${p}-font-heading: ${sass(t.font.heading)} !default;`,
    `$${p}-font-mono: ${sass(t.font.mono)} !default;`,
    `$${p}-line-height: ${t.font.lineHeight} !default;`,
    ...Object.entries(ts).map(([k, v]) => `$${p}-text-${k}: ${Math.round((v / 16) * 10000) / 10000}rem !default;`),
    ...sp.map((v, i) => `$${p}-space-${i + 1}: ${Math.round((v / 16) * 10000) / 10000}rem !default;`),
    `$${p}-radius-sm: ${t.radius.sm}px !default;`,
    `$${p}-radius-md: ${t.radius.md}px !default;`,
    `$${p}-radius-lg: ${t.radius.lg}px !default;`,
    `$${p}-radius-button: ${t.radius.button >= 999 ? 999 : t.radius.button}px !default;`,
    `$${p}-border-width: ${t.border.width}px !default;`,
    `$${p}-shadow-sm: ${sass(t.shadow.sm)} !default;`,
    `$${p}-shadow-md: ${sass(t.shadow.md)} !default;`,
    `$${p}-shadow-lg: ${sass(t.shadow.lg)} !default;`,
    `$${p}-duration: ${Math.round(t.motion.duration)}ms !default;`,
    `$${p}-easing: ${sass(t.motion.easing)} !default;`,
    "",
    `$${p}-themes: (`,
    ...r.themes.map(
      (th) => `  "${th.def.id}": (\n${COLOR_ROLES.map((role) => `    "${kebab(role)}": ${th.colors[role]},`).join("\n")}\n  ),`,
    ),
    ") !default;",
    "",
    `@mixin ${p}-theme($name) {`,
    `  @each $role, $value in map.get($${p}-themes, $name) {`,
    `    --${p}-color-#{$role}: #{$value};`,
    "  }",
    "}",
    "",
  ];
  // The emitted CSS is valid SCSS; its token layer is rebuilt from the
  // variables above so a `@use … with (…)` override reaches every rule.
  const light = autoTheme(r.themes, "light") ?? r.themes[0]!;
  const dark = autoTheme(r.themes, "dark");
  const tokenLayer = [
    ":root {",
    `  --${p}-font-body: #{$${p}-font-body};`,
    `  --${p}-font-heading: #{$${p}-font-heading};`,
    `  --${p}-font-mono: #{$${p}-font-mono};`,
    `  --${p}-line-height: #{$${p}-line-height};`,
    ...Object.keys(ts).map((k) => `  --${p}-text-${k}: #{$${p}-text-${k}};`),
    ...sp.map((_v, i) => `  --${p}-space-${i + 1}: #{$${p}-space-${i + 1}};`),
    ...["sm", "md", "lg", "button"].map((k) => `  --${p}-radius-${k}: #{$${p}-radius-${k}};`),
    `  --${p}-border-width: #{$${p}-border-width};`,
    ...["sm", "md", "lg"].map((k) => `  --${p}-shadow-${k}: #{$${p}-shadow-${k}};`),
    `  --${p}-duration: #{$${p}-duration};`,
    `  --${p}-easing: #{$${p}-easing};`,
    `  --${p}-container: ${Math.round((t.layout.container / 16) * 10000) / 10000}rem;`,
    `  --${p}-gutter: ${Math.round((t.layout.gutter / 16) * 10000) / 10000}rem;`,
    `  @include ${p}-theme("${light.def.id}");`,
    `  color-scheme: ${light.def.base};`,
    "}",
    ...(dark ? ["@media (prefers-color-scheme: dark) {", `  :root:not([data-theme]) { @include ${p}-theme("${dark.def.id}"); color-scheme: dark; }`, "}"] : []),
    `@each $name, $roles in $${p}-themes {`,
    `  [data-theme="#{$name}"] { @include ${p}-theme($name); }`,
    "}",
  ].join("\n");
  let out = lines.join("\n");
  out += `@layer ${p}-tokens, ${p}-base, ${p}-imported, ${p}-components;\n\n`;
  out += `@layer ${p}-tokens {\n${indent(tokenLayer)}\n}\n\n`;
  out += `@layer ${p}-base {\n${indent(baseCss(r))}}\n\n`;
  const preserved = (r.project.imported?.preservedCss ?? "").trim();
  if (preserved) out += `@layer ${p}-imported {\n${indent(sanitizeCss(preserved))}\n}\n\n`;
  out += `@layer ${p}-components {\n${indent(componentsCss(r))}}\n`;
  if (r.project.customCss.trim()) out += `\n// Eigene Regeln (höchste Priorität)\n${sanitizeCss(r.project.customCss.trim())}\n`;
  return out;
}

// --- JSON (DTCG) ---------------------------------------------------------------

const EASING: Record<string, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  linear: [0, 0, 1, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

function cubic(easing: string): [number, number, number, number] | null {
  if (EASING[easing]) return EASING[easing]!;
  const m = /cubic-bezier\(([^)]+)\)/.exec(easing);
  if (!m) return null;
  const n = m[1]!.split(",").map((x) => Number(x.trim()));
  return n.length === 4 && n.every(Number.isFinite) ? (n as [number, number, number, number]) : null;
}

const dim = (px: number) => ({ $type: "dimension", $value: { value: Math.round(px * 100) / 100, unit: "px" } });

function shadowToken(v: string) {
  const s = parseShadow(v);
  if (!s) return { $type: "shadow", $value: [] as unknown[], $description: "kein Schatten" };
  const c = parseColor(s.color);
  return {
    $type: "shadow",
    $value: {
      color: c ? toHex(c) : "#00000033",
      offsetX: { value: s.x, unit: "px" },
      offsetY: { value: s.y, unit: "px" },
      blur: { value: s.blur, unit: "px" },
      spread: { value: s.spread, unit: "px" },
      inset: s.inset,
    },
  };
}

const families = (stack: string) =>
  stack
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);

function tokensJson(r: ResolvedProject): string {
  const t = r.tokens;
  const ts = typeScale(t);
  const sp = spaceScale(t);
  const themeGroup = (th: ResolvedTheme) =>
    Object.fromEntries(COLOR_ROLES.map((role) => [kebab(role), { $type: "color", $value: th.colors[role] }]));
  const doc = {
    $description: `${r.project.name} — Design Tokens (DTCG). Erzeugt mit dem Designsystem-Studio.`,
    color: {
      brand: {
        primary: { $type: "color", $value: t.color.primary },
        secondary: { $type: "color", $value: t.color.secondary },
        accent: { $type: "color", $value: t.color.accent },
      },
    },
    theme: Object.fromEntries(r.themes.map((th) => [th.def.id, { $description: th.def.name, ...themeGroup(th) }])),
    font: {
      family: {
        body: { $type: "fontFamily", $value: families(t.font.body) },
        heading: { $type: "fontFamily", $value: families(t.font.heading) },
        mono: { $type: "fontFamily", $value: families(t.font.mono) },
      },
      size: Object.fromEntries(Object.entries(ts).map(([k, v]) => [k, dim(v)])),
      weight: {
        body: { $type: "fontWeight", $value: t.font.bodyWeight },
        heading: { $type: "fontWeight", $value: t.font.headingWeight },
      },
      "line-height": { $type: "number", $value: t.font.lineHeight },
    },
    space: Object.fromEntries(sp.map((v, i) => [String(i + 1), dim(v)])),
    radius: { sm: dim(t.radius.sm), md: dim(t.radius.md), lg: dim(t.radius.lg), button: dim(t.radius.button >= 999 ? 999 : t.radius.button) },
    border: { width: dim(t.border.width) },
    shadow: { sm: shadowToken(t.shadow.sm), md: shadowToken(t.shadow.md), lg: shadowToken(t.shadow.lg) },
    motion: {
      duration: { $type: "duration", $value: { value: Math.round(t.motion.duration), unit: "ms" } },
      ...(cubic(t.motion.easing) ? { easing: { $type: "cubicBezier", $value: cubic(t.motion.easing) } } : {}),
    },
    $extensions: {
      "de.tracht-digital.designsystem-studio": { project: r.project },
    },
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// --- Tailwind -------------------------------------------------------------------

function tailwindV4(r: ResolvedProject): string {
  const p = r.project.prefix;
  const colors = COLOR_ROLES.map((role) => `  --color-${kebab(role)}: var(--${p}-color-${kebab(role)});`);
  return `/*
 * ${r.project.name.replace(/\*\//g, "")} — Tailwind CSS v4
 * Nach Tailwind importieren:  @import "tailwindcss";  @import "./tailwind.theme.css";
 * Utilities wie bg-primary, text-on-primary, rounded-md, shadow-md, font-heading
 * lesen die Werte des Designsystems; das Theme schaltet über data-theme.
 */
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

@theme inline {
${colors.join("\n")}
  --font-sans: var(--${p}-font-body);
  --font-heading: var(--${p}-font-heading);
  --font-mono: var(--${p}-font-mono);
  --radius-sm: var(--${p}-radius-sm);
  --radius-md: var(--${p}-radius-md);
  --radius-lg: var(--${p}-radius-lg);
  --radius-button: var(--${p}-radius-button);
  --shadow-sm: var(--${p}-shadow-sm);
  --shadow-md: var(--${p}-shadow-md);
  --shadow-lg: var(--${p}-shadow-lg);
  --ease-ds: var(--${p}-easing);
}

${tokensCss(r)}
@layer base {
${indent(baseCss(r))}}

@layer components {
${indent(componentsCss(r))}}
${r.project.customCss.trim() ? `\n${sanitizeCss(r.project.customCss.trim())}\n` : ""}`;
}

function tailwindV3(r: ResolvedProject): string {
  const p = r.project.prefix;
  const doc = {
    $comment: "Tailwind CSS v3: in tailwind.config.js  theme: { extend: require('./tailwind-v3.theme.json').theme.extend }  und css/designsystem.css einbinden.",
    darkMode: ["selector", '[data-theme="dark"]'],
    theme: {
      extend: {
        colors: Object.fromEntries(COLOR_ROLES.map((role) => [kebab(role), `var(--${p}-color-${kebab(role)})`])),
        fontFamily: {
          sans: [`var(--${p}-font-body)`],
          heading: [`var(--${p}-font-heading)`],
          mono: [`var(--${p}-font-mono)`],
        },
        borderRadius: { sm: `var(--${p}-radius-sm)`, md: `var(--${p}-radius-md)`, lg: `var(--${p}-radius-lg)`, button: `var(--${p}-radius-button)` },
        boxShadow: { sm: `var(--${p}-shadow-sm)`, md: `var(--${p}-shadow-md)`, lg: `var(--${p}-shadow-lg)` },
        transitionTimingFunction: { ds: `var(--${p}-easing)` },
        maxWidth: { container: `var(--${p}-container)` },
      },
    },
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// --- Bootstrap 5.3 ----------------------------------------------------------------

const rgbTriplet = (c: string) => {
  const v = parseColor(c);
  return v ? `${Math.round(v.r)}, ${Math.round(v.g)}, ${Math.round(v.b)}` : "0, 0, 0";
};

function bootstrapScss(r: ResolvedProject): string {
  const t = r.tokens;
  const light = (autoTheme(r.themes, "light") ?? r.themes[0]!).colors;
  const dark = autoTheme(r.themes, "dark")?.colors;
  const btn = r.components.button.style;
  const shadowsOn = t.style.shadow !== "none";
  const rem = (px: number) => `${Math.round((px / 16) * 10000) / 10000}rem`;
  const sass = (v: string) => v.replace(/#\{/g, "# {");
  return `// ${r.project.name.replace(/[\r\n]/g, " ")} — Bootstrap 5.3 Theme-Anpassung
// VOR Bootstrap importieren:
//   @import "bootstrap-overrides";
//   @import "bootstrap/scss/bootstrap";

$primary: ${light.primary};
$secondary: ${light.secondary};
$success: ${light.success};
$warning: ${light.warning};
$danger: ${light.danger};
$info: ${light.accent};

$body-bg: ${light.background};
$body-color: ${light.text};
$body-secondary-color: ${light.muted};
$border-color: ${light.border};
$link-color: ${light.link};
$link-hover-color: ${light.linkHover};
$focus-ring-color: rgba(${rgbTriplet(light.focus)}, 0.5);

$font-family-sans-serif: ${sass(t.font.body)};
$headings-font-family: ${sass(t.font.heading)};
$headings-font-weight: ${t.font.headingWeight};
$font-size-base: ${rem(t.font.size)};
$line-height-base: ${t.font.lineHeight};

$border-width: ${t.border.width}px;
$border-radius: ${t.radius.md}px;
$border-radius-sm: ${t.radius.sm}px;
$border-radius-lg: ${t.radius.lg}px;
$border-radius-pill: 50rem;

$enable-shadows: ${shadowsOn};
$box-shadow-sm: ${shadowsOn ? sass(t.shadow.sm) : "none"};
$box-shadow: ${shadowsOn ? sass(t.shadow.md) : "none"};
$box-shadow-lg: ${shadowsOn ? sass(t.shadow.lg) : "none"};

$btn-padding-y: ${rem(btn.padding.top)};
$btn-padding-x: ${rem(btn.padding.left)};
$btn-font-weight: ${btn.fontWeight};
$btn-border-radius: ${t.radius.button >= 999 ? "50rem" : `${t.radius.button}px`};
$btn-transition: color ${t.motion.duration}ms ${sass(t.motion.easing)}, background-color ${t.motion.duration}ms ${sass(t.motion.easing)}, border-color ${t.motion.duration}ms ${sass(t.motion.easing)}, box-shadow ${t.motion.duration}ms ${sass(t.motion.easing)};

$input-bg: ${light.field};
$input-border-color: ${light.borderStrong};
$input-focus-border-color: ${light.focus};
$card-bg: ${light.surface};
$card-border-radius: ${t.radius.lg}px;
$navbar-light-color: ${light.text};
${
  dark
    ? `
// Dunkles Farbschema (data-bs-theme="dark")
$body-bg-dark: ${dark.background};
$body-color-dark: ${dark.text};
$body-secondary-color-dark: ${dark.muted};
$border-color-dark: ${dark.border};
$link-color-dark: ${dark.link};
$link-hover-color-dark: ${dark.linkHover};
`
    : ""
}`;
}

function bootstrapCss(r: ResolvedProject): string {
  const block = (sel: string, c: Record<string, string>) =>
    `${sel} {
  --bs-primary: ${c.primary};
  --bs-primary-rgb: ${rgbTriplet(c.primary!)};
  --bs-secondary: ${c.secondary};
  --bs-secondary-rgb: ${rgbTriplet(c.secondary!)};
  --bs-success: ${c.success};
  --bs-danger: ${c.danger};
  --bs-warning: ${c.warning};
  --bs-body-bg: ${c.background};
  --bs-body-bg-rgb: ${rgbTriplet(c.background!)};
  --bs-body-color: ${c.text};
  --bs-body-color-rgb: ${rgbTriplet(c.text!)};
  --bs-secondary-color: ${c.muted};
  --bs-border-color: ${c.border};
  --bs-link-color: ${c.link};
  --bs-link-color-rgb: ${rgbTriplet(c.link!)};
  --bs-link-hover-color: ${c.linkHover};
  --bs-link-hover-color-rgb: ${rgbTriplet(c.linkHover!)};
  --bs-focus-ring-color: rgba(${rgbTriplet(c.focus!)}, 0.5);
}
`;
  const t = r.tokens;
  const light = (autoTheme(r.themes, "light") ?? r.themes[0]!).colors;
  const dark = autoTheme(r.themes, "dark")?.colors;
  return `/* ${r.project.name.replace(/\*\//g, "")} — Bootstrap 5.3 Laufzeit-Theme (nach bootstrap.css einbinden) */
${block(':root, [data-bs-theme="light"]', light)}${dark ? block('[data-bs-theme="dark"]', dark) : ""}:root {
  --bs-body-font-family: ${t.font.body};
  --bs-body-line-height: ${t.font.lineHeight};
  --bs-border-width: ${t.border.width}px;
  --bs-border-radius: ${t.radius.md}px;
  --bs-border-radius-sm: ${t.radius.sm}px;
  --bs-border-radius-lg: ${t.radius.lg}px;
}
.btn-primary {
  --bs-btn-bg: ${light.primary};
  --bs-btn-border-color: ${light.primary};
  --bs-btn-color: ${light.onPrimary};
  --bs-btn-hover-bg: ${light.primaryHover};
  --bs-btn-hover-border-color: ${light.primaryHover};
  --bs-btn-hover-color: ${light.onPrimary};
  --bs-btn-active-bg: ${light.primaryActive};
  --bs-btn-active-border-color: ${light.primaryActive};
  --bs-btn-active-color: ${light.onPrimary};
  --bs-btn-border-radius: ${t.radius.button >= 999 ? "50rem" : `${t.radius.button}px`};
}
${dark ? `[data-bs-theme="dark"] .btn-primary {\n  --bs-btn-bg: ${dark.primary};\n  --bs-btn-border-color: ${dark.primary};\n  --bs-btn-color: ${dark.onPrimary};\n  --bs-btn-hover-bg: ${dark.primaryHover};\n  --bs-btn-hover-border-color: ${dark.primaryHover};\n  --bs-btn-hover-color: ${dark.onPrimary};\n}\n` : ""}`;
}

// --- registry ----------------------------------------------------------------------

export const ADAPTERS: Record<Exclude<ExportFormat, "zip">, ExportAdapter> = {
  css: {
    id: "css",
    label: { de: "CSS", en: "CSS" },
    description: { de: "Vollständiges Stylesheet mit Tokens, Themes und Komponenten", en: "Complete stylesheet with tokens, themes and components" },
    files: (r) => [{ path: "css/designsystem.css", mime: CSS, content: emitCss(r) }],
  },
  variables: {
    id: "variables",
    label: { de: "CSS Custom Properties", en: "CSS custom properties" },
    description: { de: "Nur die Variablen aller Themes", en: "The variables of every theme only" },
    files: (r) => [{ path: "css/tokens.css", mime: CSS, content: `/* ${r.project.name.replace(/\*\//g, "")} — CSS Custom Properties */\n${tokensCss(r)}` }],
  },
  html: {
    id: "html",
    label: { de: "HTML-Beispiele", en: "HTML examples" },
    description: { de: "Komponenten, Panel und Landingpage als HTML", en: "Components, panel and landing page as HTML" },
    files: (r) => [
      { path: "examples/components.html", mime: "text/html; charset=utf-8", content: exampleHtml(r, "components", "../css/designsystem.css") },
      { path: "examples/panel.html", mime: "text/html; charset=utf-8", content: exampleHtml(r, "panel", "../css/designsystem.css") },
      { path: "examples/landingpage.html", mime: "text/html; charset=utf-8", content: exampleHtml(r, "landing", "../css/designsystem.css") },
    ],
  },
  scss: {
    id: "scss",
    label: { de: "SCSS", en: "SCSS" },
    description: { de: "Sass-Variablen, Theme-Map und Komponenten", en: "Sass variables, theme map and components" },
    files: (r) => [{ path: "scss/_designsystem.scss", mime: "text/x-scss; charset=utf-8", content: scss(r) }],
  },
  json: {
    id: "json",
    label: { de: "JSON Design Tokens", en: "JSON design tokens" },
    description: { de: "DTCG-Format, lässt sich hier wieder öffnen", en: "DTCG format, can be reopened here" },
    files: (r) => [{ path: "tokens/design-tokens.json", mime: "application/json; charset=utf-8", content: tokensJson(r) }],
  },
  tailwind: {
    id: "tailwind",
    label: { de: "Tailwind CSS", en: "Tailwind CSS" },
    description: { de: "v4-Theme (@theme) und v3-Erweiterung", en: "v4 theme (@theme) and v3 extension" },
    files: (r) => [
      { path: "tailwind/tailwind.theme.css", mime: CSS, content: tailwindV4(r) },
      { path: "tailwind/tailwind-v3.theme.json", mime: "application/json; charset=utf-8", content: tailwindV3(r) },
    ],
  },
  bootstrap: {
    id: "bootstrap",
    label: { de: "Bootstrap 5.3", en: "Bootstrap 5.3" },
    description: { de: "Sass-Überschreibungen und Laufzeit-Variablen", en: "Sass overrides and runtime variables" },
    files: (r) => [
      { path: "bootstrap/_bootstrap-overrides.scss", mime: "text/x-scss; charset=utf-8", content: bootstrapScss(r) },
      { path: "bootstrap/bootstrap-theme.css", mime: CSS, content: bootstrapCss(r) },
    ],
  },
};

export const FORMAT_LABELS: Record<ExportFormat, { de: string; en: string }> = {
  ...Object.fromEntries(Object.values(ADAPTERS).map((a) => [a.id, a.label])),
  zip: { de: "Komplettpaket (ZIP)", en: "Complete package (ZIP)" },
} as Record<ExportFormat, { de: string; en: string }>;

export const FORMAT_DESCRIPTIONS: Record<ExportFormat, { de: string; en: string }> = {
  ...Object.fromEntries(Object.values(ADAPTERS).map((a) => [a.id, a.description])),
  zip: { de: "Alle freigeschalteten Formate plus README", en: "Every unlocked format plus a README" },
} as Record<ExportFormat, { de: string; en: string }>;

export interface DownloadFile {
  filename: string;
  mime: string;
  body: string | Uint8Array;
}

/**
 * The one file a download of `format` produces. `allowed` decides which
 * formats a ZIP may contain — a ZIP must not smuggle out a format the visitor
 * may not export on its own.
 */
export function buildExport(project: DesignProject, format: ExportFormat, allowed: readonly ExportFormat[] = EXPORT_FORMATS): DownloadFile {
  const r = resolveProject(project);
  const stem = fileStem(project.name);
  if (format === "zip") {
    const enc = new TextEncoder();
    const included = EXPORT_FORMATS.filter((f) => f !== "zip" && allowed.includes(f));
    const omitted = EXPORT_FORMATS.filter((f) => f !== "zip" && !allowed.includes(f));
    const files: ExportFile[] = [{ path: "README.md", mime: "text/markdown", content: readme(r, included, omitted) }];
    for (const f of included) files.push(...ADAPTERS[f as Exclude<ExportFormat, "zip">].files(r));
    // HTML examples link the full stylesheet; ship it whenever they ship.
    if (included.includes("html") && !included.includes("css")) files.push(...ADAPTERS.css.files(r));
    const body = createZip(files.map((f) => ({ path: `${stem}/${f.path}`, data: typeof f.content === "string" ? enc.encode(f.content) : f.content })));
    return { filename: `${stem}.zip`, mime: "application/zip", body };
  }
  const adapter = ADAPTERS[format];
  const files = adapter.files(r);
  if (format === "html") {
    // A single download must work on its own: inline the stylesheet.
    return { filename: `${stem}-komponenten.html`, mime: "text/html; charset=utf-8", body: exampleHtml(r, "components", null) };
  }
  const main = files[0]!;
  const ext = main.path.slice(main.path.lastIndexOf("."));
  const base = main.path.slice(main.path.lastIndexOf("/") + 1, main.path.lastIndexOf(".")).replace(/^_/, "");
  return { filename: `${stem}-${base}${ext}`, mime: main.mime, body: main.content };
}
