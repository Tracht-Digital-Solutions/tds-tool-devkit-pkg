/**
 * Rule-based accessibility assistant for the checkable design properties.
 *
 * It checks colour contrast, focus visibility, sizes, motion and target sizes
 * against WCAG 2.2 success criteria and proposes concrete fixes. It never
 * claims conformance: most of WCAG is about content and markup, which a design
 * system cannot decide — those items are listed as "manual" instead.
 */

import { contrast, ensureContrast, parseColor, round2 } from "./color";
import type { ComponentKind, ComponentStyle, DesignProject } from "./model";
import type { ResolvedProject } from "./resolve";
import type { ColorRole, ResolvedTheme } from "./themes";

export type CheckStatus = "pass" | "fail" | "warn" | "manual";
export type Level = "A" | "AA" | "AAA" | "Empfehlung";

export type SuggestionTarget =
  | { scope: "theme"; themeId: string; role: ColorRole; value: string }
  | { scope: "component"; kind: ComponentKind; path: string; value: string | number };

export interface Suggestion {
  /** German, imperative: what applying it does. */
  text: string;
  target: SuggestionTarget;
  /** True when it would overwrite something the user set on purpose. */
  overridesUserChoice: boolean;
  /** Contrast after applying, where meaningful. */
  after?: number;
}

export interface Finding {
  id: string;
  status: CheckStatus;
  criterion: string;
  level: Level;
  /** Component or area the finding is about. */
  subject: string;
  themeId?: string;
  /** The checked property, in words. */
  property: string;
  actual?: string;
  required?: string;
  message: string;
  suggestion?: Suggestion;
}

export interface Report {
  findings: Finding[];
  counts: Record<CheckStatus, number>;
}

const SUBJECT: Record<ComponentKind, string> = {
  button: "Button",
  buttonSecondary: "Zweiter Button",
  link: "Link",
  heading: "Überschrift",
  text: "Fließtext",
  card: "Karte",
  input: "Formularfeld",
  label: "Label",
  formButton: "Formular-Button",
  nav: "Navigation",
  footer: "Footer",
};

const VAR_RE = /var\(--[a-z0-9-]+?-color-([a-z-]+)\)/;
const camel = (s: string) => s.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());

/** The role a component colour points at, if it is a role reference. */
export function roleOf(value: string): ColorRole | null {
  const m = VAR_RE.exec(value);
  return m ? (camel(m[1]!) as ColorRole) : null;
}

/** A component colour as a concrete colour in a theme (null for gradients / unknown). */
export function colorIn(value: string | undefined, theme: ResolvedTheme): string | null {
  if (!value) return null;
  const role = roleOf(value);
  if (role) return theme.colors[role] ?? null;
  if (value === "transparent") return null;
  return parseColor(value) ? value : null;
}

const isLarge = (s: ComponentStyle) => s.fontSize >= 24 || (s.fontSize >= 18.66 && s.fontWeight >= 700);

interface Ctx {
  r: ResolvedProject;
  out: Finding[];
}

/** Proposes a fix for a foreground colour: theme role if it is one, else a component override. */
function fixColor(
  ctx: Ctx,
  theme: ResolvedTheme,
  kind: ComponentKind,
  path: string,
  value: string,
  against: string[],
  target: number,
): Suggestion | undefined {
  const current = colorIn(value, theme);
  if (!current) return undefined;
  let fixed = current;
  for (let i = 0; i < 3; i++) for (const bg of against) fixed = ensureContrast(fixed, bg, target);
  const after = Math.min(...against.map((bg) => contrast(fixed, bg) ?? 0));
  if (after < target) return undefined;
  const role = roleOf(value);
  if (role) {
    const src = theme.source[role];
    return {
      text: `Farbrolle „${role}“ im Theme „${theme.def.name}“ auf ${fixed} setzen.`,
      target: { scope: "theme", themeId: theme.def.id, role, value: fixed },
      overridesUserChoice: src === "manual" || src === "seed",
      after: round2(after),
    };
  }
  const comp = ctx.r.components[kind];
  return {
    text: `Farbe von „${SUBJECT[kind]}“ auf ${fixed} setzen.`,
    target: { scope: "component", kind, path, value: fixed },
    overridesUserChoice: comp.source[path] === "manual" || comp.source[path] === "seed",
    after: round2(after),
  };
}

