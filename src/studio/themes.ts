/**
 * Themes: every theme maps the SAME semantic colour roles, derived by rule from
 * the brand tokens. Components only ever reference roles (`var(--ds-color-…)`),
 * so light, dark and any named theme cannot contradict each other per component.
 */

import {
  contrast,
  describe,
  ensureContrast,
  normalizeColor,
  oklch,
  parseColor,
  readableOn,
  shiftLightness,
} from "./color";
import type { DesignProject, Seed, ThemeDef } from "./model";
import { seedBrandColor, type Tokens } from "./tokens";

export const COLOR_ROLES = [
  "background",
  "surface",
  "surfaceAlt",
  "text",
  "muted",
  "border",
  "borderStrong",
  "field",
  "primary",
  "primaryHover",
  "primaryActive",
  "onPrimary",
  "gradientTo",
  "secondary",
  "onSecondary",
  "accent",
  "onAccent",
  "link",
  "linkHover",
  "focus",
  "success",
  "warning",
  "danger",
  "disabled",
  "onDisabled",
] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];
export type RoleMap = Record<ColorRole, string>;
export type RoleSource = "derived" | "imported" | "seed" | "manual";

export interface ResolvedTheme {
  def: ThemeDef;
  colors: RoleMap;
  source: Record<ColorRole, RoleSource>;
}

/** Ensures `fg` against every listed background. */
function ensureAll(fg: string, bgs: string[], target: number): string {
  let out = fg;
  for (let pass = 0; pass < 3; pass++) {
    for (const bg of bgs) out = ensureContrast(out, bg, target);
    if (bgs.every((bg) => (contrast(out, bg) ?? 0) >= target)) break;
  }
  return out;
}

/** The colour roles the designed seed component pins in the light theme. */
export function seedRoles(seed: Seed, tokens: Tokens): Partial<RoleMap> {
  const s = seed.style;
  const out: Partial<RoleMap> = {};
  const ok = (c: string | undefined) => !!c && !!parseColor(c) && parseColor(c)!.a > 0;
  const brand = normalizeColor(seedBrandColor(seed));
  const brandUnchanged = normalizeColor(tokens.color.primary) === brand;
  switch (seed.kind) {
    case "button":
      if (brandUnchanged && ok(s.background) && normalizeColor(s.background) === brand) {
        if (ok(s.color)) out.onPrimary = normalizeColor(s.color);
        if (ok(s.states.hover.background)) out.primaryHover = normalizeColor(s.states.hover.background!);
        if (ok(s.states.active.background)) out.primaryActive = normalizeColor(s.states.active.background!);
        if (ok(s.gradientTo)) out.gradientTo = normalizeColor(s.gradientTo);
      }
      if (ok(s.states.focus.outlineColor)) out.focus = normalizeColor(s.states.focus.outlineColor!);
      break;
    case "card":
      if (ok(s.background)) out.surface = normalizeColor(s.background);
      if (ok(s.color)) out.text = normalizeColor(s.color);
      if (ok(s.borderColor.top) && s.borderWidth.top > 0) out.border = normalizeColor(s.borderColor.top);
      break;
    case "input":
      if (ok(s.background)) out.field = normalizeColor(s.background);
      if (ok(s.color)) out.text = normalizeColor(s.color);
      if (ok(s.borderColor.top)) out.borderStrong = normalizeColor(s.borderColor.top);
      if (ok(s.states.focus.outlineColor)) out.focus = normalizeColor(s.states.focus.outlineColor!);
      break;
    case "link":
      if (brandUnchanged && ok(s.color)) out.link = normalizeColor(s.color);
      if (brandUnchanged && ok(s.states.hover.color)) out.linkHover = normalizeColor(s.states.hover.color!);
      break;
  }
  return out;
}

