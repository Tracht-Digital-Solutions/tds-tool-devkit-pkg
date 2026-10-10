import { describe, expect, it } from "vitest";
import { contrast, ensureContrast, formatColor, parseColor, rgbToOklch, oklchToRgb, toHex } from "./color";
import { emitCss, sanitizeCss, singleComponentCss } from "./css";
import { parseCss, flattenRules, specificity } from "./cssParser";
import { newProject, parseProject, setPath, type DesignProject } from "./model";
import { resolveProject } from "./resolve";

/** WCAG 2.1 reference value computed by hand: #767676 on white is 4.54:1. */
describe("colour", () => {
  it("parses every supported notation to the same colour", () => {
    const want = "#3366cc";
    for (const v of ["#36c", "#3366CC", "rgb(51, 102, 204)", "rgb(51 102 204)", "rgba(51,102,204,1)", "hsl(220 60% 50%)", "hsl(220, 60%, 50%)"]) {
      expect(toHex(parseColor(v)!), v).toBe(want);
    }
    expect(parseColor("rebeccapurple")).toEqual({ r: 102, g: 51, b: 153, a: 1 });
    expect(parseColor("#3366cc80")!.a).toBeCloseTo(0.502, 2);
    expect(parseColor("not-a-colour")).toBeNull();
    expect(parseColor("var(--x)")).toBeNull();
  });

  it("round-trips through OKLCH", () => {
    for (const hex of ["#000000", "#ffffff", "#2563eb", "#e11d48", "#16a34a"]) {
      expect(toHex(oklchToRgb(rgbToOklch(parseColor(hex)!)))).toBe(hex);
    }
    expect(formatColor(parseColor("#ffffff")!, "oklch")).toMatch(/^oklch\(100\.0% 0\.000/);
  });

  it("computes WCAG contrast ratios", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrast("linear-gradient(red, blue)", "#fff")).toBeNull();
  });

  it("lifts a colour to a target contrast and leaves a passing one alone", () => {
    const fixed = ensureContrast("#9aa5ff", "#ffffff", 4.5);
    expect(contrast(fixed, "#ffffff")!).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast("#000000", "#ffffff", 4.5)).toBe("#000000");
  });
});

describe("generator", () => {
  it("derives a complete system from one button, deterministically", () => {
    const p = newProject("button");
    const a = resolveProject(p);
    const b = resolveProject(JSON.parse(JSON.stringify(p)) as DesignProject);
    expect(JSON.stringify(a.tokens)).toBe(JSON.stringify(b.tokens));
    expect(emitCss(a)).toBe(emitCss(b));
    for (const k of ["button", "buttonSecondary", "link", "heading", "text", "card", "input", "label", "formButton", "nav", "footer"] as const) {
      expect(a.components[k].style).toBeTruthy();
    }
    expect(a.themes.map((t) => t.def.id)).toEqual(["light", "dark"]);
  });

  it("propagates a global primary colour to every theme and component", () => {
    const p = { ...newProject("button"), variant: "modern" as const, globals: { "color.primary": "#e11d48" } };
    const r = resolveProject(p);
    expect(r.tokens.color.primary).toBe("#e11d48");
    expect(r.tokenSource["color.primary"]).toBe("manual");
    expect(r.themes[0]!.colors.primary).toBe("#e11d48");
    expect(r.components.button.style.background).toBe("var(--ds-color-primary)");
    // Dark keeps the hue but is lifted to 3:1 against its ground.
    expect(contrast(r.themes[1]!.colors.primary, r.themes[1]!.colors.background)!).toBeGreaterThanOrEqual(3);
  });

  it("keeps a component override when the global token changes", () => {
    let p = newProject("button");
    p = { ...p, variant: "modern", components: { button: { "borderWidth.top": 3 } } };
    const before = resolveProject(p).components.button;
    p = { ...p, globals: { "radius.button": 20 } };
    const after = resolveProject(p).components.button;
    expect(before.style.borderWidth.top).toBe(3);
    expect(after.style.borderWidth.top).toBe(3);
    expect(after.style.radius.tl).toBe(20);
    expect(after.source["borderWidth.top"]).toBe("manual");
  });

  it("produces variants that differ in structure, not only colour", () => {
    const base = newProject("button");
    const fingerprints = new Set<string>();
    for (const variant of ["minimal", "modern", "elegant", "playful", "technical"] as const) {
      const t = resolveProject({ ...base, variant }).tokens;
      expect(t.color.primary).toBe(resolveProject(base).tokens.color.primary);
      fingerprints.add(JSON.stringify([t.radius, t.shadow.md, t.font.heading, t.style.hover, t.border.width]));
    }
    expect(fingerprints.size).toBe(5);
  });

  it("keeps the designed button exactly under the original variant", () => {
    let p = newProject("button");
    p = { ...p, variant: "original", seed: setPath(p.seed, "style.radius", { tl: 3, tr: 14, br: 3, bl: 14 }) };
    const css = singleComponentCss(resolveProject(p), "button");
    expect(css).toContain("border-radius: 3px 14px 3px 14px;");
  });
});