function contrastCheck(
  ctx: Ctx,
  theme: ResolvedTheme,
  opts: {
    id: string;
    kind: ComponentKind;
    property: string;
    fgPath: string;
    fg: string | undefined;
    bgs: Array<string | null>;
    text: boolean;
    large?: boolean;
  },
) {
  const fg = colorIn(opts.fg, theme);
  const bgs = opts.bgs.filter((b): b is string => !!b);
  const subject = SUBJECT[opts.kind];
  if (!fg || bgs.length === 0) {
    ctx.out.push({
      id: `${opts.id}:${theme.def.id}`,
      status: "manual",
      criterion: opts.text ? "1.4.3 Kontrast (Minimum)" : "1.4.11 Nicht-Text-Kontrast",
      level: "AA",
      subject,
      themeId: theme.def.id,
      property: opts.property,
      message: "Nicht automatisch prüfbar (Verlauf, Transparenz oder eigene Farbfunktion). Bitte mit dem Kontrast-Checker an der echten Darstellung prüfen.",
    });
    return;
  }
  const ratio = Math.min(...bgs.map((bg) => contrast(fg, bg) ?? 21));
  const aa = opts.text ? (opts.large ? 3 : 4.5) : 3;
  const aaa = opts.text ? (opts.large ? 4.5 : 7) : null;
  const base = {
    subject,
    themeId: theme.def.id,
    property: opts.property,
    actual: `${round2(ratio)}:1`,
  };
  if (ratio < aa) {
    ctx.out.push({
      ...base,
      id: `${opts.id}:${theme.def.id}`,
      status: "fail",
      criterion: opts.text ? "1.4.3 Kontrast (Minimum)" : "1.4.11 Nicht-Text-Kontrast",
      level: "AA",
      required: `${aa}:1`,
      message: `${subject}: ${opts.property} erreicht im Theme „${theme.def.name}“ nur ${round2(ratio)}:1, benötigt werden ${aa}:1${opts.large ? " (großer Text)" : ""}.`,
      suggestion: fixColor(ctx, theme, opts.kind, opts.fgPath, opts.fg ?? "", bgs, aa),
    });
    return;
  }
  ctx.out.push({
    ...base,
    id: `${opts.id}:${theme.def.id}`,
    status: "pass",
    criterion: opts.text ? "1.4.3 Kontrast (Minimum)" : "1.4.11 Nicht-Text-Kontrast",
    level: "AA",
    required: `${aa}:1`,
    message: `${subject}: ${opts.property} ${round2(ratio)}:1 — erfüllt AA.`,
  });
  if (aaa !== null) {
    const ok = ratio >= aaa;
    ctx.out.push({
      ...base,
      id: `${opts.id}-aaa:${theme.def.id}`,
      status: ok ? "pass" : "warn",
      criterion: "1.4.6 Kontrast (erhöht)",
      level: "AAA",
      required: `${aaa}:1`,
      message: ok
        ? `${subject}: ${opts.property} erfüllt auch AAA.`
        : `${subject}: ${opts.property} erfüllt AA, aber nicht AAA (${aaa}:1).`,
      suggestion: ok ? undefined : fixColor(ctx, theme, opts.kind, opts.fgPath, opts.fg ?? "", bgs, aaa),
    });
  }
}

