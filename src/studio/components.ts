/**
 * Component recipes: tokens → one fully specified {@link ComponentStyle} per
 * standard component. Colours are role references (`var(--ds-color-…)`), so a
 * theme switch restyles every component consistently.
 *
 * Under the `original` variant the seed's own kind keeps the seed geometry
 * exactly — the button the user designed IS the system's button. A creative
 * variant re-derives it from tokens like every other component.
 */

import { normalizeColor, parseColor } from "./color";
import {
  COMPONENT_KINDS,
  applyPatch,
  corners,
  sides,
  type ComponentKind,
  type ComponentStyle,
  type DesignProject,
  type StateSet,
  type StateStyle,
} from "./model";
import type { ColorRole } from "./themes";
import { seedBrandColor, spaceScale, typeScale, type Tokens } from "./tokens";

export type ComponentSource = "generated" | "seed" | "manual";

export interface ResolvedComponent {
  kind: ComponentKind;
  style: ComponentStyle;
  /** Per dotted path: where the value came from (only seed/manual paths listed). */
  source: Record<string, ComponentSource>;
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
export const roleVar = (prefix: string, role: ColorRole) => `var(--${prefix}-color-${kebab(role)})`;

/** The CSS class names of the standard components. */
export function componentClass(prefix: string, kind: ComponentKind): string {
  const map: Record<ComponentKind, string> = {
    button: "btn",
    buttonSecondary: "btn--secondary",
    link: "link",
    heading: "heading",
    text: "text",
    card: "card",
    input: "input",
    label: "label",
    formButton: "submit",
    nav: "nav",
    footer: "footer",
  };
  return `${prefix}-${map[kind]}`;
}

function focusState(t: Tokens, c: (r: ColorRole) => string): StateStyle {
  return {
    outlineColor: c("focus"),
    outlineWidth: t.style.focus === "outline" ? 3 : 2,
    outlineOffset: 2,
  };
}

function hoverState(t: Tokens, c: (r: ColorRole) => string, solid: boolean): StateStyle {
  const base: StateStyle = solid ? { background: c("primaryHover") } : {};
  switch (t.style.hover) {
    case "lift":
      return { ...base, translateY: -t.style.hoverAmount, shadow: t.shadow.md === "none" ? undefined : t.shadow.md };
    case "scale":
      return { ...base, scale: t.style.hoverAmount };
    case "glow":
      return { ...base, shadow: `0 0 0 4px color-mix(in srgb, ${c("primary")} 30%, transparent)` };
    default:
      return base;
  }
}

function emptyStates(): StateSet {
  return { hover: {}, focus: {}, active: {}, disabled: {} };
}

function baseStyle(t: Tokens): ComponentStyle {
  return {
    background: "transparent",
    gradientTo: "",
    gradientAngle: 135,
    color: "inherit",
    fontFamily: t.font.body,
    fontSize: t.font.size,
    fontWeight: t.font.bodyWeight,
    lineHeight: t.font.lineHeight,
    letterSpacing: 0,
    textTransform: "none",
    textAlign: "left",
    borderWidth: sides(0),
    borderStyle: "solid",
    borderColor: sides("transparent"),
    radius: corners(0),
    padding: sides(0),
    minHeight: 0,
    shadow: "none",
    textShadow: "",
    filter: "",
    opacity: 1,
    transitionDuration: t.motion.duration,
    transitionEasing: t.motion.easing,
    animation: "none",
    states: emptyStates(),
  };
}

/** Rewrites a seed colour to the role it was pinned to, so themes can move it. */
function mapSeedColor(value: string, pins: Array<[string | undefined, ColorRole]>, c: (r: ColorRole) => string): string {
  const n = parseColor(value) ? normalizeColor(value) : null;
  if (!n) return value;
  for (const [literal, role] of pins) {
    if (literal && parseColor(literal) && normalizeColor(literal) === n) return c(role);
  }
  return value;
}

function seedAsComponent(project: DesignProject, c: (r: ColorRole) => string): ComponentStyle {
  const s = JSON.parse(JSON.stringify(project.seed.style)) as ComponentStyle;
  const kind = project.seed.kind;
  // A button whose fill is not the brand colour (a black button on a blue
  // brand) keeps its literal fill: pinning it to `primary` would repaint it.
  const brandFill = parseColor(s.background) && normalizeColor(s.background) === normalizeColor(seedBrandColor(project.seed));
  const pins: Array<[string | undefined, ColorRole]> =
    kind === "button" && !brandFill
      ? [[s.states.focus.outlineColor, "focus"]]
      : kind === "button"
      ? [
          [s.background, "primary"],
          [s.gradientTo, "gradientTo"],
          [s.color, "onPrimary"],
          [s.states.hover.background, "primaryHover"],
          [s.states.active.background, "primaryActive"],
          [s.states.focus.outlineColor, "focus"],
        ]
      : kind === "card"
        ? [
            [s.background, "surface"],
            [s.color, "text"],
            [s.borderColor.top, "border"],
          ]
        : kind === "input"
          ? [
              [s.background, "field"],
              [s.color, "text"],
              [s.borderColor.top, "borderStrong"],
              [s.states.focus.outlineColor, "focus"],
              [s.states.focus.borderColor, "focus"],
            ]
          : [
              [s.color, "link"],
              [s.states.hover.color, "linkHover"],
              [s.states.focus.outlineColor, "focus"],
            ];
  const m = (v: string) => mapSeedColor(v, pins, c);
  s.background = m(s.background);
  if (s.gradientTo) s.gradientTo = m(s.gradientTo);
  s.color = m(s.color);
  s.borderColor = { top: m(s.borderColor.top), right: m(s.borderColor.right), bottom: m(s.borderColor.bottom), left: m(s.borderColor.left) };
  for (const st of Object.values(s.states) as StateStyle[]) {
    if (st.background) st.background = m(st.background);
    if (st.color) st.color = m(st.color);
    if (st.borderColor) st.borderColor = m(st.borderColor);
    if (st.outlineColor) st.outlineColor = m(st.outlineColor);
  }
  if (!s.states.focus.outlineColor && (s.states.focus.outlineWidth ?? 0) > 0) s.states.focus.outlineColor = c("focus");
  return s;
}

/** Generated recipe of a component from tokens alone (layer 1/2). */
export function recipe(kind: ComponentKind, t: Tokens, prefix: string): ComponentStyle {
  const c = (r: ColorRole) => roleVar(prefix, r);
  const sp = spaceScale(t);
  const ts = typeScale(t);
  const b = baseStyle(t);
  const u = t.space.unit;
  const hard = t.style.shadow === "hard";
  const framed = hard || t.style.focus === "dashed";
  switch (kind) {
    case "button":
    case "formButton":
      return {
        ...b,
        background: c("primary"),
        color: c("onPrimary"),
        fontWeight: 600,
        lineHeight: 1.25,
        letterSpacing: t.style.buttonTracking,
        textTransform: t.style.buttonCase,
        textAlign: "center",
        borderWidth: sides(framed ? t.border.width : 0),
        borderStyle: "solid",
        borderColor: sides(hard ? c("text") : c("primary")),
        radius: corners(t.radius.button),
        padding: { top: sp[2]!, right: sp[4]!, bottom: sp[2]!, left: sp[4]! },
        minHeight: 44,
        shadow: t.style.shadow === "none" ? "none" : t.shadow.sm,
        states: {
          hover: hoverState(t, c, true),
          focus: focusState(t, c),
          active: { background: c("primaryActive"), scale: hard ? 1 : 0.98, translateY: hard ? 2 : 0 },
          disabled: { background: c("disabled"), color: c("onDisabled"), shadow: "none", opacity: 1 },
        },
      };
    case "buttonSecondary":
      return {
        ...b,
        background: "transparent",
        color: c("link"),
        fontWeight: 600,
        lineHeight: 1.25,
        letterSpacing: t.style.buttonTracking,
        textTransform: t.style.buttonCase,
        textAlign: "center",
        borderWidth: sides(Math.max(1, t.border.width)),
        borderStyle: "solid",
        borderColor: sides(c("link")),
        radius: corners(t.radius.button),
        padding: { top: sp[2]! - 1, right: sp[4]! - 1, bottom: sp[2]! - 1, left: sp[4]! - 1 },
        minHeight: 44,
        states: {
          hover: { background: c("surfaceAlt"), color: c("linkHover"), borderColor: c("linkHover") },
          focus: focusState(t, c),
          active: { scale: 0.98 },
          disabled: { color: c("onDisabled"), borderColor: c("disabled"), opacity: 1 },
        },
      };
    case "link":
      return {
        ...b,
        color: c("link"),
        fontWeight: 500,
        radius: corners(2),
        states: {
          hover: { color: c("linkHover") },
          focus: { ...focusState(t, c), outlineOffset: 2 },
          active: {},
          disabled: { opacity: 0.5 },
        },
      };
    case "heading":
      return {
        ...b,
        color: c("text"),
        fontFamily: t.font.heading,
        fontSize: ts["2xl"],
        fontWeight: t.font.headingWeight,
        lineHeight: t.font.headingLineHeight,
        letterSpacing: t.font.headingTracking,
        textTransform: t.font.headingTransform,
        transitionDuration: 0,
      };
    case "text":
      return { ...b, color: c("text"), transitionDuration: 0 };
    case "card":
      return {
        ...b,
        background: c("surface"),
        color: c("text"),
        borderWidth: sides(t.style.shadow === "soft" ? 1 : t.border.width),
        borderStyle: "solid",
        borderColor: sides(hard ? c("text") : c("border")),
        radius: corners(t.radius.lg),
        padding: sides(sp[4]!),
        shadow: t.style.shadow === "none" ? "none" : t.shadow.md,
        states: {
          hover: t.style.hover === "lift" ? { translateY: -t.style.hoverAmount, shadow: t.shadow.lg } : {},
          focus: focusState(t, c),
          active: {},
          disabled: {},
        },
      };
    case "input":
      return {
        ...b,
        background: c("field"),
        color: c("text"),
        fontSize: Math.max(16, t.font.size),
        lineHeight: 1.4,
        borderWidth: sides(Math.max(1, Math.min(t.border.width, 2))),
        borderStyle: "solid",
        borderColor: sides(c("borderStrong")),
        radius: corners(t.radius.md),
        padding: { top: Math.round(u * 2.5), right: u * 3, bottom: Math.round(u * 2.5), left: u * 3 },
        minHeight: 44,
        states: {
          hover: { borderColor: c("text") },
          focus: { borderColor: c("focus"), outlineColor: c("focus"), outlineWidth: 2, outlineOffset: 1 },
          active: {},
          disabled: { background: c("disabled"), color: c("onDisabled"), opacity: 1 },
        },
      };
    case "label":
      return { ...b, color: c("text"), fontSize: Math.max(14, ts.sm), fontWeight: 600, lineHeight: 1.4, transitionDuration: 0 };
    case "nav":
      return {
        ...b,
        background: c("surface"),
        color: c("text"),
        fontWeight: 500,
        borderWidth: { top: 0, right: 0, bottom: 1, left: 0 },
        borderStyle: "solid",
        borderColor: sides(c("border")),
        padding: { top: sp[2]!, right: sp[4]!, bottom: sp[2]!, left: sp[4]! },
        shadow: t.style.shadow === "soft" ? t.shadow.sm : "none",
        states: { hover: { color: c("link") }, focus: focusState(t, c), active: {}, disabled: {} },
      };
    case "footer":
      return {
        ...b,
        background: c("surfaceAlt"),
        color: c("muted"),
        fontSize: Math.max(14, ts.sm),
        borderWidth: { top: 1, right: 0, bottom: 0, left: 0 },
        borderStyle: "solid",
        borderColor: sides(c("border")),
        padding: { top: sp[5]!, right: sp[4]!, bottom: sp[5]!, left: sp[4]! },
        transitionDuration: 0,
        states: { hover: { color: c("text") }, focus: focusState(t, c), active: {}, disabled: {} },
      };
  }
}

/** Flattens an object into dotted paths (leaves only). */
export function flatten(obj: unknown, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (obj === null || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flatten(v, p));
    else out[p] = v;
  }
  return out;
}

export function resolveComponents(project: DesignProject, t: Tokens): Record<ComponentKind, ResolvedComponent> {
  const c = (r: ColorRole) => roleVar(project.prefix, r);
  const out = {} as Record<ComponentKind, ResolvedComponent>;
  for (const kind of COMPONENT_KINDS) {
    const source: Record<string, ComponentSource> = {};
    let style: ComponentStyle;
    const seedKind = project.seed.kind;
    if (project.variant === "original" && seedKind === kind) {
      style = seedAsComponent(project, c);
      for (const p of Object.keys(flatten(style))) source[p] = "seed";
    } else if (kind === "formButton") {
      // The form button follows the (resolved) button unless edited itself.
      style = JSON.parse(JSON.stringify(out.button.style)) as ComponentStyle;
    } else {
      style = recipe(kind, t, project.prefix);
    }
    const patch = project.components[kind];
    if (patch) {
      style = applyPatch(style, patch);
      for (const p of Object.keys(patch)) source[p] = "manual";
    }
    out[kind] = { kind, style, source };
  }
  return out;
}
