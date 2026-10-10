/**
 * The Designsystem-Studio project model.
 *
 * ONE data structure feeds every surface: the wizard edits it, the preview and
 * every export adapter read it. It is versioned (`schema`) because Premium
 * users store it server-side and open it again months later.
 *
 * Layers, lowest priority first (see `resolve.ts`):
 *
 *   1. `seed`        — the component the user designed; derives the base tokens
 *      `imported`    — values read from a CSS file / page, merged into the base
 *   2. `variant`     — a rule-based style direction applied on top
 *   3. `globals`     — global token edits by the user (manual, protected)
 *   4. `components`  — per-component edits by the user (manual, protected)
 *   5. `customCss`   — the user's own CSS, emitted last
 *
 * `locks` lists token paths the user froze; a locked path always has a value
 * in `globals`, so nothing generated can move it.
 */

import type { Harmony } from "./color";

export const SCHEMA_VERSION = 1;

export const SEED_KINDS = ["button", "card", "input", "link"] as const;
export type SeedKind = (typeof SEED_KINDS)[number];

/** The components the generated system contains (the agreed standard scope). */
export const COMPONENT_KINDS = [
  "button",
  "buttonSecondary",
  "link",
  "heading",
  "text",
  "card",
  "input",
  "label",
  "formButton",
  "nav",
  "footer",
] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

export const VARIANTS = ["original", "minimal", "modern", "elegant", "playful", "technical"] as const;
export type VariantId = (typeof VARIANTS)[number];

export const BORDER_STYLES = ["solid", "dashed", "dotted", "double", "none"] as const;
export type BorderStyle = (typeof BORDER_STYLES)[number];

export const TEXT_TRANSFORMS = ["none", "uppercase", "lowercase", "capitalize"] as const;
export type TextTransform = (typeof TEXT_TRANSFORMS)[number];

export const ANIMATIONS = ["none", "fade-in", "slide-up", "pulse"] as const;
export type AnimationId = (typeof ANIMATIONS)[number];

export interface Sides<T> {
  top: T;
  right: T;
  bottom: T;
  left: T;
}

export interface Corners {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

export interface ShadowSpec {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  inset: boolean;
}

export interface StateStyle {
  background?: string;
  color?: string;
  borderColor?: string;
  /** Full CSS box-shadow value; "none" removes it. */
  shadow?: string;
  scale?: number;
  translateY?: number;
  opacity?: number;
  outlineColor?: string;
  outlineWidth?: number;
  outlineOffset?: number;
}

export interface StateSet {
  hover: StateStyle;
  focus: StateStyle;
  active: StateStyle;
  disabled: StateStyle;
}

/** A fully specified component style. Every generated component resolves to one. */
export interface ComponentStyle {
  background: string;
  /** Second gradient stop; empty = solid background. */
  gradientTo: string;
  gradientAngle: number;
  color: string;
  fontFamily: string;
  /** px */
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  /** em */
  letterSpacing: number;
  textTransform: TextTransform;
  textAlign: "left" | "center" | "right";
  borderWidth: Sides<number>;
  borderStyle: BorderStyle;
  borderColor: Sides<string>;
  radius: Corners;
  padding: Sides<number>;
  /** px, 0 = auto */
  minHeight: number;
  shadow: string;
  textShadow: string;
  filter: string;
  opacity: number;
  transitionDuration: number;
  transitionEasing: string;
  animation: AnimationId;
  states: StateSet;
}

/** What the wizard edits: one component plus its kind. */
export interface Seed {
  kind: SeedKind;
  style: ComponentStyle;
}

export interface ThemeDef {
  id: string;
  name: string;
  base: "light" | "dark";
  contrast: "normal" | "more";
  /** Manual colour-role overrides of this theme; kept across variant switches. */
  overrides: Record<string, string>;
}

export type Confidence = "high" | "medium" | "low";

export interface ImportedValue {
  /** Token path, e.g. `color.primary` or `radius.md`. */
  path: string;
  value: string | number;
  confidence: Confidence;
  /** Where it came from, e.g. `--brand` or `.btn background`. */
  source: string;
}

export interface ImportInfo {
  kind: "css" | "html" | "tokens" | "url";
  /** For URL analyses only. */
  url?: string;
  at: string;
  values: ImportedValue[];
  /** Findings that could not be mapped, shown to the user as such. */
  unmapped: string[];
  /** Original rules kept verbatim (CSS file / component imports only). */
  preservedCss: string;
  notes: string[];
}

export type Patch = Record<string, string | number | boolean>;

export interface DesignProject {
  schema: number;
  name: string;
  /** Class prefix of the generated CSS, e.g. `ds` → `.ds-btn`. */
  prefix: string;
  seed: Seed;
  variant: VariantId;
  harmony: Harmony;
  globals: Patch;
  locks: string[];
  components: Partial<Record<ComponentKind, Patch>>;
  themes: ThemeDef[];
  customCss: string;
  imported: ImportInfo | null;
}

export const sides = <T>(v: T): Sides<T> => ({ top: v, right: v, bottom: v, left: v });
export const corners = (v: number): Corners => ({ tl: v, tr: v, br: v, bl: v });

export const FONT_STACKS = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  geometric: '"Avenir Next", "Century Gothic", "Futura", system-ui, sans-serif',
  humanist: '"Gill Sans", "Trebuchet MS", "Segoe UI", Calibri, sans-serif',
  serif: 'Georgia, "Times New Roman", "Iowan Old Style", serif',
  rounded: '"Nunito", "Varela Round", "Arial Rounded MT Bold", system-ui, sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", "JetBrains Mono", Menlo, Consolas, monospace',
} as const;
export type FontStackId = keyof typeof FONT_STACKS;