describe("css", () => {
  it("emits individual border sides and separate corner radii", () => {
    let p = newProject("button");
    p = {
      ...p,
      variant: "original",
      seed: setPath(setPath(p.seed, "style.borderWidth", { top: 1, right: 2, bottom: 3, left: 4 }), "style.borderStyle", "dashed"),
    };
    const css = singleComponentCss(resolveProject(p), "button");
    expect(css).toContain("border-top: 1px dashed");
    expect(css).toContain("border-left: 4px dashed");
  });

  it("emits hover, focus-visible, active and disabled states", () => {
    const css = singleComponentCss(resolveProject({ ...newProject("button"), variant: "modern" }), "button");
    expect(css).toMatch(/\.ds-btn:hover \{/);
    expect(css).toMatch(/\.ds-btn:focus-visible \{[^}]*outline: 2px solid/);
    expect(css).toMatch(/\.ds-btn:active \{/);
    expect(css).toMatch(/\.ds-btn:disabled/);
  });

  it("generates prefers-color-scheme and data-theme selectors", () => {
    const css = emitCss(resolveProject(newProject()));
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain(':root:not([data-theme])');
    expect(css).toContain('[data-theme="light"]');
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps custom CSS last and unlayered", () => {
    const p = { ...newProject(), customCss: ".ds-btn { letter-spacing: 0.3em; }" };
    const css = emitCss(resolveProject(p));
    expect(css.trimEnd().endsWith(".ds-btn { letter-spacing: 0.3em; }")).toBe(true);
    expect(css.lastIndexOf("@layer")).toBeLessThan(css.indexOf("letter-spacing: 0.3em"));
  });

  it("neutralises style-breakout and legacy script vectors", () => {
    expect(sanitizeCss("a{b:c}</style><script>x</script>")).not.toContain("<");
    expect(sanitizeCss("a{width:expression(alert(1))}")).not.toMatch(/expression\(/i);
    expect(sanitizeCss("a{background:url(javascript:alert(1))}")).not.toMatch(/javascript:/i);
    const p = { ...newProject(), name: "x */ } body { color: red" };
    const css = emitCss(resolveProject(p));
    expect(css.startsWith("/*")).toBe(true);
    expect(css.indexOf("*/")).toBeGreaterThan(css.indexOf("Designsystem"));
  });

  it("produces CSS that parses without errors", () => {
    for (const variant of ["original", "minimal", "modern", "elegant", "playful", "technical"] as const) {
      for (const kind of ["button", "card", "input", "link"] as const) {
        const css = emitCss(resolveProject({ ...newProject(kind), variant }), { simulateStates: true });
        const { issues } = parseCss(css);
        expect(issues.filter((i) => i.severity === "error"), `${variant}/${kind}`).toEqual([]);
        expect(issues, `${variant}/${kind}`).toEqual([]);
      }
    }
  });
});

describe("css parser", () => {
  it("parses nested rules, at-rules and strings with braces", () => {
    const { nodes, issues } = parseCss(`
      @import url("x.css");
      .a { color: red; content: "}{"; &:hover { color: blue } }
      @media (max-width: 40em) { .b { margin: 0 !important } }
      @font-face { font-family: X; src: url(x.woff2) }
    `);
    expect(issues).toEqual([]);
    const flat = flattenRules(nodes);
    expect(flat.map((r) => r.selector)).toEqual([".a", ".a:hover", ".b"]);
    expect(flat[0]!.decls[1]!.value).toBe('"}{"');
    expect(flat[2]!.context).toEqual(["media (max-width: 40em)"]);
    expect(flat[2]!.decls[0]!.important).toBe(true);
  });

  it("reports broken CSS without throwing", () => {
    const { issues } = parseCss(".a { color: red;\n.b { colr: blue; width: }\n/* open");
    const messages = issues.map((i) => i.message).join("\n");
    expect(messages).toMatch(/Kommentar/);
    expect(messages).toMatch(/keinen Wert/);
    expect(messages).toMatch(/Unbekannte Eigenschaft „colr“/);
    expect(messages).toMatch(/nicht geschlossen/);
    expect(issues.find((i) => i.message.includes("colr"))!.line).toBe(2);
  });

  it("computes selector specificity", () => {
    expect(specificity("#a .b c")).toEqual([1, 1, 1]);
    expect(specificity(".btn:hover")).toEqual([0, 2, 0]);
    expect(specificity(":where(.x) a")).toEqual([0, 0, 1]);
    expect(specificity("a::before")).toEqual([0, 0, 2]);
    expect(specificity(":is(#x, .y) p")).toEqual([1, 0, 1]);
  });
});

describe("project model", () => {
  it("rejects non-projects and fills missing fields of old ones", () => {
    expect(parseProject(null)).toBeNull();
    expect(parseProject({ schema: 99 })).toBeNull();
    const p = parseProject({ schema: 1, seed: { kind: "card" }, globals: { "radius.md": 6, "__proto__.x": 1 } })!;
    expect(p.seed.kind).toBe("card");
    expect(p.seed.style.padding.top).toBe(24);
    expect(p.globals).toEqual({ "radius.md": 6 });
    expect(p.themes.length).toBe(2);
  });
});
