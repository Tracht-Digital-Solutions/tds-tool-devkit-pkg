/**
 * Importers: CSS files, HTML/CSS components, JSON design tokens and the style
 * data of one fetched web page all end up as the same thing — a seed component
 * plus a list of imported token values, each with a confidence and a source.
 *
 * Nothing is invented. A value that cannot be read stays out of `values`; the
 * generator then derives it and the UI marks it as derived, not as found.
 */

import { describe, normalizeColor, parseColor } from "./color";
import { flattenRules, parseCss, specificity, splitSelectorList, stringify, stripState, type Declaration, type FlatRule, type Node } from "./cssParser";
import {
  ANIMATIONS,
  BORDER_STYLES,
  SCHEMA_VERSION,
  defaultStyle,
  newProject,
  parseProject,
  type ComponentStyle,
  type Confidence,
  type DesignProject,
  type ImportInfo,
  type ImportedValue,
  type SeedKind,
  type StateStyle,
} from "./model";
import { sanitizeHtml, type ParseHtml, browserParse } from "./sanitize";

export interface ImportResult {
  project: DesignProject;
  /** Messages for the user (German). */
  notes: string[];
  /** Parse problems in the imported CSS. */
  issues: string[];
  /** For component imports: the sanitised reference markup. */
  referenceHtml?: string;
}

type Decl = { prop: string; value: string };

const MAX_INPUT = 1_000_000;

// --- value parsing ------------------------------------------------------------

/** Resolves `var(--x, fallback)` against a custom-property map. */
export function resolveVars(value: string, props: Record<string, string>, depth = 0): string {
  if (depth > 8 || !value.includes("var(")) return value;
  let out = "";
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf("var(", i);
    if (at < 0) {
      out += value.slice(i);
      break;
    }
    out += value.slice(i, at);
    let d = 0;
    let j = at + 4;
    for (; j < value.length; j++) {
      if (value[j] === "(") d++;
      else if (value[j] === ")") {
        if (d === 0) break;
        d--;
      }
    }
    const inner = value.slice(at + 4, j);
    const comma = inner.indexOf(",");
    const name = (comma >= 0 ? inner.slice(0, comma) : inner).trim();
    const fallback = comma >= 0 ? inner.slice(comma + 1).trim() : "";
    const found = props[name];
    out += resolveVars(found !== undefined ? found : fallback, props, depth + 1);
    i = j + 1;
  }
  return out;
}

/** A length in px; `em` is taken relative to `em`, `%` and unknown units give null. */
export function lengthPx(token: string | undefined, em = 16): number | null {
  if (!token) return null;
  const t = token.trim().toLowerCase();
  if (t === "0") return 0;
  const m = /^(-?\d*\.?\d+)(px|rem|em|pt)?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2]) {
    case "rem":
      return n * 16;
    case "em":
      return n * em;
    case "pt":
      return (n * 4) / 3;
    case undefined:
      return n === 0 ? 0 : null;
    default:
      return n;
  }
}

/** Splits a value on top-level whitespace. */
function words(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value.trim()) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function fourSides(value: string, em: number): [number, number, number, number] | null {
  const parts = words(value).map((w) => lengthPx(w, em));
  if (parts.some((p) => p === null) || parts.length === 0 || parts.length > 4) return null;
  const [a, b = a, c = a, d = b] = parts as number[];
  return [a!, b!, c!, d!];
}

const firstColor = (value: string): string | null => {
  for (const w of words(value.replace(/,/g, " , "))) if (parseColor(w)) return w;
  return null;
};

function parseBorder(value: string, em: number): { width?: number; style?: string; color?: string } {
  const out: { width?: number; style?: string; color?: string } = {};
  for (const w of words(value)) {
    const lw = w === "thin" ? 1 : w === "medium" ? 3 : w === "thick" ? 5 : lengthPx(w, em);
    if (lw !== null && out.width === undefined) out.width = lw;
    else if ((BORDER_STYLES as readonly string[]).includes(w) || ["hidden", "groove", "ridge", "inset", "outset"].includes(w)) out.style = w;
    else if (parseColor(w)) out.color = w;
  }
  return out;
}

function parseGradient(value: string): { from: string; to: string; angle: number } | null {
  const m = /linear-gradient\((.*)\)/i.exec(value);
  if (!m) return null;
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of m[1]!) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  parts.push(cur.trim());
  let angle = 180;
  const first = parts[0] ?? "";
  if (/deg$/.test(first)) angle = Number.parseFloat(first);
  else if (/^to /.test(first)) angle = ({ "to top": 0, "to right": 90, "to bottom": 180, "to left": 270 } as Record<string, number>)[first] ?? 135;
  const colors = parts.map((p) => firstColor(p)).filter((c): c is string => !!c);
  if (colors.length < 2) return null;
  return { from: colors[0]!, to: colors[colors.length - 1]!, angle };
}

function parseTransform(value: string): { translateY?: number; scale?: number } {
  const out: { translateY?: number; scale?: number } = {};
  const ty = /translateY\(\s*(-?[\d.]+)px\s*\)/i.exec(value) ?? /translate\(\s*[^,]+,\s*(-?[\d.]+)px\s*\)/i.exec(value);
  if (ty) out.translateY = Number(ty[1]);
  const sc = /scale\(\s*([\d.]+)\s*\)/i.exec(value);
  if (sc) out.scale = Number(sc[1]);
  return out;
}

function parseDuration(value: string): number | null {
  const m = /(\d*\.?\d+)(ms|s)\b/.exec(value);
  if (!m) return null;
  return m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1]);
}