export const DEFAULT_STATES: StateSet = {
  hover: { translateY: 0, scale: 1 },
  focus: { outlineWidth: 2, outlineOffset: 2 },
  active: { scale: 0.98 },
  disabled: { opacity: 0.5 },
};

export function defaultStyle(kind: SeedKind): ComponentStyle {
  const common: ComponentStyle = {
    background: "#2563eb",
    gradientTo: "",
    gradientAngle: 135,
    color: "#ffffff",
    fontFamily: FONT_STACKS.sans,
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.25,
    letterSpacing: 0,
    textTransform: "none",
    textAlign: "center",
    borderWidth: sides(0),
    borderStyle: "solid",
    borderColor: sides("#2563eb"),
    radius: corners(8),
    padding: { top: 12, right: 22, bottom: 12, left: 22 },
    minHeight: 44,
    shadow: "0 1px 2px rgba(15, 23, 42, 0.12)",
    textShadow: "",
    filter: "",
    opacity: 1,
    transitionDuration: 160,
    transitionEasing: "ease-out",
    animation: "none",
    states: structuredCloneStates(DEFAULT_STATES),
  };
  switch (kind) {
    case "card":
      return {
        ...common,
        background: "#ffffff",
        color: "#1f2937",
        fontWeight: 400,
        lineHeight: 1.6,
        textAlign: "left",
        borderWidth: sides(1),
        borderColor: sides("#e5e7eb"),
        radius: corners(12),
        padding: sides(24),
        minHeight: 0,
        shadow: "0 4px 16px rgba(15, 23, 42, 0.08)",
        states: { ...structuredCloneStates(DEFAULT_STATES), active: {}, hover: { translateY: -2 } },
      };
    case "input":
      return {
        ...common,
        background: "#ffffff",
        color: "#1f2937",
        fontWeight: 400,
        lineHeight: 1.4,
        textAlign: "left",
        borderWidth: sides(1),
        borderColor: sides("#6b7280"),
        radius: corners(6),
        padding: { top: 10, right: 12, bottom: 10, left: 12 },
        shadow: "none",
        states: {
          hover: { borderColor: "#374151" },
          focus: { borderColor: "#2563eb", outlineWidth: 2, outlineOffset: 1 },
          active: {},
          disabled: { opacity: 0.55 },
        },
      };
    case "link":
      return {
        ...common,
        background: "transparent",
        color: "#2563eb",
        fontWeight: 500,
        lineHeight: 1.5,
        textAlign: "left",
        borderColor: sides("#2563eb"),
        radius: corners(2),
        padding: sides(0),
        minHeight: 0,
        shadow: "none",
        states: {
          hover: { color: "#1d4ed8" },
          focus: { outlineWidth: 2, outlineOffset: 2 },
          active: {},
          disabled: { opacity: 0.5 },
        },
      };
    default:
      return common;
  }
}