function themeChecks(ctx: Ctx, theme: ResolvedTheme) {
  const c = ctx.r.components;
  const tc = theme.colors;
  const page = tc.background;
  const bgOf = (kind: ComponentKind) => colorIn(c[kind].style.background, theme) ?? page;

  contrastCheck(ctx, theme, { id: "text", kind: "text", property: "Textfarbe auf Seiten- und Kartenhintergrund", fgPath: "color", fg: c.text.style.color, bgs: [page, colorIn(c.card.style.background, theme)], text: true });
  contrastCheck(ctx, theme, { id: "muted", kind: "text", property: "Gedämpfter Text (muted)", fgPath: "color", fg: `var(--${ctx.r.project.prefix}-color-muted)`, bgs: [page, tc.surface, tc.surfaceAlt], text: true });
  contrastCheck(ctx, theme, { id: "heading", kind: "heading", property: "Überschriftenfarbe", fgPath: "color", fg: c.heading.style.color, bgs: [page], text: true, large: true });
  contrastCheck(ctx, theme, { id: "link", kind: "link", property: "Linkfarbe", fgPath: "color", fg: c.link.style.color, bgs: [page, colorIn(c.card.style.background, theme)], text: true });

  const btn = c.button.style;
  const btnBgs = btn.gradientTo ? [colorIn(btn.background, theme), colorIn(btn.gradientTo, theme)] : [bgOf("button")];
  contrastCheck(ctx, theme, { id: "button-text", kind: "button", property: "Buttontext auf Buttonfläche", fgPath: "color", fg: btn.color, bgs: btnBgs, text: true, large: isLarge(btn) });
  if (btn.states.hover.background || btn.states.hover.color) {
    contrastCheck(ctx, theme, {
      id: "button-hover",
      kind: "button",
      property: "Buttontext im Hover-Zustand",
      fgPath: btn.states.hover.color ? "states.hover.color" : "color",
      fg: btn.states.hover.color ?? btn.color,
      bgs: [colorIn(btn.states.hover.background, theme) ?? bgOf("button")],
      text: true,
      large: isLarge(btn),
    });
  }
  const sec = c.buttonSecondary.style;
  contrastCheck(ctx, theme, { id: "button2-text", kind: "buttonSecondary", property: "Text des zweiten Buttons", fgPath: "color", fg: sec.color, bgs: [colorIn(sec.background, theme) ?? page], text: true, large: isLarge(sec) });
  contrastCheck(ctx, theme, { id: "input-text", kind: "input", property: "Eingabetext im Formularfeld", fgPath: "color", fg: c.input.style.color, bgs: [bgOf("input")], text: true });
  contrastCheck(ctx, theme, { id: "label", kind: "label", property: "Labelfarbe", fgPath: "color", fg: c.label.style.color, bgs: [page, colorIn(c.card.style.background, theme)], text: true, large: isLarge(c.label.style) });
  contrastCheck(ctx, theme, { id: "footer", kind: "footer", property: "Footertext", fgPath: "color", fg: c.footer.style.color, bgs: [bgOf("footer")], text: true });
  contrastCheck(ctx, theme, { id: "nav", kind: "nav", property: "Navigationstext", fgPath: "color", fg: c.nav.style.color, bgs: [bgOf("nav")], text: true });

  // Non-text: a form field's boundary must be perceivable (1.4.11).
  const inp = c.input.style;
  if (Math.max(inp.borderWidth.top, inp.borderWidth.bottom) > 0 && inp.borderStyle !== "none") {
    contrastCheck(ctx, theme, { id: "input-border", kind: "input", property: "Rahmen des Formularfelds", fgPath: "borderColor.top", fg: inp.borderColor.bottom, bgs: [page, bgOf("input")], text: false });
  } else {
    const fieldVsPage = contrast(bgOf("input"), page) ?? 1;
    ctx.out.push({
      id: `input-boundary:${theme.def.id}`,
      status: fieldVsPage >= 3 ? "pass" : "fail",
      criterion: "1.4.11 Nicht-Text-Kontrast",
      level: "AA",
      subject: SUBJECT.input,
      themeId: theme.def.id,
      property: "Begrenzung des Formularfelds",
      actual: `${round2(fieldVsPage)}:1`,
      required: "3:1",
      message: fieldVsPage >= 3 ? "Das Feld hebt sich durch seine Fläche ausreichend ab." : "Das Feld hat keinen Rahmen und hebt sich kaum vom Hintergrund ab.",
      suggestion:
        fieldVsPage >= 3
          ? undefined
          : { text: "Einen 1px-Rahmen in der Rolle „borderStrong“ hinzufügen.", target: { scope: "component", kind: "input", path: "borderWidth.bottom", value: 1 }, overridesUserChoice: c.input.source["borderWidth.bottom"] === "manual" },
    });
  }

  // Focus indicator colour against the page (part of 1.4.11 for UI states).
  for (const kind of ["button", "link", "input"] as const) {
    const f = c[kind].style.states.focus;
    if ((f.outlineWidth ?? 0) > 0) {
      contrastCheck(ctx, theme, { id: `focus-color-${kind}`, kind, property: "Farbe des Fokusrahmens", fgPath: "states.focus.outlineColor", fg: f.outlineColor ?? c[kind].style.color, bgs: [page], text: false });
    }
  }

  // Colour alone: success and danger must not be told apart by hue only.
  const sd = contrast(tc.success, tc.danger) ?? 1;
  ctx.out.push({
    id: `status-colours:${theme.def.id}`,
    status: sd >= 1.4 ? "pass" : "warn",
    criterion: "1.4.1 Benutzung von Farbe",
    level: "A",
    subject: "Statusfarben",
    themeId: theme.def.id,
    property: "Erfolg- und Fehlerfarbe",
    actual: `${round2(sd)}:1`,
    message:
      sd >= 1.4
        ? "Erfolg und Fehler unterscheiden sich auch in der Helligkeit."
        : "Erfolg (Grün) und Fehler (Rot) unterscheiden sich fast nur im Farbton — für Menschen mit Rot-Grün-Schwäche schwer lesbar. Status immer zusätzlich mit Text oder Symbol kennzeichnen.",
  });
}

