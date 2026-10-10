/**
 * The studio's state transitions. Pure, so every rule about what survives
 * which edit is testable without a browser:
 *
 * - editing the seed re-derives generated values, never manual ones;
 * - switching the variant keeps globals, component edits, themes and custom CSS;
 * - a lock freezes the CURRENT value into the manual layer;
 * - resetting manual edits keeps the custom CSS (it has its own editor).
 */

import { applySuggestion, type Suggestion } from "./a11y";
import type { Harmony } from "./color";
import {
  COMPONENT_KINDS,
  defaultStyle,
  isValidPrefix,
  setPath,
  type ComponentKind,
  type DesignProject,
  type SeedKind,
  type ThemeDef,
  type VariantId,
} from "./model";
import { COLOR_ROLES } from "./themes";

export type Action =
  | { type: "load"; project: DesignProject }
  | { type: "name"; name: string }
  | { type: "prefix"; prefix: string }
  | { type: "seedKind"; kind: SeedKind }
  | { type: "seed"; path: string; value: unknown }
  | { type: "variant"; variant: VariantId }
  | { type: "harmony"; harmony: Harmony }
  | { type: "global"; path: string; value: string | number | boolean }
  | { type: "resetGlobal"; path: string }
  | { type: "lock"; path: string; value: string | number | boolean }
  | { type: "unlock"; path: string }
  | { type: "component"; kind: ComponentKind; path: string; value: string | number | boolean }
  | { type: "resetComponent"; kind: ComponentKind; path?: string }
  | { type: "themeAdd"; name: string; base: "light" | "dark"; contrast: "normal" | "more" }
  | { type: "themeUpdate"; id: string; name?: string; base?: "light" | "dark"; contrast?: "normal" | "more" }
  | { type: "themeRole"; id: string; role: string; value: string | null }
  | { type: "themeRemove"; id: string }
  | { type: "customCss"; css: string }
  | { type: "resetManual" }
  | { type: "suggestion"; suggestion: Suggestion };

function themeId(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "theme";
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
}

export function reduce(p: DesignProject, a: Action): DesignProject {
  switch (a.type) {
    case "load":
      return a.project;
    case "name":
      return { ...p, name: a.name.slice(0, 120) };
    case "prefix":
      return isValidPrefix(a.prefix) ? { ...p, prefix: a.prefix } : p;
    case "seedKind":
      return a.kind === p.seed.kind ? p : { ...p, seed: { kind: a.kind, style: defaultStyle(a.kind) } };
    case "seed":
      return { ...p, seed: { ...p.seed, style: setPath(p.seed.style, a.path, a.value) } };
    case "variant":
      return { ...p, variant: a.variant };
    case "harmony":
      return { ...p, harmony: a.harmony };
    case "global":
      return { ...p, globals: { ...p.globals, [a.path]: a.value } };
    case "resetGlobal": {
      const { [a.path]: _gone, ...rest } = p.globals;
      return { ...p, globals: rest, locks: p.locks.filter((l) => l !== a.path) };
    }
    case "lock":
      return p.locks.includes(a.path) ? p : { ...p, locks: [...p.locks, a.path], globals: { ...p.globals, [a.path]: a.value } };
    case "unlock": {
      // Unlocking releases the value back to the generator.
      const { [a.path]: _gone, ...rest } = p.globals;
      return { ...p, locks: p.locks.filter((l) => l !== a.path), globals: rest };
    }
    case "component":
      return { ...p, components: { ...p.components, [a.kind]: { ...(p.components[a.kind] ?? {}), [a.path]: a.value } } };
    case "resetComponent": {
      if (!a.path) {
        const { [a.kind]: _gone, ...rest } = p.components;
        return { ...p, components: rest };
      }
      const current = { ...(p.components[a.kind] ?? {}) };
      for (const key of Object.keys(current)) if (key === a.path || key.startsWith(`${a.path}.`)) delete current[key];
      return { ...p, components: { ...p.components, [a.kind]: current } };
    }
    case "themeAdd": {
      if (p.themes.length >= 12) return p;
      const def: ThemeDef = {
        id: themeId(a.name, p.themes.map((t) => t.id)),
        name: a.name.slice(0, 40) || "Theme",
        base: a.base,
        contrast: a.contrast,
        overrides: {},
      };
      return { ...p, themes: [...p.themes, def] };
    }
    case "themeUpdate":
      return {
        ...p,
        themes: p.themes.map((t) =>
          t.id === a.id
            ? { ...t, name: a.name !== undefined ? a.name.slice(0, 40) : t.name, base: a.base ?? t.base, contrast: a.contrast ?? t.contrast }
            : t,
        ),
      };
    case "themeRole": {
      if (!(COLOR_ROLES as readonly string[]).includes(a.role)) return p;
      return {
        ...p,
        themes: p.themes.map((t) => {
          if (t.id !== a.id) return t;
          const overrides = { ...t.overrides };
          if (a.value === null) delete overrides[a.role];
          else overrides[a.role] = a.value;
          return { ...t, overrides };
        }),
      };
    }
    case "themeRemove":
      return p.themes.length <= 1 ? p : { ...p, themes: p.themes.filter((t) => t.id !== a.id) };
    case "customCss":
      return { ...p, customCss: a.css.slice(0, 200_000) };
    case "resetManual": {
      const locked = Object.fromEntries(Object.entries(p.globals).filter(([k]) => p.locks.includes(k)));
      return { ...p, globals: locked, components: {}, themes: p.themes.map((t) => ({ ...t, overrides: {} })) };
    }
    case "suggestion":
      return applySuggestion(p, a.suggestion);
  }
}

/** Count of manual edits, for the "you have N own adjustments" hint. */
export function manualCount(p: DesignProject): number {
  return (
    Object.keys(p.globals).length +
    COMPONENT_KINDS.reduce((n, k) => n + Object.keys(p.components[k] ?? {}).length, 0) +
    p.themes.reduce((n, t) => n + Object.keys(t.overrides).length, 0)
  );
}