function structuredCloneStates(s: StateSet): StateSet {
  return JSON.parse(JSON.stringify(s)) as StateSet;
}

export const DEFAULT_THEMES: ThemeDef[] = [
  { id: "light", name: "Hell", base: "light", contrast: "normal", overrides: {} },
  { id: "dark", name: "Dunkel", base: "dark", contrast: "normal", overrides: {} },
];

export function newProject(kind: SeedKind = "button"): DesignProject {
  return {
    schema: SCHEMA_VERSION,
    name: "Mein Designsystem",
    prefix: "ds",
    seed: { kind, style: defaultStyle(kind) },
    // The designed component stays as designed; variants are an offer.
    variant: "original",
    harmony: "analogous",
    globals: {},
    locks: [],
    components: {},
    themes: DEFAULT_THEMES.map((t) => ({ ...t, overrides: {} })),
    customCss: "",
    imported: null,
  };
}

/** Dotted-path read on a plain object. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Dotted-path write, returning a new object (structural sharing). */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split(".");
  const src = (obj ?? {}) as Record<string, unknown>;
  if (head === undefined) return obj;
  if (head === "__proto__" || head === "constructor" || head === "prototype") return obj;
  return {
    ...src,
    [head]: rest.length === 0 ? value : setPath(src[head] as unknown, rest.join("."), value),
  } as T;
}

/** Applies a flat dotted-path patch onto a copy of `base`. */
export function applyPatch<T>(base: T, patch: Patch | undefined): T {
  if (!patch) return base;
  let out = base;
  for (const key of Object.keys(patch).sort()) out = setPath(out, key, patch[key]);
  return out;
}

const PREFIX_RE = /^[a-z][a-z0-9-]{0,11}$/;
export const isValidPrefix = (p: string) => PREFIX_RE.test(p);

const MAX_CUSTOM_CSS = 200_000;

/**
 * Accepts an unknown value (a stored project, a file the user picked) and
 * returns a complete, current-schema project — or null when it is not one.
 * Missing fields are filled from the defaults, so a project saved by an older
 * release opens with the same look plus whatever was added since.
 */