/** Applies an ordered list of declarations to a component style (later wins). */
export function applyDecls(style: ComponentStyle, decls: Decl[], notes?: Set<string>): ComponentStyle {
  const s: ComponentStyle = JSON.parse(JSON.stringify(style)) as ComponentStyle;
  let em = s.fontSize;
  for (const { prop, value } of decls) {
    const v = value.trim();
    switch (prop) {
      case "background":
      case "background-color":
      case "background-image": {
        const g = parseGradient(v);
        if (g) {
          s.background = g.from;
          s.gradientTo = g.to;
          s.gradientAngle = g.angle;
        } else if (v === "none" || v === "transparent") {
          if (prop !== "background-image") {
            s.background = "transparent";
            s.gradientTo = "";
          }
        } else {
          const c = firstColor(v);
          if (c) {
            s.background = c;
            s.gradientTo = "";
          } else if (/url\(/i.test(v)) notes?.add("Hintergrundbilder werden nicht übernommen.");
        }
        break;
      }
      case "color":
        if (parseColor(v)) s.color = v;
        break;
      case "font-family":
        s.fontFamily = v;
        break;
      case "font-size": {
        const px = lengthPx(v, em);
        if (px) {
          s.fontSize = px;
          em = px;
        }
        break;
      }
      case "font-weight": {
        const w = v === "bold" ? 700 : v === "normal" ? 400 : Number(v);
        if (Number.isFinite(w) && w >= 100 && w <= 1000) s.fontWeight = w;
        break;
      }
      case "line-height": {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) s.lineHeight = n;
        else {
          const px = lengthPx(v, em);
          if (px) s.lineHeight = Math.round((px / em) * 100) / 100;
        }
        break;
      }
      case "letter-spacing": {
        if (v === "normal") s.letterSpacing = 0;
        else if (v.endsWith("em") && !v.endsWith("rem")) s.letterSpacing = Number.parseFloat(v);
        else {
          const px = lengthPx(v, em);
          if (px !== null) s.letterSpacing = Math.round((px / em) * 1000) / 1000;
        }
        break;
      }
      case "text-transform":
        if (["none", "uppercase", "lowercase", "capitalize"].includes(v)) s.textTransform = v as ComponentStyle["textTransform"];
        break;
      case "text-align":
        if (v === "left" || v === "center" || v === "right") s.textAlign = v;
        else if (v === "start") s.textAlign = "left";
        break;
      case "border":
      case "border-top":
      case "border-right":
      case "border-bottom":
      case "border-left": {
        const b = parseBorder(v, em);
        const sides = prop === "border" ? (["top", "right", "bottom", "left"] as const) : ([prop.slice(7)] as Array<"top" | "right" | "bottom" | "left">);
        if (v === "none" || v === "0") for (const side of sides) s.borderWidth[side] = 0;
        for (const side of sides) {
          if (b.width !== undefined) s.borderWidth[side] = b.width;
          if (b.color) s.borderColor[side] = b.color;
        }
        if (b.style) s.borderStyle = (BORDER_STYLES as readonly string[]).includes(b.style) ? (b.style as ComponentStyle["borderStyle"]) : "solid";
        if (b.style === "none") for (const side of sides) s.borderWidth[side] = 0;
        break;
      }
      case "border-width": {
        const f = fourSides(v, em);
        if (f) [s.borderWidth.top, s.borderWidth.right, s.borderWidth.bottom, s.borderWidth.left] = f;
        break;
      }
      case "border-color": {
        const cs = words(v).filter((w) => parseColor(w));
        if (cs.length) {
          const [a, b = a, c = a, d = b] = cs;
          s.borderColor = { top: a!, right: b!, bottom: c!, left: d! };
        }
        break;
      }
      case "border-style": {
        const st = words(v)[0] ?? "solid";
        s.borderStyle = (BORDER_STYLES as readonly string[]).includes(st) ? (st as ComponentStyle["borderStyle"]) : "solid";
        break;
      }
      case "border-top-width":
      case "border-right-width":
      case "border-bottom-width":
      case "border-left-width": {
        const px = lengthPx(v, em);
        if (px !== null) s.borderWidth[prop.split("-")[1] as "top"] = px;
        break;
      }
      case "border-top-color":
      case "border-right-color":
      case "border-bottom-color":
      case "border-left-color":
        if (parseColor(v)) s.borderColor[prop.split("-")[1] as "top"] = v;
        break;
      case "border-radius": {
        const main = v.split("/")[0]!.trim();
        if (/%/.test(main)) {
          s.radius = { tl: 9999, tr: 9999, br: 9999, bl: 9999 };
          break;
        }
        const f = fourSides(main, em);
        if (f) s.radius = { tl: f[0], tr: f[1], br: f[2], bl: f[3] };
        break;
      }
      case "border-top-left-radius":
      case "border-top-right-radius":
      case "border-bottom-right-radius":
      case "border-bottom-left-radius": {
        const px = lengthPx(words(v)[0], em);
        const key = ({ "border-top-left-radius": "tl", "border-top-right-radius": "tr", "border-bottom-right-radius": "br", "border-bottom-left-radius": "bl" } as const)[prop];
        if (px !== null) s.radius[key] = px;
        break;
      }
      case "padding": {
        const f = fourSides(v, em);
        if (f) s.padding = { top: f[0], right: f[1], bottom: f[2], left: f[3] };
        break;
      }
      case "padding-top":
      case "padding-right":
      case "padding-bottom":
      case "padding-left": {
        const px = lengthPx(v, em);
        if (px !== null) s.padding[prop.slice(8) as "top"] = px;
        break;
      }
      case "padding-block":
      case "padding-inline": {
        const f = words(v).map((w) => lengthPx(w, em));
        if (f[0] != null) {
          const a = f[0];
          const b = f[1] ?? a;
          if (prop === "padding-block") [s.padding.top, s.padding.bottom] = [a, b];
          else [s.padding.left, s.padding.right] = [a, b];
        }
        break;
      }
      case "min-height":
      case "height": {
        const px = lengthPx(v, em);
        if (px !== null && px < 200) s.minHeight = px;
        break;
      }
      case "box-shadow":
        s.shadow = v;
        break;
      case "text-shadow":
        s.textShadow = v === "none" ? "" : v;
        break;
      case "filter":
        s.filter = v === "none" ? "" : v;
        break;
      case "opacity": {
        const n = Number(v);
        if (Number.isFinite(n)) s.opacity = Math.min(1, Math.max(0, n));
        break;
      }
      case "transition":
      case "transition-duration": {
        const d = parseDuration(v);
        if (d !== null) s.transitionDuration = d;
        const ease = /(ease-in-out|ease-in|ease-out|ease|linear|cubic-bezier\([^)]*\))/.exec(v);
        if (ease) s.transitionEasing = ease[1]!;
        break;
      }
      case "transition-timing-function":
        s.transitionEasing = v;
        break;
      case "animation":
      case "animation-name": {
        const name = (ANIMATIONS as readonly string[]).find((a) => a !== "none" && v.includes(a));
        if (name) s.animation = name as ComponentStyle["animation"];
        else if (v !== "none") notes?.add("Eigene Keyframe-Animationen werden nicht nachgebildet.");
        break;
      }
    }
  }
  return s;
}