/** Rule-based colours for one theme, before seed pins and manual overrides. */
export function deriveRoles(t: Tokens, base: "light" | "dark", more: boolean, hasGradient: boolean): RoleMap {
  const h = t.color.neutralHue;
  const nc = t.color.neutralChroma;
  const n = (l: number, c = nc) => oklch(l, c, h);
  const dark = base === "dark";

  const background = dark ? n(more ? 0.12 : 0.18, nc * 1.5) : n(more ? 1 : 0.985);
  const surface = dark ? n(more ? 0.16 : 0.22, nc * 1.5) : n(1, 0);
  const surfaceAlt = dark ? n(more ? 0.2 : 0.26, nc * 1.5) : n(more ? 0.95 : 0.96);
  const grounds = [background, surface, surfaceAlt];
  const text = dark ? n(more ? 0.99 : 0.94, nc) : n(more ? 0.12 : 0.22, nc * 2);
  const textTarget = more ? 7 : 4.5;
  const muted = ensureAll(dark ? n(0.74) : n(0.5), grounds, textTarget);
  // Against every ground a field can sit on — including its own fill, which
  // in the dark theme is surfaceAlt, not the page.
  const borderStrong = ensureAll(dark ? n(0.5) : n(0.62), grounds, more ? 4.5 : 3);
  const border = more ? borderStrong : dark ? n(0.32, nc * 1.5) : n(0.9);

  const uiTarget = more ? 4.5 : 3;
  const brand = (c: string) => (dark || more ? ensureAll(c, [background, surface], uiTarget) : c);
  const primary = brand(t.color.primary);
  const step = dark ? 0.06 : -0.06;
  const secondary = brand(t.color.secondary);
  const accent = brand(t.color.accent);
  const link = ensureAll(t.color.primary, grounds, more ? 7 : 4.5);
  const gradientTo = hasGradient ? brand(shiftLightness(t.color.primary, dark ? 0.1 : -0.1)) : primary;

  const sem = (l: number, c: number, hue: number) => ensureAll(oklch(l, c, hue), grounds, textTarget);
  return {
    background,
    surface,
    surfaceAlt,
    text,
    muted,
    border,
    borderStrong,
    field: dark ? surfaceAlt : surface,
    primary,
    primaryHover: stateFill(primary, step, readableOn(primary)),
    primaryActive: stateFill(primary, step * 1.8, readableOn(primary)),
    onPrimary: readableOn(primary),
    gradientTo,
    secondary,
    onSecondary: readableOn(secondary),
    accent,
    onAccent: readableOn(accent),
    link,
    linkHover: ensureAll(shiftLightness(link, dark ? 0.08 : -0.08), grounds, more ? 7 : 4.5),
    focus: ensureAll(t.color.primary, [background, surface], more ? 4.5 : 3),
    success: sem(dark ? 0.75 : 0.5, 0.14, 150),
    warning: sem(dark ? 0.8 : 0.52, 0.13, 70),
    danger: sem(dark ? 0.72 : 0.52, 0.19, 27),
    disabled: dark ? n(0.3) : n(0.92),
    onDisabled: dark ? n(0.62) : n(0.52),
  };
}

/**
 * A hover/active fill that keeps the button text readable: shifted the
 * preferred way if that still gives 4.5:1, else the other way, else whichever
 * of the two reads better.
 */
function stateFill(fill: string, step: number, text: string): string {
  const preferred = shiftLightness(fill, step);
  if ((contrast(text, preferred) ?? 0) >= 4.5) return preferred;
  const other = shiftLightness(fill, -step);
  return (contrast(text, other) ?? 0) > (contrast(text, preferred) ?? 0) ? other : preferred;
}

export function resolveTheme(project: DesignProject, tokens: Tokens, def: ThemeDef): ResolvedTheme {
  const more = def.contrast === "more";
  const hasGradient = !!project.seed.style.gradientTo && project.seed.kind === "button";
  const colors = deriveRoles(tokens, def.base, more, hasGradient);
  const source = Object.fromEntries(COLOR_ROLES.map((r) => [r, "derived"])) as Record<ColorRole, RoleSource>;

  // Imported colours (a CSS file's variables, a page's body colour) land in
  // the theme they were found for: `role.x` light, `role.dark.x` dark.
  if (!more) {
    const prefix = def.base === "light" ? "role." : "role.dark.";
    for (const v of project.imported?.values ?? []) {
      if (!v.path.startsWith(prefix)) continue;
      const role = v.path.slice(prefix.length);
      if (role.includes(".") || !(COLOR_ROLES as readonly string[]).includes(role) || typeof v.value !== "string" || !parseColor(v.value)) continue;
      colors[role as ColorRole] = normalizeColor(v.value);
      source[role as ColorRole] = "imported";
    }
  }
  // The seed pins its own colours only where they were designed: the light
  // ground at normal contrast. Dark and high-contrast themes re-derive them.
  if (def.base === "light" && !more) {
    for (const [role, value] of Object.entries(seedRoles(project.seed, tokens))) {
      colors[role as ColorRole] = value;
      source[role as ColorRole] = "seed";
    }
  }
  for (const [role, value] of Object.entries(def.overrides)) {
    if ((COLOR_ROLES as readonly string[]).includes(role) && parseColor(value)) {
      colors[role as ColorRole] = normalizeColor(value);
      source[role as ColorRole] = "manual";
    }
  }
  return { def, colors, source };
}

export function resolveThemes(project: DesignProject, tokens: Tokens): ResolvedTheme[] {
  return project.themes.map((def) => resolveTheme(project, tokens, def));
}

/** The theme that `prefers-color-scheme` should pick for a base, if any. */
export function autoTheme(themes: ResolvedTheme[], base: "light" | "dark"): ResolvedTheme | undefined {
  return (
    themes.find((t) => t.def.id === base && t.def.contrast === "normal") ??
    themes.find((t) => t.def.base === base && t.def.contrast === "normal")
  );
}

export function contrastTheme(themes: ResolvedTheme[], base: "light" | "dark"): ResolvedTheme | undefined {
  return themes.find((t) => t.def.base === base && t.def.contrast === "more");
}

/** Light-to-dark lightness order check used by tests and the UI swatches. */
export const isDarkGround = (colors: RoleMap) => describe(colors.background).l < 0.5;
