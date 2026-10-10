/**
 * Rule-based token derivation: seed component → base tokens → variant →
 * imported values → user globals. Pure and deterministic — the same project
 * always resolves to the same tokens (no randomness, no clock, no AI).
 */

import {
  describe,
  harmonyOffsets,
  oklch,
  parseColor,
  type Harmony,
} from "./color";
import {
  FONT_STACKS,
  applyPatch,
  getPath,
  type ComponentStyle,
  type DesignProject,
  type Seed,
  type VariantId,
} from "./model";

export type HoverEffect = "darken" | "lift" | "scale" | "glow" | "underline";
export type ShadowStyle = "none" | "soft" | "hard";
export type FocusStyle = "ring" | "outline" | "dashed";

export interface Tokens {
  color: {
    primary: string;
    secondary: string;
    accent: string;
    /** Hue (deg) of the neutral greys; derived from primary. */
    neutralHue: number;
    /** Chroma of the neutral greys (0 = pure grey). */
    neutralChroma: number;
  };
  font: {
    body: string;
    heading: string;
    mono: string;
    /** px */
    size: number;
    ratio: number;
    lineHeight: number;
    bodyWeight: number;
    headingWeight: number;
    /** em */
    headingTracking: number;
    headingLineHeight: number;
    headingTransform: "none" | "uppercase";
  };
  space: { unit: number };
  radius: { sm: number; md: number; lg: number; button: number };
  border: { width: number; style: string };
  shadow: { sm: string; md: string; lg: string };
  motion: { duration: number; easing: string };
  layout: { container: number; gutter: number; fluid: boolean; navBreakpoint: number };
  style: {
    hover: HoverEffect;
    shadow: ShadowStyle;
    buttonCase: "none" | "uppercase";
    /** em */
    buttonTracking: number;
    focus: FocusStyle;
    /** Hover lift distance in px for `lift`, scale factor for `scale`. */
    hoverAmount: number;
  };
}

export type TokenSource = "derived" | "variant" | "imported" | "manual" | "locked";

/** Every editable token path, used by the UI and for provenance. */
export const TOKEN_PATHS = [
  "color.primary",
  "color.secondary",
  "color.accent",
  "color.neutralChroma",
  "font.body",
  "font.heading",
  "font.size",
  "font.ratio",
  "font.lineHeight",
  "font.bodyWeight",
  "font.headingWeight",
  "font.headingTracking",
  "font.headingTransform",
  "space.unit",
  "radius.sm",
  "radius.md",
  "radius.lg",
  "radius.button",
  "border.width",
  "border.style",
  "shadow.sm",
  "shadow.md",
  "shadow.lg",
  "motion.duration",
  "motion.easing",
  "layout.container",
  "layout.gutter",
  "layout.fluid",
  "layout.navBreakpoint",
  "style.hover",
  "style.shadow",
  "style.buttonCase",
  "style.buttonTracking",
  "style.focus",
] as const;
export type TokenPath = (typeof TOKEN_PATHS)[number];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, step = 1) => Math.round(v / step) * step;

const chroma = (color: string) => {
  const c = parseColor(color);
  return c && c.a > 0.2 ? describe(color).c : 0;
};

/** The seed's most brand-like colour: the first clearly chromatic candidate. */
export function seedBrandColor(seed: Seed): string {
  const s = seed.style;
  const candidates =
    seed.kind === "button"
      ? [s.background, s.borderColor.top, s.color, s.states.focus.outlineColor ?? ""]
      : seed.kind === "link"
        ? [s.color, s.states.hover.color ?? "", s.borderColor.top]
        : [
            s.states.focus.borderColor ?? "",
            s.states.focus.outlineColor ?? "",
            s.borderColor.top,
            s.background,
            s.color,
          ];
  return candidates.find((c) => c && chroma(c) >= 0.04) ?? "#2563eb";
}

export interface ParsedShadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  inset: boolean;
}

/** Reads the first layer of a box-shadow value. Null for `none` or unreadable. */
export function parseShadow(value: string): ParsedShadow | null {
  const v = value.trim();
  if (!v || v === "none") return null;
  // Only the first layer: split on top-level commas.
  let depth = 0;
  let first = v;
  for (let i = 0; i < v.length; i++) {
    const ch = v[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      first = v.slice(0, i);
      break;
    }
  }
  const colorMatch = /(#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch)\([^)]*\)|\b[a-z]+\b(?!\())/i.exec(
    first.replace(/\binset\b/i, ""),
  );
  const color = colorMatch && parseColor(colorMatch[0]) ? colorMatch[0] : "rgba(0, 0, 0, 0.2)";
  const rest = first.replace(color, " ");
  const lengths = [...rest.matchAll(/(-?\d*\.?\d+)(px|rem|em)?/g)].map((m) => {
    const n = Number(m[1]);
    return m[2] === "rem" || m[2] === "em" ? n * 16 : n;
  });
  if (lengths.length < 2) return null;
  return {
    x: lengths[0] ?? 0,
    y: lengths[1] ?? 0,
    blur: lengths[2] ?? 0,
    spread: lengths[3] ?? 0,
    color,
    inset: /\binset\b/i.test(first),
  };
}

