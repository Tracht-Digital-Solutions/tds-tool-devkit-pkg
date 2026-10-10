/**
 * Checks the user's own CSS: syntax errors and warnings from the parser, plus
 * the properties it overrides in generated component rules. Overriding is
 * allowed — custom CSS is the highest layer on purpose — but it is shown, so a
 * later change in the visual editor that "does nothing" has a visible cause.
 */

import { COMPONENT_KINDS, type ComponentKind } from "./model";
import { componentSelector, emitCss } from "./css";
import { flattenRules, parseCss, splitSelectorList, type CssIssue } from "./cssParser";
import type { ResolvedProject } from "./resolve";

export interface CssConflict {
  selector: string;
  property: string;
  kind: ComponentKind | null;
  line: number;
}

export interface CustomCssCheck {
  issues: CssIssue[];
  conflicts: CssConflict[];
}

const norm = (s: string) => s.replace(/\s+/g, " ").replace(/\s*([>+~,])\s*/g, "$1").trim();

export function checkCustomCss(r: ResolvedProject): CustomCssCheck {
  const src = r.project.customCss;
  const { nodes, issues } = parseCss(src);
  const generated = flattenRules(parseCss(emitCss(r, { includeCustom: false, includeImported: false, header: false })).nodes);
  const genProps = new Map<string, Set<string>>();
  for (const rule of generated) {
    for (const sel of splitSelectorList(rule.selector)) {
      const key = norm(sel);
      const set = genProps.get(key) ?? new Set<string>();
      for (const d of rule.decls) if (!d.prop.startsWith("--")) set.add(d.prop);
      genProps.set(key, set);
    }
  }
  const kindOf = (sel: string): ComponentKind | null => {
    for (const k of [...COMPONENT_KINDS].reverse()) {
      if (norm(sel).startsWith(norm(componentSelector(r.project.prefix, k)))) return k;
    }
    return null;
  };
  const conflicts: CssConflict[] = [];
  for (const rule of flattenRules(nodes)) {
    for (const sel of splitSelectorList(rule.selector)) {
      const props = genProps.get(norm(sel));
      if (!props) continue;
      for (const d of rule.decls) {
        if (props.has(d.prop)) {
          const line = src.slice(0, d.start).split("\n").length;
          conflicts.push({ selector: sel, property: d.prop, kind: kindOf(sel), line });
        }
      }
    }
  }
  for (const rule of flattenRules(nodes)) {
    for (const d of rule.decls) {
      if (d.important) {
        const line = src.slice(0, d.start).split("\n").length;
        issues.push({ severity: "warning", message: `„${d.prop}“ mit !important lässt sich später kaum noch überschreiben.`, line, column: 1, offset: d.start });
      }
    }
  }
  return { issues, conflicts };
}