export function parseProject(input: unknown): DesignProject | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const schema = typeof raw.schema === "number" ? raw.schema : NaN;
  if (!Number.isInteger(schema) || schema < 1 || schema > SCHEMA_VERSION) return null;

  const seedRaw = (raw.seed ?? {}) as Record<string, unknown>;
  const kind = SEED_KINDS.includes(seedRaw.kind as SeedKind) ? (seedRaw.kind as SeedKind) : "button";
  const base = newProject(kind);
  const style = mergeDeep(base.seed.style, seedRaw.style) as ComponentStyle;

  const themes = Array.isArray(raw.themes)
    ? (raw.themes as unknown[])
        .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
        .slice(0, 12)
        .map((t, i) => ({
          id: typeof t.id === "string" && /^[a-z0-9-]{1,32}$/.test(t.id) ? t.id : `theme-${i + 1}`,
          name: typeof t.name === "string" ? t.name.slice(0, 40) : `Theme ${i + 1}`,
          base: t.base === "dark" ? ("dark" as const) : ("light" as const),
          contrast: t.contrast === "more" ? ("more" as const) : ("normal" as const),
          overrides: flatStrings(t.overrides),
        }))
    : base.themes;

  const components: DesignProject["components"] = {};
  if (raw.components && typeof raw.components === "object") {
    for (const k of COMPONENT_KINDS) {
      const p = (raw.components as Record<string, unknown>)[k];
      if (p && typeof p === "object") components[k] = flatPatch(p);
    }
  }

  return {
    schema: SCHEMA_VERSION,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 120) : base.name,
    prefix: typeof raw.prefix === "string" && isValidPrefix(raw.prefix) ? raw.prefix : base.prefix,
    seed: { kind, style },
    variant: VARIANTS.includes(raw.variant as VariantId) ? (raw.variant as VariantId) : base.variant,
    harmony: (["analogous", "complementary", "triadic", "split", "monochrome"] as const).includes(
      raw.harmony as Harmony,
    )
      ? (raw.harmony as Harmony)
      : base.harmony,
    globals: flatPatch(raw.globals),
    locks: Array.isArray(raw.locks) ? (raw.locks as unknown[]).filter((l): l is string => typeof l === "string").slice(0, 200) : [],
    components,
    themes: themes.length > 0 ? dedupeThemes(themes) : base.themes,
    customCss: typeof raw.customCss === "string" ? raw.customCss.slice(0, MAX_CUSTOM_CSS) : "",
    imported: parseImport(raw.imported),
  };
}

function dedupeThemes(themes: ThemeDef[]): ThemeDef[] {
  const seen = new Set<string>();
  return themes.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

function parseImport(v: unknown): ImportInfo | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const kind = (["css", "html", "tokens", "url"] as const).find((k) => k === r.kind);
  if (!kind) return null;
  const values = Array.isArray(r.values)
    ? (r.values as unknown[])
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        .filter((x) => typeof x.path === "string" && (typeof x.value === "string" || typeof x.value === "number"))
        .slice(0, 300)
        .map((x) => ({
          path: String(x.path),
          value: x.value as string | number,
          confidence: (["high", "medium", "low"] as const).find((c) => c === x.confidence) ?? "low",
          source: typeof x.source === "string" ? x.source.slice(0, 200) : "",
        }))
    : [];
  return {
    kind,
    url: typeof r.url === "string" ? r.url.slice(0, 2048) : undefined,
    at: typeof r.at === "string" ? r.at : "",
    values,
    unmapped: Array.isArray(r.unmapped) ? (r.unmapped as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 300) : [],
    preservedCss: typeof r.preservedCss === "string" ? r.preservedCss.slice(0, MAX_CUSTOM_CSS) : "",
    notes: Array.isArray(r.notes) ? (r.notes as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 50) : [],
  };
}

function flatPatch(v: unknown): Patch {
  const out: Patch = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(k) || k.split(".").some((p) => p === "__proto__" || p === "constructor" || p === "prototype")) continue;
    if (typeof val === "string") out[k] = val.slice(0, 500);
    else if (typeof val === "number" && Number.isFinite(val)) out[k] = val;
    else if (typeof val === "boolean") out[k] = val;
  }
  return out;
}

function flatStrings(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(flatPatch(v))) if (typeof val === "string") out[k] = val;
  return out;
}

function mergeDeep(base: unknown, over: unknown): unknown {
  if (over === undefined || over === null) return base;
  if (typeof base !== "object" || base === null || Array.isArray(base)) {
    if (typeof base === "number") return typeof over === "number" && Number.isFinite(over) ? over : base;
    if (typeof base === "string") return typeof over === "string" ? over.slice(0, 500) : base;
    if (typeof base === "boolean") return typeof over === "boolean" ? over : base;
    return base;
  }
  if (typeof over !== "object" || Array.isArray(over)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (k in out) out[k] = mergeDeep(out[k], v);
    else if (typeof v === "string" || (typeof v === "number" && Number.isFinite(v))) {
      // State styles are open records: keep known-shaped scalar keys.
      out[k] = typeof v === "string" ? v.slice(0, 500) : v;
    }
  }
  return out;
}