function applyStateDecls(state: StateStyle, decls: Decl[]): StateStyle {
  const s: StateStyle = { ...state };
  for (const { prop, value } of decls) {
    const v = value.trim();
    if (prop === "background" || prop === "background-color") {
      const c = firstColor(v);
      if (c) s.background = c;
    } else if (prop === "color" && parseColor(v)) s.color = v;
    else if (prop === "border-color" && firstColor(v)) s.borderColor = firstColor(v)!;
    else if (prop === "border" && parseBorder(v, 16).color) s.borderColor = parseBorder(v, 16).color;
    else if (prop === "box-shadow") s.shadow = v;
    else if (prop === "transform") Object.assign(s, parseTransform(v));
    else if (prop === "opacity" && Number.isFinite(Number(v))) s.opacity = Number(v);
    else if (prop === "outline") {
      if (v === "none" || v === "0") s.outlineWidth = 0;
      else {
        const b = parseBorder(v, 16);
        if (b.width !== undefined) s.outlineWidth = b.width;
        if (b.color) s.outlineColor = b.color;
      }
    } else if (prop === "outline-width") s.outlineWidth = lengthPx(v) ?? s.outlineWidth;
    else if (prop === "outline-color" && parseColor(v)) s.outlineColor = v;
    else if (prop === "outline-offset") s.outlineOffset = lengthPx(v) ?? s.outlineOffset;
  }
  return s;
}

// --- cascade ----------------------------------------------------------------

const INHERITED = ["color", "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-transform", "text-align"];

/** Whether a rule's at-rule context applies to a default desktop, light screen. */
function contextApplies(context: string[]): boolean {
  return context.every((c) => {
    if (!c.startsWith("media")) return !c.startsWith("container") && !c.startsWith("starting-style");
    const q = c.slice(5).toLowerCase();
    if (/print|speech|prefers-color-scheme:\s*dark|max-width|max-device-width|hover:\s*none|pointer:\s*coarse|prefers-contrast|forced-colors/.test(q)) return false;
    return true;
  });
}

