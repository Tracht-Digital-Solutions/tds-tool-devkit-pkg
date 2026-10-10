/**
 * The CSS emitter. Produces the design system's stylesheet from a resolved
 * project. Preview and export use this same function; the preview only asks
 * for two extras (state-simulation classes and a scaffold for its demo pages),
 * it never gets different component rules.
 *
 * Structure (lowest priority first):
 *
 *   @layer ds-tokens, ds-base, ds-imported, ds-components;
 *   …custom CSS last and unlayered, so it beats every generated rule.
 */

import { componentClass } from "./components";
import { COMPONENT_KINDS, type ComponentKind, type ComponentStyle, type StateStyle } from "./model";
import type { ResolvedProject } from "./resolve";
import { autoTheme, contrastTheme, COLOR_ROLES, type ResolvedTheme } from "./themes";
import { spaceScale, typeScale, type Tokens } from "./tokens";

export interface EmitOptions {
  /** Adds `.is-hover` / `.is-focus` / `.is-active` / `.is-disabled` selectors. */
  simulateStates?: boolean;
  /** Include the user's custom CSS (default true). */
  includeCustom?: boolean;
  /** Include preserved imported rules (default true). */
  includeImported?: boolean;
  /** Leading comment (default true). */
  header?: boolean;
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const r4 = (n: number) => Math.round(n * 10000) / 10000;
export const rem = (px: number) => (px === 0 ? "0" : `${r4(px / 16)}rem`);
const px = (n: number) => (n === 0 ? "0" : `${r4(n)}px`);

/**
 * Makes a user-supplied value safe to place inside a declaration: it cannot
 * close the block, start a new rule or break out of a `<style>` element.
 */
export function safeValue(v: string): string {
  return v.replace(/[;{}<>\\\n\r]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Neutralises the legacy script vectors CSS once had (IE `expression()`,
 * `behavior`, `-moz-binding`, `javascript:` URLs) and makes the text safe to
 * inline into a `<style>` element. Applied to every CSS the user brings.
 */
export function sanitizeCss(css: string): string {
  return css
    .replace(/expression\s*\(/gi, "invalid(")
    .replace(/-moz-binding\s*:/gi, "-invalid-binding:")
    .replace(/\bbehavior\s*:/gi, "-invalid-behavior:")
    .replace(/javascript\s*:/gi, "invalid:")
    .replace(/</g, "\\3c ");
}

interface Vars {
  prefix: string;
  tokens: Tokens;
  text: Record<string, number>;
  space: number[];
}

function fluid(size: number, base: number, on: boolean): string {
  if (!on || size <= base * 1.15) return rem(size);
  const max = size;
  const min = Math.max(base, size * 0.72);
  const slope = (max - min) / (1280 - 360);
  const intercept = min - slope * 360;
  return `clamp(${rem(min)}, ${r4(intercept / 16)}rem + ${r4(slope * 100)}vw, ${rem(max)})`;
}

function tokenDecls(v: Vars): string[] {
  const { prefix: p, tokens: t } = v;
  const out = [
    `--${p}-font-body: ${safeValue(t.font.body)};`,
    `--${p}-font-heading: ${safeValue(t.font.heading)};`,
    `--${p}-font-mono: ${safeValue(t.font.mono)};`,
    `--${p}-line-height: ${t.font.lineHeight};`,
  ];
  for (const [name, size] of Object.entries(v.text)) out.push(`--${p}-text-${name}: ${fluid(size, t.font.size, t.layout.fluid)};`);
  v.space.forEach((s, i) => out.push(`--${p}-space-${i + 1}: ${rem(s)};`));
  out.push(
    `--${p}-radius-sm: ${px(t.radius.sm)};`,
    `--${p}-radius-md: ${px(t.radius.md)};`,
    `--${p}-radius-lg: ${px(t.radius.lg)};`,
    `--${p}-radius-button: ${t.radius.button >= 999 ? "999px" : px(t.radius.button)};`,
    `--${p}-border-width: ${px(t.border.width)};`,
    `--${p}-shadow-sm: ${safeValue(t.shadow.sm)};`,
    `--${p}-shadow-md: ${safeValue(t.shadow.md)};`,
    `--${p}-shadow-lg: ${safeValue(t.shadow.lg)};`,
    `--${p}-duration: ${Math.round(t.motion.duration)}ms;`,
    `--${p}-easing: ${safeValue(t.motion.easing)};`,
    `--${p}-container: ${rem(t.layout.container)};`,
    `--${p}-gutter: ${rem(t.layout.gutter)};`,
  );
  return out;
}

function colorDecls(p: string, theme: ResolvedTheme): string[] {
  return [
    ...COLOR_ROLES.map((role) => `--${p}-color-${kebab(role)}: ${theme.colors[role]};`),
    `color-scheme: ${theme.def.base};`,
  ];
}

const block = (selector: string, decls: string[], indent = ""): string =>
  decls.length === 0
    ? ""
    : `${indent}${selector} {\n${decls.map((d) => `${indent}  ${d}`).join("\n")}\n${indent}}\n`;

/** Swaps a literal for the token variable it equals, so exports reuse tokens. */
function sizeVar(v: Vars, n: number, group: "text" | "space" | "radius"): string {
  const p = v.prefix;
  if (group === "text") {
    for (const [name, size] of Object.entries(v.text)) if (Math.abs(size - n) < 0.01) return `var(--${p}-text-${name})`;
    return rem(n);
  }
  if (group === "space") {
    const i = v.space.findIndex((s) => Math.abs(s - n) < 0.01);
    return i >= 0 ? `var(--${p}-space-${i + 1})` : rem(n);
  }
  const r = v.tokens.radius;
  if (n >= 999) return "999px";
  if (n === r.button && n !== 0) return `var(--${p}-radius-button)`;
  if (n === r.md && n !== 0) return `var(--${p}-radius-md)`;
  if (n === r.lg && n !== 0) return `var(--${p}-radius-lg)`;
  if (n === r.sm && n !== 0) return `var(--${p}-radius-sm)`;
  return px(n);
}

function shadowVar(v: Vars, s: string): string {
  const t = v.tokens.shadow;
  if (s === t.md && s !== "none") return `var(--${v.prefix}-shadow-md)`;
  if (s === t.sm && s !== "none") return `var(--${v.prefix}-shadow-sm)`;
  if (s === t.lg && s !== "none") return `var(--${v.prefix}-shadow-lg)`;
  return safeValue(s);
}

function fontVar(v: Vars, f: string): string {
  if (f === v.tokens.font.body) return `var(--${v.prefix}-font-body)`;
  if (f === v.tokens.font.heading) return `var(--${v.prefix}-font-heading)`;
  if (f === v.tokens.font.mono) return `var(--${v.prefix}-font-mono)`;
  return safeValue(f);
}

const eqSides = <T>(s: { top: T; right: T; bottom: T; left: T }) => s.top === s.right && s.top === s.bottom && s.top === s.left;

/** Kinds that need explicit resets (native controls carry UA borders/backgrounds). */
const CONTROL_KINDS = new Set<ComponentKind>(["button", "buttonSecondary", "formButton", "input", "card", "nav", "footer"]);

/**
 * `fixed` lists value groups the user set by hand (seed or override). Those are
 * written as literals: binding a hand-designed 14px corner to `--radius-lg`
 * because it happens to match would let a later token edit move it.
 */
export function styleDecls(style: ComponentStyle, kind: ComponentKind, v: Vars, fixed: Set<string> = new Set()): string[] {
  const d: string[] = [];
  const size = (n: number, group: "text" | "space" | "radius", path: string) =>
    fixed.has(path) ? (group === "radius" ? (n >= 999 ? "999px" : px(n)) : rem(n)) : sizeVar(v, n, group);
  const control = CONTROL_KINDS.has(kind);
  const bg = safeValue(style.background);
  if (style.gradientTo) d.push(`background: linear-gradient(${Math.round(style.gradientAngle)}deg, ${bg}, ${safeValue(style.gradientTo)});`);
  else if (bg && (bg !== "transparent" || control)) d.push(`background: ${bg};`);
  if (style.color && style.color !== "inherit") d.push(`color: ${safeValue(style.color)};`);
  d.push(`font-family: ${fixed.has("fontFamily") ? safeValue(style.fontFamily) : fontVar(v, style.fontFamily)};`);
  if (kind !== "link") d.push(`font-size: ${size(style.fontSize, "text", "fontSize")};`);
  d.push(`font-weight: ${Math.round(style.fontWeight)};`);
  if (kind !== "link") d.push(`line-height: ${style.lineHeight};`);
  if (style.letterSpacing) d.push(`letter-spacing: ${r4(style.letterSpacing)}em;`);
  if (style.textTransform !== "none") d.push(`text-transform: ${style.textTransform};`);
  if (["button", "buttonSecondary", "formButton"].includes(kind) || style.textAlign !== "left") d.push(`text-align: ${style.textAlign};`);

  const bw = style.borderWidth;
  const bc = style.borderColor;
  const bs = style.borderStyle;
  if (eqSides(bw) && eqSides(bc)) {
    if (bw.top > 0 && bs !== "none") d.push(`border: ${px(bw.top)} ${bs} ${safeValue(bc.top)};`);
    else if (control) d.push("border: 0;");
  } else {
    if (control) d.push("border: 0;");
    for (const side of ["top", "right", "bottom", "left"] as const) {
      if (bw[side] > 0 && bs !== "none") d.push(`border-${side}: ${px(bw[side])} ${bs} ${safeValue(bc[side])};`);
    }
  }

  const rc = style.radius;
  if (rc.tl === rc.tr && rc.tl === rc.br && rc.tl === rc.bl) {
    if (rc.tl > 0 || control) d.push(`border-radius: ${size(rc.tl, "radius", "radius")};`);
  } else {
    d.push(`border-radius: ${[rc.tl, rc.tr, rc.br, rc.bl].map((n) => size(n, "radius", "radius")).join(" ")};`);
  }

  const pd = style.padding;
  if (pd.top || pd.right || pd.bottom || pd.left || control) {
    const vals = [pd.top, pd.right, pd.bottom, pd.left].map((n) => size(n, "space", "padding"));
    d.push(`padding: ${vals[0] === vals[2] && vals[1] === vals[3] ? (vals[0] === vals[1] ? vals[0] : `${vals[0]} ${vals[1]}`) : vals.join(" ")};`);
  }
  if (style.minHeight > 0) d.push(`min-height: ${px(style.minHeight)};`);
  if (style.shadow && style.shadow !== "none") d.push(`box-shadow: ${fixed.has("shadow") ? safeValue(style.shadow) : shadowVar(v, style.shadow)};`);
  else if (control) d.push("box-shadow: none;");
  if (style.textShadow) d.push(`text-shadow: ${safeValue(style.textShadow)};`);
  if (style.filter) d.push(`filter: ${safeValue(style.filter)};`);
  if (style.opacity < 1) d.push(`opacity: ${r4(style.opacity)};`);
  if (style.transitionDuration > 0) {
    const dur = Math.round(style.transitionDuration) === Math.round(v.tokens.motion.duration) ? `var(--${v.prefix}-duration)` : `${Math.round(style.transitionDuration)}ms`;
    const ease = style.transitionEasing === v.tokens.motion.easing ? `var(--${v.prefix}-easing)` : safeValue(style.transitionEasing);
    d.push(
      `transition: ${["background-color", "color", "border-color", "box-shadow", "transform", "opacity", "text-decoration-color"]
        .map((prop) => `${prop} ${dur} ${ease}`)
        .join(", ")};`,
    );
  }
  if (style.animation !== "none") {
    const iter = style.animation === "pulse" ? "infinite" : "1";
    d.push(`animation: ${v.prefix}-${style.animation} ${style.animation === "pulse" ? 1600 : 400}ms ${safeValue(style.transitionEasing)} ${iter} both;`);
  }
  return d;
}

export function stateDecls(s: StateStyle, v: Vars, dashed = false): string[] {
  const d: string[] = [];
  if (s.background) d.push(`background: ${safeValue(s.background)};`);
  if (s.color) d.push(`color: ${safeValue(s.color)};`);
  if (s.borderColor) d.push(`border-color: ${safeValue(s.borderColor)};`);
  if (s.shadow) d.push(`box-shadow: ${shadowVar(v, s.shadow)};`);
  const parts: string[] = [];
  if (s.translateY) parts.push(`translateY(${px(s.translateY)})`);
  if (s.scale !== undefined && s.scale !== 1) parts.push(`scale(${r4(s.scale)})`);
  if (parts.length) d.push(`transform: ${parts.join(" ")};`);
  if (s.opacity !== undefined && s.opacity !== 1) d.push(`opacity: ${r4(s.opacity)};`);
  if (s.outlineWidth !== undefined && s.outlineWidth > 0) {
    d.push(`outline: ${px(s.outlineWidth)} ${dashed ? "dashed" : "solid"} ${safeValue(s.outlineColor ?? "currentColor")};`);
    d.push(`outline-offset: ${px(s.outlineOffset ?? 2)};`);
  }
  return d;
}

/** Extra structural declarations per component class (not user-tunable). */
function structural(kind: ComponentKind, v: Vars): string[] {
  switch (kind) {
    case "button":
    case "formButton":
    case "buttonSecondary":
      return [
        "display: inline-flex;",
        "align-items: center;",
        "justify-content: center;",
        "gap: 0.5em;",
        "cursor: pointer;",
        "text-decoration: none;",
        "-webkit-appearance: none;",
        "appearance: none;",
        "max-width: 100%;",
      ];
    case "link":
      return ["text-decoration: underline;", "text-decoration-thickness: 1px;", "text-underline-offset: 0.18em;", "cursor: pointer;"];
    case "heading":
      return ["margin: 0;", "text-wrap: balance;"];
    case "text":
      return ["margin: 0;", "max-width: 68ch;"];
    case "card":
      return ["display: block;", "min-width: 0;"];
    case "input":
      return ["display: block;", "width: 100%;", "max-width: 100%;", "font: inherit;", `font-size: ${sizeVar(v, v.text.base!, "text")};`];
    case "label":
      return ["display: block;"];
    case "nav":
      return ["display: flex;", "flex-wrap: wrap;", "align-items: center;", "justify-content: space-between;", `gap: var(--${v.prefix}-space-3);`];
    case "footer":
      return ["display: block;"];
  }
}

export function componentSelector(prefix: string, kind: ComponentKind): string {
  const cls = `.${componentClass(prefix, kind)}`;
  return kind === "buttonSecondary" ? `.${prefix}-btn${cls}` : cls;
}

function withStates(sel: string, pseudo: string, sim: string | null): string {
  return sim ? `${sel}${pseudo}, ${sel}${sim}` : `${sel}${pseudo}`;
}

function componentCss(r: ResolvedProject, kind: ComponentKind, v: Vars, sim: boolean): string {
  const p = r.project.prefix;
  const comp = r.components[kind];
  const s = comp.style;
  const sel = componentSelector(p, kind);
  const dashed = r.tokens.style.focus === "dashed";
  // Nav and footer states apply to their links, not to the bar itself.
  const stateSel = kind === "nav" ? `.${p}-nav__link` : kind === "footer" ? `.${p}-footer a` : sel;
  const fixed = new Set(Object.keys(comp.source).map((k) => k.split(".")[0]!));
  let out = block(sel, [...structural(kind, v), ...styleDecls(s, kind, v, fixed)]);
  if (kind === "input") out += block(`${sel}::placeholder`, [`color: var(--${p}-color-muted);`, "opacity: 1;"]);
  if (kind === "link") out += block(withStates(sel, ":hover", sim ? ".is-hover" : null), ["text-decoration-thickness: 2px;"]);
  const hover = stateDecls(s.states.hover, v);
  if (hover.length) out += block(withStates(stateSel, ":hover", sim ? ".is-hover" : null), hover);
  const focus = stateDecls(s.states.focus, v, dashed);
  if (focus.length) {
    out += block(`${stateSel}:focus`, ["outline: none;"]);
    out += block(withStates(stateSel, ":focus-visible", sim ? ".is-focus" : null), focus);
  }
  const active = stateDecls(s.states.active, v);
  if (active.length) out += block(withStates(stateSel, ":active", sim ? ".is-active" : null), active);
  const disabled = stateDecls(s.states.disabled, v);
  if (disabled.length && !["heading", "text", "label", "nav", "footer", "card"].includes(kind)) {
    const dsel = `${sel}:disabled, ${sel}[aria-disabled="true"]${sim ? `, ${sel}.is-disabled` : ""}`;
    out += block(dsel, [...disabled, "cursor: not-allowed;", "transform: none;"]);
  }
  return out;
}

function partsCss(r: ResolvedProject, v: Vars): string {
  const p = r.project.prefix;
  const t = r.tokens;
  const heading = r.components.heading.style;
  const bp = rem(t.layout.navBreakpoint);
  let out = "";
  const sizes: Array<[string, string]> = [
    ["h1", "3xl"],
    ["h2", "2xl"],
    ["h3", "xl"],
    ["h4", "lg"],
  ];
  for (const [h, step] of sizes) out += block(`.${p}-${h}`, [`font-size: var(--${p}-text-${step});`]);
  out += block(`.${p}-text--muted`, [`color: var(--${p}-color-muted);`]);
  out += block(`.${p}-lead`, [`font-size: var(--${p}-text-lg);`]);
  out += block(`.${p}-card__title`, [
    "margin: 0 0 0.5em;",
    `font-family: ${fontVar(v, heading.fontFamily)};`,
    `font-weight: ${Math.round(heading.fontWeight)};`,
    `font-size: var(--${p}-text-lg);`,
    `line-height: ${heading.lineHeight};`,
  ]);
  out += block(`.${p}-nav__brand`, [
    `font-family: var(--${p}-font-heading);`,
    "font-weight: 700;",
    `font-size: var(--${p}-text-lg);`,
    "color: inherit;",
    "text-decoration: none;",
  ]);
  out += block(`.${p}-nav__links`, ["display: flex;", "flex-wrap: wrap;", `gap: var(--${p}-space-1);`, "margin: 0;", "padding: 0;", "list-style: none;"]);
  out += block(`.${p}-nav__link`, [
    "display: inline-flex;",
    "align-items: center;",
    "min-height: 44px;",
    `padding: 0 var(--${p}-space-3);`,
    `border-radius: var(--${p}-radius-sm);`,
    "color: inherit;",
    "text-decoration: none;",
    `transition: color var(--${p}-duration) var(--${p}-easing), background-color var(--${p}-duration) var(--${p}-easing);`,
  ]);
  out += block(`.${p}-nav__link[aria-current="page"]`, [
    `color: var(--${p}-color-link);`,
    "font-weight: 600;",
    "text-decoration: underline;",
    "text-underline-offset: 0.3em;",
  ]);
  out += block(`.${p}-nav__toggle`, [
    "display: none;",
    "width: 44px;",
    "height: 44px;",
    `border-radius: var(--${p}-radius-sm);`,
    `background: linear-gradient(currentColor, currentColor) center calc(50% - 7px) / 22px 2px no-repeat, linear-gradient(currentColor, currentColor) center / 22px 2px no-repeat, linear-gradient(currentColor, currentColor) center calc(50% + 7px) / 22px 2px no-repeat;`,
    "border: 0;",
    "color: inherit;",
  ]);
  out += block(`.${p}-footer__links`, ["display: flex;", "flex-wrap: wrap;", `gap: var(--${p}-space-2) var(--${p}-space-4);`, "margin: 0;", "padding: 0;", "list-style: none;"]);
  out += block(`.${p}-footer a`, ["color: inherit;", "text-underline-offset: 0.18em;"]);
  // Responsive: automatic, one global breakpoint for the navigation, fluid
  // everything else. No per-component breakpoints by design.
  out +=
    `@media (max-width: ${bp}) {\n` +
    block(`.${p}-nav__toggle`, ["display: inline-block;"], "  ") +
    block(`.${p}-nav__links`, ["order: 3;", "width: 100%;", "flex-wrap: nowrap;", "overflow-x: auto;", "scrollbar-width: thin;"], "  ") +
    "}\n";
  out += `@media (max-width: 30em) {\n` + block(`.${p}-submit, .${p}-form .${p}-btn`, ["width: 100%;"], "  ") + "}\n";
  return out;
}

export function baseCss(r: ResolvedProject): string {
  const p = r.project.prefix;
  let out = "";
  out += block(`.${p}-body`, [
    "margin: 0;",
    `background: var(--${p}-color-background);`,
    `color: var(--${p}-color-text);`,
    `font-family: var(--${p}-font-body);`,
    `font-size: var(--${p}-text-base);`,
    `font-weight: ${r.tokens.font.bodyWeight};`,
    `line-height: var(--${p}-line-height);`,
    "-webkit-text-size-adjust: 100%;",
    "text-rendering: optimizeLegibility;",
  ]);
  out += block(`.${p}-body *, .${p}-body *::before, .${p}-body *::after`, ["box-sizing: border-box;"]);
  out += block(`.${p}-body ::selection`, [`background: color-mix(in srgb, var(--${p}-color-primary) 25%, transparent);`]);
  out += block(`.${p}-container`, [`width: min(100% - 2 * var(--${p}-gutter), var(--${p}-container));`, "margin-inline: auto;"]);
  out += block(`.${p}-section`, [`padding-block: clamp(var(--${p}-space-6), 8vw, var(--${p}-space-8));`]);
  out += block(`.${p}-stack > * + *`, [`margin-block-start: var(--${p}-space-3);`]);
  out += block(`.${p}-grid`, [
    "display: grid;",
    `gap: var(--${p}-space-4);`,
    "grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));",
  ]);
  out += block(`.${p}-form`, ["display: grid;", `gap: var(--${p}-space-4);`]);
  out += block(`.${p}-field`, ["display: grid;", `gap: var(--${p}-space-1);`]);
  out += block(`.${p}-row`, ["display: flex;", "flex-wrap: wrap;", "align-items: center;", `gap: var(--${p}-space-3);`]);
  out +=
    "@media (prefers-reduced-motion: reduce) {\n" +
    block(
      `.${p}-body *, .${p}-body *::before, .${p}-body *::after`,
      ["animation-duration: 0.01ms !important;", "animation-iteration-count: 1 !important;", "transition-duration: 0.01ms !important;", "scroll-behavior: auto !important;"],
      "  ",
    ) +
    "}\n";
  return out;
}

function keyframes(r: ResolvedProject): string {
  const p = r.project.prefix;
  const used = new Set(COMPONENT_KINDS.map((k) => r.components[k].style.animation).filter((a) => a !== "none"));
  let out = "";
  if (used.has("fade-in")) out += `@keyframes ${p}-fade-in {\n  from { opacity: 0; }\n  to { opacity: 1; }\n}\n`;
  if (used.has("slide-up")) out += `@keyframes ${p}-slide-up {\n  from { opacity: 0; transform: translateY(8px); }\n  to { opacity: 1; transform: none; }\n}\n`;
  if (used.has("pulse")) out += `@keyframes ${p}-pulse {\n  0%, 100% { transform: scale(1); }\n  50% { transform: scale(1.04); }\n}\n`;
  return out;
}

export const indent = (css: string) =>
  css
    .split("\n")
    .map((l) => (l ? `  ${l}` : l))
    .join("\n");

export function vars(r: ResolvedProject): Vars {
  return { prefix: r.project.prefix, tokens: r.tokens, text: typeScale(r.tokens), space: spaceScale(r.tokens) };
}

/** Token custom properties for every theme (used alone by the "variables" export). */
export function tokensCss(r: ResolvedProject): string {
  const p = r.project.prefix;
  const v = vars(r);
  const light = autoTheme(r.themes, "light") ?? r.themes[0];
  const dark = autoTheme(r.themes, "dark");
  let out = "";
  out += block(":root", [...tokenDecls(v), ...(light ? colorDecls(p, light) : [])]);
  if (dark) out += `@media (prefers-color-scheme: dark) {\n${block(":root:not([data-theme])", colorDecls(p, dark), "  ")}}\n`;
  const lightMore = contrastTheme(r.themes, "light");
  const darkMore = contrastTheme(r.themes, "dark");
  if (lightMore) out += `@media (prefers-contrast: more) {\n${block(":root:not([data-theme])", colorDecls(p, lightMore), "  ")}}\n`;
  if (darkMore) out += `@media (prefers-contrast: more) and (prefers-color-scheme: dark) {\n${block(":root:not([data-theme])", colorDecls(p, darkMore), "  ")}}\n`;
  for (const theme of r.themes) out += block(`[data-theme="${theme.def.id}"]`, colorDecls(p, theme));
  return out;
}

/** CSS of one component (with its states), for the "copy this component" view. */
export function singleComponentCss(r: ResolvedProject, kind: ComponentKind): string {
  return componentCss(r, kind, vars(r), false);
}

/** Every component rule, their parts, the responsive rules and keyframes. */
export function componentsCss(r: ResolvedProject, simulateStates = false): string {
  const v = vars(r);
  let out = "";
  for (const kind of COMPONENT_KINDS) out += componentCss(r, kind, v, simulateStates);
  out += partsCss(r, v);
  out += keyframes(r);
  return out;
}

export function emitCss(r: ResolvedProject, opts: EmitOptions = {}): string {
  const p = r.project.prefix;
  const sim = opts.simulateStates === true;
  const head =
    opts.header === false
      ? ""
      : `/*\n * ${safeValue(r.project.name).replace(/\*\//g, "")} — Designsystem\n * Erzeugt mit dem Designsystem-Studio (tools.tracht-digital.de).\n * Reines CSS, keine Abhängigkeiten. Themes: ${r.themes.map((t) => t.def.id).join(", ")}.\n * Theme wählen: <html data-theme="…">, ohne Attribut folgt es dem System.\n */\n`;
  const components = componentsCss(r, sim);
  let css = head;
  css += `@layer ${p}-tokens, ${p}-base, ${p}-imported, ${p}-components;\n\n`;
  css += `@layer ${p}-tokens {\n${indent(tokensCss(r))}}\n\n`;
  css += `@layer ${p}-base {\n${indent(baseCss(r))}}\n\n`;
  const preserved = opts.includeImported === false ? "" : (r.project.imported?.preservedCss ?? "").trim();
  if (preserved) css += `@layer ${p}-imported {\n${indent(sanitizeCss(preserved))}\n}\n\n`;
  css += `@layer ${p}-components {\n${indent(components)}}\n`;
  const custom = opts.includeCustom === false ? "" : r.project.customCss.trim();
  if (custom) css += `\n/* Eigene Regeln (höchste Priorität) */\n${sanitizeCss(custom)}\n`;
  return css;
}