function globalChecks(ctx: Ctx) {
  const c = ctx.r.components;
  const t = ctx.r.tokens;
  // Visible focus (2.4.7) on every focusable component.
  for (const kind of ["button", "buttonSecondary", "link", "input", "formButton"] as const) {
    const s = c[kind].style;
    const f = s.states.focus;
    const visible = (f.outlineWidth ?? 0) >= 2 || !!(f.shadow && f.shadow !== "none") || !!f.borderColor;
    const thin = (f.outlineWidth ?? 0) > 0 && (f.outlineWidth ?? 0) < 2 && !f.shadow;
    ctx.out.push({
      id: `focus-visible-${kind}`,
      status: visible ? "pass" : "fail",
      criterion: "2.4.7 Fokus sichtbar",
      level: "AA",
      subject: SUBJECT[kind],
      property: "Fokuszustand",
      actual: visible ? `Rahmen ${f.outlineWidth ?? 0}px` : thin ? `nur ${f.outlineWidth}px` : "kein sichtbarer Fokus",
      required: "deutlich sichtbarer Fokus (empfohlen ≥ 2px)",
      message: visible ? `${SUBJECT[kind]} zeigt bei Tastaturbedienung einen sichtbaren Fokus.` : `${SUBJECT[kind]} hat keinen ausreichend sichtbaren Fokuszustand.`,
      suggestion: visible
        ? undefined
        : {
            text: "Einen 2px-Fokusrahmen in der Fokusfarbe ergänzen.",
            target: { scope: "component", kind, path: "states.focus.outlineWidth", value: 2 },
            overridesUserChoice: c[kind].source["states.focus.outlineWidth"] === "manual" || c[kind].source["states.focus.outlineWidth"] === "seed",
          },
    });
  }

  // Target size (2.5.8 AA: 24px, 2.5.5 AAA: 44px).
  for (const kind of ["button", "buttonSecondary", "formButton", "input"] as const) {
    const s = c[kind].style;
    const h = Math.max(s.minHeight, s.padding.top + s.padding.bottom + s.fontSize * s.lineHeight + s.borderWidth.top + s.borderWidth.bottom);
    const status: CheckStatus = h >= 44 ? "pass" : h >= 24 ? "warn" : "fail";
    ctx.out.push({
      id: `target-${kind}`,
      status,
      criterion: h >= 24 ? "2.5.5 Zielgröße (erweitert)" : "2.5.8 Zielgröße (Minimum)",
      level: h >= 24 ? "AAA" : "AA",
      subject: SUBJECT[kind],
      property: "Klickfläche (Höhe)",
      actual: `${Math.round(h)}px`,
      required: h >= 24 ? "44px (AAA)" : "24px (AA)",
      message:
        status === "pass"
          ? `${SUBJECT[kind]} ist mindestens 44px hoch.`
          : status === "warn"
            ? `${SUBJECT[kind]} erfüllt 24px (AA), aber nicht die empfohlenen 44px für Touch-Bedienung.`
            : `${SUBJECT[kind]} ist kleiner als 24px und schwer zu treffen.`,
      suggestion: status === "pass" ? undefined : { text: "Mindesthöhe auf 44px setzen.", target: { scope: "component", kind, path: "minHeight", value: 44 }, overridesUserChoice: c[kind].source.minHeight === "manual" || c[kind].source.minHeight === "seed" },
    });
  }

  // Font sizes and line height (advisory: WCAG has no fixed minimum size).
  const body = t.font.size;
  ctx.out.push({
    id: "font-size-body",
    status: body >= 16 ? "pass" : "warn",
    criterion: "Lesbarkeit (1.4.4 / 1.4.12 Umfeld)",
    level: "Empfehlung",
    subject: SUBJECT.text,
    property: "Grundschriftgröße",
    actual: `${body}px`,
    required: "≥ 16px empfohlen",
    message: body >= 16 ? "Die Grundschrift ist gut lesbar groß." : "Unter 16px wird Fließtext auf Smartphones schnell anstrengend.",
  });
  for (const kind of ["button", "label", "footer", "input", "nav"] as const) {
    const fs = c[kind].style.fontSize;
    if (fs < 12) {
      ctx.out.push({
        id: `font-size-${kind}`,
        status: "warn",
        criterion: "Lesbarkeit",
        level: "Empfehlung",
        subject: SUBJECT[kind],
        property: "Schriftgröße",
        actual: `${fs}px`,
        required: "≥ 12px",
        message: `${SUBJECT[kind]} verwendet eine sehr kleine Schrift.`,
        suggestion: { text: "Schriftgröße auf 14px anheben.", target: { scope: "component", kind, path: "fontSize", value: 14 }, overridesUserChoice: c[kind].source.fontSize === "manual" || c[kind].source.fontSize === "seed" },
      });
    }
  }
  ctx.out.push({
    id: "line-height",
    status: t.font.lineHeight >= 1.5 ? "pass" : "warn",
    criterion: "1.4.12 Textabstand",
    level: "AA",
    subject: SUBJECT.text,
    property: "Zeilenhöhe",
    actual: String(t.font.lineHeight),
    required: "≥ 1.5 empfohlen",
    message: t.font.lineHeight >= 1.5 ? "Die Zeilenhöhe unterstützt gute Lesbarkeit." : "Eine Zeilenhöhe unter 1,5 erschwert das Lesen längerer Texte. (1.4.12 verlangt, dass Nutzer sie erhöhen können — das tut das erzeugte CSS nicht verhindern.)",
  });

  // Motion.
  for (const kind of Object.keys(c) as ComponentKind[]) {
    const s = c[kind].style;
    if (s.animation === "pulse") {
      ctx.out.push({
        id: `animation-${kind}`,
        status: "fail",
        criterion: "2.2.2 Pausieren, Stoppen, Ausblenden",
        level: "A",
        subject: SUBJECT[kind],
        property: "Endlos-Animation",
        actual: "läuft unbegrenzt",
        required: "≤ 5 s oder abschaltbar",
        message: `${SUBJECT[kind]} pulsiert endlos. Das lenkt ab und lässt sich nicht anhalten (bei reduzierter Bewegung wird sie abgeschaltet, sonst nicht).`,
        suggestion: { text: "Animation entfernen.", target: { scope: "component", kind, path: "animation", value: "none" }, overridesUserChoice: true },
      });
    }
    if (s.transitionDuration > 500) {
      ctx.out.push({
        id: `transition-${kind}`,
        status: "warn",
        criterion: "Bewegung",
        level: "Empfehlung",
        subject: SUBJECT[kind],
        property: "Übergangsdauer",
        actual: `${s.transitionDuration}ms`,
        required: "≤ 500ms",
        message: "Lange Übergänge lassen die Oberfläche träge wirken.",
        suggestion: { text: "Übergangsdauer auf 200ms setzen.", target: { scope: "component", kind, path: "transitionDuration", value: 200 }, overridesUserChoice: c[kind].source.transitionDuration === "manual" || c[kind].source.transitionDuration === "seed" },
      });
    }
    const hs = s.states.hover.scale ?? 1;
    if (hs > 1.1) {
      ctx.out.push({
        id: `hover-scale-${kind}`,
        status: "warn",
        criterion: "Bewegung",
        level: "Empfehlung",
        subject: SUBJECT[kind],
        property: "Vergrößerung bei Hover",
        actual: `${hs}×`,
        required: "≤ 1,1×",
        message: "Starke Vergrößerung verschiebt benachbarte Inhalte optisch und kann irritieren.",
        suggestion: { text: "Vergrößerung auf 1,03× reduzieren.", target: { scope: "component", kind, path: "states.hover.scale", value: 1.03 }, overridesUserChoice: true },
      });
    }
  }
  ctx.out.push({
    id: "reduced-motion",
    status: "pass",
    criterion: "2.3.3 Animation durch Interaktionen",
    level: "AAA",
    subject: "Gesamtsystem",
    property: "prefers-reduced-motion",
    message: "Das erzeugte CSS schaltet Übergänge und Animationen bei „Bewegung reduzieren“ ab.",
  });
  ctx.out.push({
    id: "disabled",
    status: "pass",
    criterion: "1.4.3 Ausnahme: inaktive Elemente",
    level: "AA",
    subject: "Deaktivierte Zustände",
    property: "Kontrast deaktivierter Elemente",
    message: "Deaktivierte Bedienelemente sind von der Kontrastanforderung ausgenommen; sie werden zusätzlich über den Cursor gekennzeichnet.",
  });
}