function safeMatches(el: Element, selector: string): boolean {
  if (/::|:(hover|focus|active|visited|focus-visible|focus-within|target)\b/.test(selector)) return false;
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

export interface Cascade {
  base: Decl[];
  hover: Decl[];
  focus: Decl[];
  active: Decl[];
  disabled: Decl[];
  /** How many rules matched (0 = nothing styled this element directly). */
  matched: number;
}

/** Collects the declarations that apply to `el`, in cascade order (lowest first). */
export function cascadeFor(el: Element, rules: FlatRule[], props: Record<string, string>): Cascade {
  type E = { prop: string; value: string; important: boolean; spec: [number, number, number]; order: number };
  const buckets: Record<"base" | "hover" | "focus" | "active" | "disabled", E[]> = { base: [], hover: [], focus: [], active: [], disabled: [] };
  let matched = 0;
  for (const rule of rules) {
    if (!contextApplies(rule.context)) continue;
    for (const sel of splitSelectorList(rule.selector)) {
      const { base, state } = stripState(sel);
      const bucket = state === null ? "base" : state === "hover" ? "hover" : state.startsWith("focus") ? "focus" : state === "active" ? "active" : "disabled";
      if (!safeMatches(el, base || "*")) continue;
      matched++;
      const spec = specificity(sel);
      for (const d of rule.decls) {
        buckets[bucket].push({ prop: d.prop, value: resolveVars(d.value, props), important: d.important, spec, order: rule.order });
      }
    }
  }
  const sort = (list: E[]) =>
    list
      .sort((a, b) => Number(a.important) - Number(b.important) || a.spec[0] - b.spec[0] || a.spec[1] - b.spec[1] || a.spec[2] - b.spec[2] || a.order - b.order)
      .map(({ prop, value }) => ({ prop, value }));
  const inlineStyle = el.getAttribute("style");
  const base = sort(buckets.base);
  if (inlineStyle) {
    const { nodes } = parseCss(`x{${inlineStyle}}`);
    for (const r of flattenRules(nodes)) for (const d of r.decls) base.push({ prop: d.prop, value: resolveVars(d.value, props) });
  }
  return { base, hover: sort(buckets.hover), focus: sort(buckets.focus), active: sort(buckets.active), disabled: sort(buckets.disabled), matched };
}

/** Custom properties declared on :root / html / body (and `*`), resolved. */
export function rootProps(rules: FlatRule[], dark = false): Record<string, string> {
  const props: Record<string, string> = {};
  for (const r of rules) {
    const darkCtx = r.context.some((c) => /prefers-color-scheme:\s*dark/.test(c));
    if (darkCtx !== dark && dark) continue;
    if (!dark && !contextApplies(r.context)) continue;
    const sels = splitSelectorList(r.selector);
    const isRoot = sels.some((s) => /^(:root|html|body|\*|:host)$/i.test(s.trim()));
    const isDarkSel = sels.some((s) => /\[data-theme=["']?dark|\.dark\b|\[data-bs-theme=["']?dark/i.test(s));
    if (!(isRoot || (dark && isDarkSel)) || (isDarkSel && !dark)) continue;
    for (const d of r.decls) if (d.prop.startsWith("--")) props[d.prop] = d.value;
  }
  for (const k of Object.keys(props)) props[k] = resolveVars(props[k]!, props);
  return props;
}

// --- mapping heuristics -----------------------------------------------------

interface Mapping {
  path: string;
  confidence: Confidence;
}

/** Maps a custom-property / token name onto a token path or colour role. */
export function mapTokenName(rawName: string, value: string): Mapping | null {
  const name = rawName.toLowerCase().replace(/^--/, "");
  const isCol = !!parseColor(value);
  const has = (...k: string[]) => k.some((x) => new RegExp(`(^|[-_.])${x}($|[-_.\\d])`).test(name) || name.includes(x));
  if (isCol) {
    if (/hover|active|focus|disabled|light|dark|\d00\b|-(50|9\d0)\b|rgb$/.test(name) && !/^(color-)?(primary|brand)$/.test(name)) {
      if (has("focus", "ring")) return { path: "role.focus", confidence: "medium" };
      return null;
    }
    if (has("primary", "brand", "main")) return { path: "color.primary", confidence: "high" };
    if (has("secondary")) return { path: "color.secondary", confidence: "high" };
    if (has("accent", "highlight", "tertiary")) return { path: "color.accent", confidence: "high" };
    if (has("link")) return { path: "role.link", confidence: "medium" };
    if (has("muted", "subtle", "secondary-text")) return { path: "role.muted", confidence: "medium" };
    if (has("surface", "card", "panel")) return { path: "role.surface", confidence: "medium" };
    if (has("border", "line", "divider")) return { path: "role.border", confidence: "medium" };
    if (has("background", "bg", "body-bg", "canvas")) return { path: "role.background", confidence: "medium" };
    if (has("text", "foreground", "fg", "body-color", "ink")) return { path: "role.text", confidence: "medium" };
    if (has("success")) return { path: "role.success", confidence: "medium" };
    if (has("danger", "error")) return { path: "role.danger", confidence: "medium" };
    if (has("warning")) return { path: "role.warning", confidence: "medium" };
    return null;
  }
  if (has("font", "family") && !has("size", "weight")) {
    if (has("heading", "display", "title")) return { path: "font.heading", confidence: "high" };
    if (has("mono", "code")) return { path: "font.mono", confidence: "high" };
    return { path: "font.body", confidence: "medium" };
  }
  if (has("radius", "rounded", "corner")) {
    if (has("sm", "small")) return { path: "radius.sm", confidence: "medium" };
    if (has("lg", "large", "xl")) return { path: "radius.lg", confidence: "medium" };
    if (has("button", "btn", "pill")) return { path: "radius.button", confidence: "medium" };
    return { path: "radius.md", confidence: "medium" };
  }
  if (has("shadow", "elevation")) {
    if (has("sm", "small", "1")) return { path: "shadow.sm", confidence: "medium" };
    if (has("lg", "large", "3")) return { path: "shadow.lg", confidence: "medium" };
    return { path: "shadow.md", confidence: "medium" };
  }
  if (has("duration", "transition", "speed")) return { path: "motion.duration", confidence: "low" };
  if (has("container", "max-width", "content-width")) return { path: "layout.container", confidence: "low" };
  return null;
}

/** Converts a raw value into what the token path stores; null if unusable. */
function valueFor(path: string, value: string): string | number | null {
  const v = value.trim();
  if (path.startsWith("color.") || path.startsWith("role.")) {
    const c = parseColor(v);
    return c && c.a > 0 ? normalizeColor(v) : null;
  }
  if (path.startsWith("font.")) return v.length > 0 && v.length < 300 ? v : null;
  if (path.startsWith("radius.") || path === "layout.container") {
    const px = lengthPx(v);
    return px !== null && px >= 0 && px < 4000 ? Math.round(px * 100) / 100 : null;
  }
  if (path.startsWith("shadow.")) return /\d/.test(v) || v === "none" ? v : null;
  if (path === "motion.duration") return parseDuration(v);
  return null;
}

function push(values: ImportedValue[], path: string, raw: string, confidence: Confidence, source: string) {
  if (values.some((x) => x.path === path && (x.confidence === "high" || confidence !== "high"))) return;
  const value = valueFor(path, raw);
  if (value === null) return;
  const idx = values.findIndex((x) => x.path === path);
  if (idx >= 0) values.splice(idx, 1);
  values.push({ path, value, confidence, source });
}

function mostCommon<T>(items: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const isChromatic = (c: string) => describe(c).c >= 0.04 && (parseColor(c)?.a ?? 0) > 0.5;

const BUTTON_SEL = /(^|[\s>+~,(])(button|\.btn\b|\.button\b|\.cta\b|\[type=["']?submit|input\[type=["']?(submit|button))|\.(btn|button)-?(primary)?\b/i;
const CARD_SEL = /\.(card|panel|tile|box)\b/i;
const INPUT_SEL = /(^|[\s>+~,])(input\b|textarea\b|select\b)|\.(form-control|input|field)\b/i;

/** Everything one stylesheet can tell, as values + a seed kind + its declarations. */
function readStylesheet(rules: FlatRule[], notes: Set<string>) {
  const values: ImportedValue[] = [];
  const props = rootProps(rules);
  for (const [name, raw] of Object.entries(props)) {
    const m = mapTokenName(name, raw);
    if (m) push(values, m.path, raw, m.confidence, name);
  }
  const darkProps = rootProps(rules, true);
  for (const [name, raw] of Object.entries(darkProps)) {
    if (props[name] === raw) continue;
    const m = mapTokenName(name, raw);
    if (m?.path.startsWith("role.")) push(values, `role.dark.${m.path.slice(5)}`, raw, "medium", `${name} (dunkel)`);
  }

  // Frequency statistics across every declaration.
  const bgs: string[] = [];
  const texts: string[] = [];
  const radii: number[] = [];
  const shadows: string[] = [];
  const fonts: string[] = [];
  for (const r of rules) {
    for (const d of r.decls) {
      const v = resolveVars(d.value, props);
      if (d.prop === "background" || d.prop === "background-color") {
        const c = firstColor(v);
        if (c) bgs.push(normalizeColor(c));
      } else if (d.prop === "color" && parseColor(v)) texts.push(normalizeColor(v));
      else if (d.prop === "border-radius") {
        const px = lengthPx(words(v)[0]);
        if (px && px < 100) radii.push(px);
      } else if (d.prop === "box-shadow" && v !== "none") shadows.push(v);
      else if (d.prop === "font-family") fonts.push(v);
    }
  }
  const brand = mostCommon([...bgs, ...texts].filter(isChromatic));
  if (brand) push(values, "color.primary", brand, "medium", "häufigste Markenfarbe");
  const radius = mostCommon(radii);
  if (radius !== undefined) push(values, "radius.md", `${radius}px`, "medium", "häufigster Eckenradius");
  const shadow = mostCommon(shadows);
  if (shadow) push(values, "shadow.md", shadow, "low", "häufigster Schatten");
  const font = mostCommon(fonts);
  if (font) push(values, "font.body", font, "low", "häufigste Schriftfamilie");
  return { values, props };
}

/** Element rules (body, headings, links) read by selector text. */
function readElementRules(rules: FlatRule[], props: Record<string, string>, values: ImportedValue[]) {
  for (const r of rules) {
    if (!contextApplies(r.context)) continue;
    const sels = splitSelectorList(r.selector).map((s) => s.trim().toLowerCase());
    const get = (p: string) => {
      const d = [...r.decls].reverse().find((x) => x.prop === p);
      return d ? resolveVars(d.value, props) : undefined;
    };
    if (sels.some((s) => s === "body" || s === "html" || s === ":root")) {
      const bg = get("background-color") ?? get("background");
      if (bg && firstColor(bg)) push(values, "role.background", firstColor(bg)!, "high", `${r.selector} background`);
      const col = get("color");
      if (col) push(values, "role.text", col, "high", `${r.selector} color`);
      const ff = get("font-family");
      if (ff) push(values, "font.body", ff, "high", `${r.selector} font-family`);
    }
    if (sels.some((s) => /^h[1-3]$/.test(s))) {
      const ff = get("font-family");
      if (ff) push(values, "font.heading", ff, "high", `${r.selector} font-family`);
    }
    if (sels.some((s) => s === "a" || s === "a:link")) {
      const col = get("color");
      if (col) push(values, "role.link", col, "high", `${r.selector} color`);
    }
  }
}

/** Builds a seed from a declaration cascade. */
function seedFrom(kind: SeedKind, c: Cascade, inherited: Decl[], notes: Set<string>): ComponentStyle {
  let style = defaultStyle(kind);
  const inh = inherited.filter((d) => INHERITED.includes(d.prop));
  style = applyDecls(style, [...inh, ...c.base], notes);
  // A component that sets no shadow / border has none — the defaults would
  // otherwise invent a look the source never had.
  if (!c.base.some((d) => d.prop === "box-shadow")) style.shadow = "none";
  if (!c.base.some((d) => d.prop.startsWith("border") && !d.prop.includes("radius"))) style.borderWidth = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!c.base.some((d) => d.prop.includes("radius"))) style.radius = { tl: 0, tr: 0, br: 0, bl: 0 };
  style.states = {
    hover: applyStateDecls({}, c.hover),
    focus: applyStateDecls({}, c.focus),
    active: applyStateDecls({}, c.active),
    disabled: applyStateDecls({ opacity: 0.5 }, c.disabled),
  };
  if (c.focus.length === 0) {
    style.states.focus = { outlineWidth: 2, outlineOffset: 2 };
    notes.add("Kein eigener Fokuszustand gefunden — ein sichtbarer Fokusrahmen wurde ergänzt.");
  }
  return style;
}

function finish(kind: ImportInfo["kind"], seedKind: SeedKind, style: ComponentStyle, values: ImportedValue[], extra: Partial<ImportInfo>, notes: Set<string>): DesignProject {
  const p = newProject(seedKind);
  return {
    ...p,
    seed: { kind: seedKind, style },
    variant: "original",
    imported: {
      kind,
      at: new Date().toISOString(),
      values,
      unmapped: extra.unmapped ?? [],
      preservedCss: extra.preservedCss ?? "",
      notes: [...notes],
      url: extra.url,
    },
  };
}

// --- public importers -----------------------------------------------------------

/** Imports a CSS file. Unmapped rules are kept verbatim as `preservedCss`. */
export function importCss(cssText: string, parse: ParseHtml = browserParse): ImportResult {
  const text = cssText.slice(0, MAX_INPUT);
  const { nodes, issues } = parseCss(text);
  const rules = flattenRules(nodes);
  const notes = new Set<string>();
  const { values, props } = readStylesheet(rules, notes);
  readElementRules(rules, props, values);

  // Find the most specific button / card / input rule and replay its cascade
  // on a synthetic element, so `.btn` and `.btn:hover` both count.
  const pick = (re: RegExp) =>
    rules
      .filter((r) => contextApplies(r.context) && splitSelectorList(r.selector).some((s) => re.test(s) && !/:(hover|focus|active|disabled)/.test(s)))
      .sort((a, b) => b.decls.length - a.decls.length)[0];
  const doc = parse("<!doctype html><html><body></body></html>");
  let seedKind: SeedKind = "button";
  let style: ComponentStyle | null = null;
  const consumed = new Set<string>();
  for (const [kind, re] of [["button", BUTTON_SEL], ["card", CARD_SEL], ["input", INPUT_SEL]] as const) {
    const rule = pick(re);
    if (!rule) continue;
    const sel = splitSelectorList(rule.selector).find((s) => re.test(s))!;
    const el = syntheticElement(doc, sel);
    if (!el) continue;
    const c = cascadeFor(el, rules, props);
    seedKind = kind;
    style = seedFrom(kind, c, [], notes);
    consumed.add(stripState(sel).base);
    notes.add(`Ausgangskomponente aus „${sel}“ gelesen.`);
    break;
  }
  if (!style) {
    style = defaultStyle("button");
    notes.add("Keine Button-, Karten- oder Formularregel gefunden — die Ausgangskomponente wurde aus den Farben und Variablen abgeleitet.");
    const primary = values.find((v) => v.path === "color.primary");
    if (primary) {
      style.background = String(primary.value);
      style.borderColor = { top: style.background, right: style.background, bottom: style.background, left: style.background };
    }
  }

  // Keep what was not mapped: every top-level node except @import (it must
  // come first in a stylesheet and cannot live inside a layer).
  const preserved: Node[] = [];
  const unmapped: string[] = [];
  for (const node of nodes) {
    if (node.type === "at" && node.name === "import") {
      notes.add(`@import ${node.prelude} wurde nicht übernommen — bitte am Anfang Ihrer eigenen Datei einbinden.`);
      continue;
    }
    if (node.type === "rule") {
      const sels = splitSelectorList(node.selector);
      if (sels.every((s) => /^(:root|html|body)$/i.test(s.trim()) && node.body.every((d) => d.type === "decl" && d.prop.startsWith("--")))) continue;
      unmapped.push(node.selector);
    } else if (node.type === "at") unmapped.push(`@${node.name} ${node.prelude}`.trim());
    preserved.push(node);
  }
  const project = finish("css", seedKind, style, values, { preservedCss: stringify(preserved), unmapped: unmapped.slice(0, 200) }, notes);
  return {
    project,
    notes: [...notes],
    issues: issues.filter((i) => i.severity === "error").map((i) => `Zeile ${i.line}: ${i.message}`),
  };
}

/** Builds a detached element that matches a simple selector like `button.btn-primary`. */
function syntheticElement(doc: Document, selector: string): Element | null {
  const last = selector.trim().split(/[\s>+~]+/).pop() ?? "";
  const { base } = stripState(last);
  const tag = /^[a-z][a-z0-9-]*/i.exec(base)?.[0] ?? (/(submit|button)/i.test(base) ? "button" : "div");
  let el: Element;
  try {
    el = doc.createElement(tag);
  } catch {
    return null;
  }
  for (const m of base.matchAll(/\.([\w-]+)/g)) el.classList.add(m[1]!);
  const id = /#([\w-]+)/.exec(base);
  if (id) el.id = id[1]!;
  for (const m of base.matchAll(/\[([\w-]+)(?:[~|^$*]?=["']?([^"'\]]*)["']?)?\]/g)) el.setAttribute(m[1]!, m[2] ?? "");
  doc.body.appendChild(el);
  return el;
}

function kindOfElement(el: Element): SeedKind {
  const tag = el.tagName.toLowerCase();
  const cls = (el.getAttribute("class") ?? "").toLowerCase();
  if (tag === "button" || /\b(btn|button|cta)\b/.test(cls) || (tag === "input" && /submit|button/.test(el.getAttribute("type") ?? ""))) return "button";
  if (tag === "input" || tag === "textarea" || tag === "select") return "input";
  if (tag === "a") return "link";
  return "card";
}

/** Imports a pasted HTML/CSS component; the first element is the component. */
export function importHtmlComponent(input: string, parse: ParseHtml = browserParse): ImportResult {
  const clean = sanitizeHtml(input.slice(0, MAX_INPUT), parse);
  const css = [...clean.styles, clean.inlineCss].join("\n");
  const { nodes, issues } = parseCss(css);
  const rules = flattenRules(nodes);
  const notes = new Set<string>();
  if (clean.removed.length) notes.add(`Aus Sicherheitsgründen entfernt: ${clean.removed.join(", ")}.`);
  const { values, props } = readStylesheet(rules, notes);
  const doc = parse(`<!doctype html><html><body>${clean.html}</body></html>`);
  const root = doc.body.firstElementChild;
  if (!root) {
    return { project: newProject(), notes: ["Kein HTML-Element gefunden. Bitte ein Element einfügen, z. B. <button class=\"btn\">Text</button>."], issues: [] };
  }
  // The component may be wrapped; prefer the first control inside a wrapper.
  const target = root.matches("button, a, input, textarea, select") ? root : (root.querySelector("button, .btn, .button, input, textarea, select") ?? root);
  const kind = kindOfElement(target);
  const bodyCascade = cascadeFor(doc.body, rules, props);
  const c = cascadeFor(target, rules, props);
  if (c.matched === 0 && !target.getAttribute("style")) notes.add("Für das Element wurde keine passende CSS-Regel gefunden; es wurden Standardwerte verwendet.");
  const style = seedFrom(kind, c, bodyCascade.base, notes);
  const project = finish("html", kind, style, values, { preservedCss: stringify(nodes) }, notes);
  return {
    project,
    notes: [...notes],
    issues: issues.filter((i) => i.severity === "error").map((i) => `Zeile ${i.line}: ${i.message}`),
    referenceHtml: clean.html,
  };
}

/** Imports JSON: a saved studio project, DTCG tokens (`$value`) or a plain token tree. */
export function importTokensJson(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text.slice(0, MAX_INPUT));
  } catch (e) {
    return { project: newProject(), notes: [], issues: [`Kein gültiges JSON: ${(e as Error).message}`] };
  }
  if (data && typeof data === "object" && (data as Record<string, unknown>).schema !== undefined) {
    const p = parseProject(data);
    if (p) return { project: p, notes: ["Studio-Projekt geladen."], issues: [] };
    return { project: newProject(), notes: [], issues: [`Projektdatei mit unbekannter Version (unterstützt bis ${SCHEMA_VERSION}).`] };
  }
  const values: ImportedValue[] = [];
  const unmapped: string[] = [];
  const walk = (node: unknown, path: string[]) => {
    if (node === null || typeof node !== "object") {
      if (typeof node === "string" || typeof node === "number") leaf(String(node), path);
      return;
    }
    const obj = node as Record<string, unknown>;
    if ("$value" in obj || "value" in obj) {
      const v = obj.$value ?? obj.value;
      if (typeof v === "string" || typeof v === "number") leaf(String(v), path);
      else if (v && typeof v === "object" && (obj.$type === "shadow" || path.join("-").includes("shadow"))) {
        const s = v as Record<string, unknown>;
        leaf(`${s.offsetX ?? 0} ${s.offsetY ?? 0} ${s.blur ?? 0} ${s.spread ?? 0} ${s.color ?? "rgba(0,0,0,.2)"}`, path);
      }
      return;
    }
    for (const [k, v] of Object.entries(obj)) if (!k.startsWith("$")) walk(v, [...path, k]);
  };
  const leaf = (value: string, path: string[]) => {
    const name = path.join("-");
    const m = mapTokenName(name, value);
    if (m) push(values, m.path, value, m.confidence === "high" ? "high" : "medium", path.join("."));
    else unmapped.push(`${path.join(".")}: ${value}`);
  };
  walk(data, []);
  const notes = new Set<string>();
  const style = defaultStyle("button");
  const primary = values.find((v) => v.path === "color.primary");
  if (primary) {
    style.background = String(primary.value);
    style.borderColor = { top: style.background, right: style.background, bottom: style.background, left: style.background };
  }
  const radius = values.find((v) => v.path === "radius.button" || v.path === "radius.md");
  if (radius && typeof radius.value === "number") style.radius = { tl: radius.value, tr: radius.value, br: radius.value, bl: radius.value };
  const font = values.find((v) => v.path === "font.body");
  if (font) style.fontFamily = String(font.value);
  if (values.length === 0) notes.add("In der Datei wurden keine zuordenbaren Tokens gefunden.");
  return { project: finish("tokens", "button", style, values, { unmapped: unmapped.slice(0, 200) }, notes), notes: [...notes], issues: [] };
}

// --- web page analysis ---------------------------------------------------------

export interface FetchedPage {
  url: string;
  finalUrl?: string;
  html: string;
  stylesheets: Array<{ url: string; css: string }>;
  skipped?: Array<{ url: string; reason: string }>;
}

export interface ReferenceEntry {
  label: string;
  value: string;
  confidence: Confidence | "none";
  source: string;
}

export interface PageAnalysis {
  /** The style reference as found — "none" entries were NOT determinable. */
  reference: ReferenceEntry[];
  /** Ready to edit, faithful to the reference (variant `original`). */
  project: DesignProject;
  notes: string[];
}

/**
 * Analyses the style data of ONE fetched page. Reads colours, type, geometry
 * and the first button/input/card it can find; copies no text, images or
 * logos, and keeps none of the page's CSS.
 */
export function analyzePage(page: FetchedPage, parse: ParseHtml = browserParse): PageAnalysis {
  const notes = new Set<string>();
  const doc = parse(page.html.slice(0, 3_000_000));
  for (const n of Array.from(doc.querySelectorAll("script, noscript, template, iframe, object, embed"))) n.remove();
  const inlineCss = Array.from(doc.querySelectorAll("style")).map((s) => s.textContent ?? "");
  const css = [...page.stylesheets.map((s) => s.css), ...inlineCss].join("\n");
  const { nodes } = parseCss(css.slice(0, 6_000_000));
  const rules = flattenRules(nodes);
  const { values, props } = readStylesheet(rules, notes);
  readElementRules(rules, props, values);

  const themeColor = doc.querySelector('meta[name="theme-color"]')?.getAttribute("content");
  if (themeColor && parseColor(themeColor) && isChromatic(themeColor)) push(values, "color.primary", themeColor, "medium", "meta theme-color");

  const body = doc.body;
  const bodyC = cascadeFor(body, rules, props);
  const find = (sel: string) => {
    try {
      return Array.from(doc.querySelectorAll(sel)).find((el) => !el.closest("[hidden], [aria-hidden='true']")) ?? null;
    } catch {
      return null;
    }
  };
  const buttonEl = find("a.btn, a.button, button.btn, .btn-primary, .button--primary, a[class*='btn'], button[class*='btn'], [class*='button']:not(body):not(html), input[type='submit'], button");
  let seedKind: SeedKind = "button";
  let style: ComponentStyle;
  let buttonConfidence: Confidence | "none" = "none";
  if (buttonEl) {
    const c = cascadeFor(buttonEl, rules, props);
    if (c.matched > 0) {
      style = seedFrom("button", c, bodyC.base, notes);
      buttonConfidence = c.base.some((d) => d.prop.startsWith("background")) ? "high" : "medium";
      notes.add(`Button-Gestaltung von <${buttonEl.tagName.toLowerCase()}${buttonEl.className ? ` class="${String(buttonEl.className).slice(0, 60)}"` : ""}> gelesen.`);
    } else style = defaultStyle("button");
  } else {
    style = defaultStyle("button");
  }
  if (buttonConfidence === "none") {
    const inputEl = find("input[type='text'], input[type='email'], input:not([type]), textarea");
    const c = inputEl ? cascadeFor(inputEl, rules, props) : null;
    if (inputEl && c && c.matched > 0) {
      seedKind = "input";
      style = seedFrom("input", c, bodyC.base, notes);
      notes.add("Kein gestalteter Button gefunden — Ausgangspunkt ist das Formularfeld.");
    } else {
      const primary = values.find((v) => v.path === "color.primary");
      if (primary) {
        style.background = String(primary.value);
        style.borderColor = { top: style.background, right: style.background, bottom: style.background, left: style.background };
      }
      notes.add("Kein gestalteter Button gefunden — der Button wurde aus den erkannten Farben abgeleitet.");
    }
  }
  const brandFromButton = style.background && parseColor(style.background) && isChromatic(style.background);
  if (brandFromButton && buttonConfidence === "high") push(values, "color.primary", style.background, "high", "Button-Hintergrund");

  const reference: ReferenceEntry[] = [];
  const entry = (label: string, path: string) => {
    const v = values.find((x) => x.path === path);
    reference.push(v ? { label, value: String(v.value), confidence: v.confidence, source: v.source } : { label, value: "nicht ermittelt", confidence: "none", source: "" });
  };
  entry("Primärfarbe", "color.primary");
  entry("Sekundärfarbe", "color.secondary");
  entry("Akzentfarbe", "color.accent");
  entry("Seitenhintergrund", "role.background");
  entry("Textfarbe", "role.text");
  entry("Linkfarbe", "role.link");
  entry("Schrift (Text)", "font.body");
  entry("Schrift (Überschriften)", "font.heading");
  entry("Eckenradius", "radius.md");
  entry("Schatten", "shadow.md");
  reference.push(
    buttonConfidence === "none"
      ? { label: "Button-Gestaltung", value: "nicht ermittelt", confidence: "none", source: "" }
      : {
          label: "Button-Gestaltung",
          value: `${style.background} · Radius ${style.radius.tl}px · Innenabstand ${Math.round(style.padding.top)}/${Math.round(style.padding.right)}px`,
          confidence: buttonConfidence,
          source: "erster Button der Seite",
        },
  );
  for (const s of page.skipped ?? []) notes.add(`Stylesheet nicht geladen (${s.reason}): ${s.url}`);
  if (page.stylesheets.length === 0 && inlineCss.length === 0) notes.add("Die Seite liefert kein auswertbares CSS — die meisten Werte sind abgeleitet, nicht gefunden.");
  notes.add("Schriftarten werden nur namentlich übernommen; Webfonts müssen Sie selbst lizenzieren und einbinden.");

  const project = finish("url", seedKind, style, values, { url: page.finalUrl ?? page.url }, notes);
  try {
    project.name = `Stil von ${new URL(page.finalUrl ?? page.url).hostname}`;
  } catch {
    /* keep default name */
  }
  return { reference, project, notes: [...notes] };
}

export type { Declaration };