const shadowCss = (s: ParsedShadow) =>
  `${s.inset ? "inset " : ""}${round(s.x, 0.5)}px ${round(s.y, 0.5)}px ${round(s.blur, 0.5)}px${
    s.spread ? ` ${round(s.spread, 0.5)}px` : ""
  } ${s.color}`;

function softShadows(): Tokens["shadow"] {
  return {
    sm: "0 1px 2px rgba(15, 23, 42, 0.08)",
    md: "0 4px 12px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.06)",
    lg: "0 16px 40px rgba(15, 23, 42, 0.12), 0 4px 12px rgba(15, 23, 42, 0.06)",
  };
}

function shadowsFrom(style: ComponentStyle): { shadow: Tokens["shadow"]; kind: ShadowStyle } {
  const s = parseShadow(style.shadow);
  if (!s) return { shadow: { sm: "none", md: "none", lg: "none" }, kind: "none" };
  if (s.blur === 0 && (s.x !== 0 || s.y !== 0)) {
    // Hard offset shadow ("neo-brutalist"): keep the offset, scale it.
    return {
      kind: "hard",
      shadow: {
        sm: shadowCss({ ...s, x: s.x / 2, y: s.y / 2 }),
        md: shadowCss(s),
        lg: shadowCss({ ...s, x: s.x * 1.5, y: s.y * 1.5 }),
      },
    };
  }
  return {
    kind: "soft",
    shadow: {
      sm: shadowCss({ ...s, y: Math.max(1, s.y / 2), blur: Math.max(2, s.blur / 2), spread: 0 }),
      md: shadowCss(s),
      lg: shadowCss({ ...s, y: s.y * 2.5 + 4, blur: s.blur * 2.5 + 8 }),
    },
  };
}

const avgRadius = (s: ComponentStyle) => (s.radius.tl + s.radius.tr + s.radius.br + s.radius.bl) / 4;

/** Layer 1: everything the seed component implies. */
export function deriveBase(seed: Seed, harmony: Harmony): Tokens {
  const s = seed.style;
  const primary = seedBrandColor(seed);
  const p = describe(primary);
  const [o2, o3] = harmonyOffsets(harmony);
  const mono = harmony === "monochrome";
  const secondary = oklch(mono ? clamp(p.l - 0.18, 0.25, 0.6) : clamp(p.l, 0.4, 0.62), mono ? p.c * 0.6 : Math.max(0.06, p.c * 0.85), (p.h + o2 + 360) % 360);
  const accent = oklch(mono ? clamp(p.l + 0.15, 0.55, 0.8) : 0.68, Math.max(0.1, p.c), (p.h + o3 + 360) % 360);

  const radius = avgRadius(s);
  const md = clamp(round(radius >= 999 ? 12 : radius), 0, 32);
  const { shadow, kind: shadowKind } = shadowsFrom(s);
  const paddingAvg = (s.padding.top + s.padding.right + s.padding.bottom + s.padding.left) / 4;
  const unit = clamp(round(paddingAvg / 3 / 2) * 2, 2, 12) || 4;
  const bodySize = seed.kind === "button" ? 16 : clamp(round(s.fontSize), 14, 20);

  const hover = s.states.hover;
  const hoverEffect: HoverEffect =
    (hover.translateY ?? 0) < 0
      ? "lift"
      : (hover.scale ?? 1) > 1
        ? "scale"
        : hover.shadow && hover.shadow !== "none"
          ? "glow"
          : seed.kind === "link"
            ? "underline"
            : "darken";
  const borderWidth = Math.max(s.borderWidth.top, s.borderWidth.right, s.borderWidth.bottom, s.borderWidth.left);

  return {
    color: { primary, secondary, accent, neutralHue: p.h, neutralChroma: 0.012 },
    font: {
      body: s.fontFamily || FONT_STACKS.sans,
      heading: s.fontFamily || FONT_STACKS.sans,
      mono: FONT_STACKS.mono,
      size: bodySize,
      ratio: 1.25,
      lineHeight: seed.kind === "card" ? clamp(s.lineHeight, 1.4, 1.9) : 1.6,
      bodyWeight: 400,
      headingWeight: clamp(round(Math.max(s.fontWeight, 600), 100), 500, 900),
      headingTracking: clamp(s.letterSpacing, -0.03, 0.12),
      headingLineHeight: 1.2,
      // A button's uppercase is a button decision (style.buttonCase), not a
      // heading one; headings start mixed-case unless a variant says otherwise.
      headingTransform: "none",
    },
    space: { unit },
    radius: {
      sm: round(md / 2),
      md,
      lg: clamp(round(md * 1.5), 0, 40),
      button: clamp(round(radius), 0, 9999),
    },
    border: { width: clamp(borderWidth || 1, 1, 4), style: s.borderStyle === "none" ? "solid" : s.borderStyle },
    shadow,
    motion: { duration: clamp(round(s.transitionDuration), 0, 1000), easing: s.transitionEasing || "ease-out" },
    layout: { container: 1120, gutter: 24, fluid: true, navBreakpoint: 768 },
    style: {
      hover: hoverEffect,
      shadow: shadowKind,
      buttonCase: s.textTransform === "uppercase" ? "uppercase" : "none",
      buttonTracking: clamp(s.letterSpacing, 0, 0.2),
      focus: (s.states.focus.outlineWidth ?? 2) >= 3 ? "outline" : "ring",
      hoverAmount:
        hoverEffect === "lift"
          ? clamp(Math.abs(hover.translateY ?? 2), 1, 8)
          : hoverEffect === "scale"
            ? clamp(hover.scale ?? 1.03, 1.01, 1.15)
            : 0,
    },
  };
}