const MANUAL: Array<[string, string, Level, string]> = [
  ["1.1.1 Nicht-Text-Inhalt", "Alternativtexte", "A", "Bilder und Icons brauchen Alternativtexte — das legt die spätere Seite fest, nicht das Designsystem."],
  ["1.3.1 Info und Beziehungen", "Semantisches HTML", "A", "Überschriften, Listen, Labels (for/id) und Landmarken müssen im HTML korrekt ausgezeichnet sein."],
  ["2.1.1 Tastatur", "Tastaturbedienung", "A", "Alle Funktionen müssen per Tastatur erreichbar sein. Das hängt von HTML und Skripten der Seite ab."],
  ["2.4.3 Fokusreihenfolge", "Reihenfolge", "A", "Die Tab-Reihenfolge ergibt sich aus der Struktur der fertigen Seite."],
  ["3.1.1 Sprache der Seite", "lang-Attribut", "A", "Die Seite muss ihre Sprache im <html lang> angeben."],
  ["3.3.1 Fehlererkennung", "Fehlermeldungen", "A", "Formularfehler müssen als Text beschrieben werden, nicht nur farbig."],
  ["1.4.10 Umbruch", "Reflow bei 320px", "AA", "Das erzeugte CSS bricht flüssig um; ob der echte Inhalt bei 320px ohne horizontales Scrollen auskommt, muss an der Seite geprüft werden."],
  ["1.4.12 Textabstand", "Nutzerdefinierte Abstände", "AA", "Prüfen, ob Inhalte bei vergrößerten Zeilen- und Buchstabenabständen nicht abgeschnitten werden."],
];

export function auditProject(r: ResolvedProject): Report {
  const ctx: Ctx = { r, out: [] };
  for (const theme of r.themes) themeChecks(ctx, theme);
  globalChecks(ctx);
  MANUAL.forEach(([criterion, property, level, message], i) =>
    ctx.out.push({ id: `manual-${i}`, status: "manual", criterion, level, subject: "Fertige Website", property, message }),
  );
  const counts: Record<CheckStatus, number> = { pass: 0, fail: 0, warn: 0, manual: 0 };
  for (const f of ctx.out) counts[f.status]++;
  return { findings: ctx.out, counts };
}

/** Applies an accepted suggestion. The caller confirms `overridesUserChoice` first. */
export function applySuggestion(project: DesignProject, s: Suggestion): DesignProject {
  const t = s.target;
  if (t.scope === "theme") {
    return {
      ...project,
      themes: project.themes.map((th) => (th.id === t.themeId ? { ...th, overrides: { ...th.overrides, [t.role]: t.value } } : th)),
    };
  }
  const extra: Record<string, string | number> = {};
  // A border added for 1.4.11 also needs a style and a colour to show up.
  if (t.path === "borderWidth.bottom" && t.kind === "input") {
    for (const side of ["top", "right", "bottom", "left"]) extra[`borderWidth.${side}`] = 1;
    extra.borderStyle = "solid";
  }
  if (t.path === "states.focus.outlineWidth") {
    extra["states.focus.outlineColor"] = `var(--${project.prefix}-color-focus)`;
    extra["states.focus.outlineOffset"] = 2;
  }
  return {
    ...project,
    components: {
      ...project.components,
      [t.kind]: { ...(project.components[t.kind] ?? {}), ...extra, [t.path]: t.value },
    },
  };
}