/**
 * Layer 2: a style direction. Each variant changes STRUCTURE — geometry,
 * typography, depth, motion — not just colour, so two variants of one seed
 * are told apart at a glance in greyscale.
 */
export function applyVariant(t: Tokens, variant: VariantId): Tokens {
  const v: Tokens = JSON.parse(JSON.stringify(t)) as Tokens;
  switch (variant) {
    case "original":
      return v;
    case "minimal":
      v.radius = { sm: Math.min(t.radius.sm, 2), md: Math.min(t.radius.md, 4), lg: Math.min(t.radius.lg, 6), button: Math.min(t.radius.button, 4) };
      v.shadow = { sm: "none", md: "none", lg: "none" };
      v.style.shadow = "none";
      v.border.width = 1;
      v.border.style = "solid";
      v.style.hover = "darken";
      v.style.hoverAmount = 0;
      v.font.headingWeight = 600;
      v.font.headingTracking = -0.01;
      v.font.ratio = 1.2;
      v.space.unit = Math.max(t.space.unit, 6);
      v.motion.duration = Math.min(t.motion.duration || 120, 140);
      v.color.neutralChroma = 0.004;
      return v;
    case "modern":
      v.radius = { sm: 6, md: clamp(t.radius.md, 8, 14), lg: clamp(t.radius.lg, 14, 22), button: clamp(t.radius.button, 8, 9999) };
      v.shadow = softShadows();
      v.style.shadow = "soft";
      v.style.hover = "lift";
      v.style.hoverAmount = 2;
      v.font.headingWeight = 700;
      v.font.headingTracking = -0.02;
      v.font.ratio = 1.25;
      v.motion = { duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" };
      return v;
    case "elegant":
      v.font.heading = FONT_STACKS.serif;
      v.font.headingWeight = 500;
      v.font.headingTracking = 0.01;
      v.font.lineHeight = 1.75;
      v.font.ratio = 1.333;
      v.radius = { sm: 0, md: 2, lg: 2, button: 0 };
      v.shadow = {
        sm: "0 1px 2px rgba(15, 23, 42, 0.05)",
        md: "0 6px 24px rgba(15, 23, 42, 0.06)",
        lg: "0 24px 60px rgba(15, 23, 42, 0.08)",
      };
      v.style.shadow = "soft";
      v.style.buttonCase = "uppercase";
      v.style.buttonTracking = 0.12;
      v.style.hover = "darken";
      v.border.width = 1;
      v.space.unit = Math.max(t.space.unit, 6);
      v.motion = { duration: 260, easing: "ease-in-out" };
      v.color.secondary = muted(t.color.secondary, 0.6);
      v.color.accent = muted(t.color.accent, 0.6);
      return v;
    case "playful":
      v.font.heading = FONT_STACKS.rounded;
      v.font.body = t.font.body === FONT_STACKS.sans ? FONT_STACKS.rounded : t.font.body;
      v.font.headingWeight = 800;
      v.font.ratio = 1.3;
      v.radius = { sm: 10, md: 18, lg: 28, button: 9999 };
      v.border.width = 2;
      v.border.style = "solid";
      v.shadow = {
        sm: `2px 2px 0 ${oklch(0.25, 0.04, t.color.neutralHue)}`,
        md: `4px 4px 0 ${oklch(0.25, 0.04, t.color.neutralHue)}`,
        lg: `6px 6px 0 ${oklch(0.25, 0.04, t.color.neutralHue)}`,
      };
      v.style.shadow = "hard";
      v.style.hover = "scale";
      v.style.hoverAmount = 1.04;
      v.motion = { duration: 200, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" };
      v.color.accent = saturate(t.color.accent);
      return v;
    case "technical":
      v.font.heading = FONT_STACKS.mono;
      v.font.headingWeight = 600;
      v.font.headingTracking = -0.01;
      v.font.headingTransform = "uppercase";
      v.font.ratio = 1.2;
      v.radius = { sm: 0, md: 0, lg: 0, button: 0 };
      v.border.width = 2;
      v.border.style = "solid";
      v.shadow = { sm: "none", md: "none", lg: "none" };
      v.style.shadow = "none";
      v.style.buttonCase = "uppercase";
      v.style.buttonTracking = 0.06;
      v.style.focus = "dashed";
      v.style.hover = "underline";
      v.style.hoverAmount = 0;
      v.motion = { duration: 90, easing: "linear" };
      v.color.neutralChroma = 0.02;
      return v;
  }
}

function muted(color: string, factor: number): string {
  const o = describe(color);
  return oklch(o.l, o.c * factor, o.h);
}

function saturate(color: string): string {
  const o = describe(color);
  return oklch(clamp(o.l, 0.55, 0.75), Math.max(o.c, 0.17), o.h);
}

export interface ResolvedTokens {
  tokens: Tokens;
  source: Record<string, TokenSource>;
}

/** Casts a stored patch value to the type the token path holds. */
function coerce(current: unknown, value: unknown): unknown {
  if (typeof current === "number") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : current;
  }
  if (typeof current === "boolean") return value === true || value === "true" || value === 1;
  return typeof value === "string" ? value : String(value);
}

/**
 * Layers 1–3 for tokens. Imported values join the seed derivation as part of
 * the base. Under `original` nothing changes them; a creative variant runs on
 * top and re-interprets what it governs (geometry, type, depth), while values
 * it does not touch — usually the brand colours — stay as imported.
 */
export function resolveTokens(project: DesignProject): ResolvedTokens {
  const source: Record<string, TokenSource> = {};
  const base = deriveBase(project.seed, project.harmony);
  for (const p of TOKEN_PATHS) source[p] = "derived";

  let tokens = base;
  const imported = project.imported?.values ?? [];
  const applyImported = (t: Tokens): Tokens => {
    let out = t;
    for (const iv of imported) {
      const cur = getPath(out, iv.path);
      if (cur === undefined) continue;
      out = applyPatch(out, { [iv.path]: coerce(cur, iv.value) as string | number | boolean });
      source[iv.path] = "imported";
    }
    return out;
  };

  tokens = applyImported(tokens);
  if (project.variant !== "original") {
    const varianted = applyVariant(tokens, project.variant);
    for (const p of TOKEN_PATHS) {
      if (JSON.stringify(getPath(varianted, p)) !== JSON.stringify(getPath(tokens, p))) source[p] = "variant";
    }
    tokens = varianted;
  }

  for (const [path, value] of Object.entries(project.globals)) {
    const cur = getPath(tokens, path);
    if (cur === undefined || typeof cur === "object") continue;
    tokens = applyPatch(tokens, { [path]: coerce(cur, value) as string | number | boolean });
    source[path] = project.locks.includes(path) ? "locked" : "manual";
  }
  return { tokens, source };
}

/** Body and heading font sizes in px for a token set. */
export function typeScale(t: Tokens): Record<"sm" | "base" | "lg" | "xl" | "2xl" | "3xl", number> {
  const b = t.font.size;
  const r = t.font.ratio;
  const f = (n: number) => Math.round(b * r ** n * 100) / 100;
  return { sm: f(-1), base: b, lg: f(1), xl: f(2), "2xl": f(3), "3xl": f(4) };
}

/** Spacing steps 1–8 in px, from the unit. */
export function spaceScale(t: Tokens): number[] {
  const u = t.space.unit;
  return [1, 2, 3, 4, 6, 8, 12, 16].map((m) => m * u);
}
