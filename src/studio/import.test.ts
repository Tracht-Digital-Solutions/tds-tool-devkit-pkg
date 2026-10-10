/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { analyzePage, importCss, importHtmlComponent, importTokensJson, resolveVars } from "./importer";
import { sanitizeHtml } from "./sanitize";
import { resolveProject } from "./resolve";
import { emitCss } from "./css";
import { previewBody, previewDocument } from "./previews";
import { newProject } from "./model";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

describe("CSS import", () => {
  const css = `
    @import url("https://fonts.example/x.css");
    :root { --brand-primary: #0f766e; --radius-md: 10px; --font-heading: "Playfair Display", serif; --text-color: #1c1917; }
    body { background: #fafaf9; color: var(--text-color); font-family: Inter, sans-serif; }
    a { color: #0f766e; }
    .btn { background: var(--brand-primary); color: #fff; padding: 10px 20px; border-radius: 6px; border: 2px solid #115e59; }
    .btn:hover { background: #115e59; transform: translateY(-2px); }
    .btn:focus-visible { outline: 3px solid #f59e0b; outline-offset: 2px; }
    .hero__wave { clip-path: polygon(0 0, 100% 0, 100% 80%); }
    @media (max-width: 40em) { .hero { padding: 1rem } }
  `;

  it("recognises variables, element rules and the button with its states", () => {
    const { project, issues } = importCss(css, parse);
    expect(issues).toEqual([]);
    const v = Object.fromEntries(project.imported!.values.map((x) => [x.path, x]));
    expect(v["color.primary"]!.value).toBe("#0f766e");
    expect(v["color.primary"]!.confidence).toBe("high");
    expect(v["radius.md"]!.value).toBe(10);
    expect(v["font.heading"]!.value).toContain("Playfair");
    expect(v["role.text"]!.value).toBe("#1c1917");
    expect(v["role.background"]!.value).toBe("#fafaf9");
    expect(project.seed.kind).toBe("button");
    const s = project.seed.style;
    expect(s.background).toBe("#0f766e");
    expect(s.padding).toEqual({ top: 10, right: 20, bottom: 10, left: 20 });
    expect(s.radius.tl).toBe(6);
    expect(s.borderWidth.top).toBe(2);
    expect(s.states.hover.background).toBe("#115e59");
    expect(s.states.hover.translateY).toBe(-2);
    expect(s.states.focus.outlineWidth).toBe(3);
  });

  it("keeps unsupported rules verbatim and marks them, but drops @import", () => {
    const { project, notes } = importCss(css, parse);
    expect(project.imported!.preservedCss).toContain(".hero__wave");
    expect(project.imported!.preservedCss).toContain("@media (max-width: 40em)");
    expect(project.imported!.preservedCss).not.toContain("@import");
    expect(project.imported!.unmapped).toContain(".hero__wave");
    expect(notes.join(" ")).toMatch(/@import/);
    // Imported colours reach the light theme as "imported", not as "manual".
    const r = resolveProject(project);
    expect(r.themes[0]!.colors.text).toBe("#1c1917");
    expect(r.themes[0]!.source.text).toBe("imported");
    expect(emitCss(r)).toContain("@layer ds-imported");
  });

  it("handles broken CSS without throwing", () => {
    const res = importCss(".a { color: red; .b { width: ", parse);
    expect(res.issues.length).toBeGreaterThan(0);
    expect(res.project.seed.kind).toBe("button");
  });

  it("resolves nested var() with fallbacks", () => {
    expect(resolveVars("var(--a)", { "--a": "var(--b, 4px)" })).toBe("4px");
    expect(resolveVars("1px solid var(--c, #000)", {})).toBe("1px solid #000");
  });
});

describe("HTML component import", () => {
  it("isolates the markup: no scripts, handlers, javascript: links or forms that submit", () => {
    const dirty = `<div onclick="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a>
      <img src="https://tracker.example/p.gif" onerror="alert(4)"><iframe src="https://evil.example"></iframe>
      <form action="https://evil.example/steal"><input type="submit" value="Go"><button type="submit">b</button></form>
      <svg><script>alert(5)</script></svg><style>.x{color:red}</style></div>`;
    const res = sanitizeHtml(dirty, parse);
    expect(res.html).not.toMatch(/<script|onclick|onerror|javascript:|<iframe|<img|<svg|action=/i);
    expect(res.html).toContain('href="#"');
    expect(res.html).not.toMatch(/type="submit"/);
    expect(res.styles).toEqual([".x{color:red}"]);
  });

  it("reads the component's own cascade, states and inline style", () => {
    const html = `<style>
      .cta { background: linear-gradient(90deg, #7c3aed, #db2777); color: #fff; border-radius: 999px; padding: 12px 28px; font-weight: 700 }
      button.cta:hover { transform: scale(1.05) }
    </style><button class="cta" style="letter-spacing: 0.05em">Los</button>`;
    const { project, referenceHtml } = importHtmlComponent(html, parse);
    const s = project.seed.style;
    expect(project.seed.kind).toBe("button");
    expect(s.background).toBe("#7c3aed");
    expect(s.gradientTo).toBe("#db2777");
    expect(s.gradientAngle).toBe(90);
    expect(s.radius.tl).toBe(999);
    expect(s.fontWeight).toBe(700);
    expect(s.letterSpacing).toBe(0.05);
    expect(s.states.hover.scale).toBe(1.05);
    expect(referenceHtml).toContain('type="button"');
  });
});

describe("JSON token import", () => {
  it("reads DTCG tokens and reports unmapped ones", () => {
    const json = JSON.stringify({
      color: { brand: { primary: { $type: "color", $value: "#be123c" } }, misc: { sparkle: { $value: "#fde68a" } } },
      radius: { md: { $type: "dimension", $value: "12px" } },
    });
    const { project } = importTokensJson(json);
    const v = Object.fromEntries(project.imported!.values.map((x) => [x.path, x.value]));
    expect(v["color.primary"]).toBe("#be123c");
    expect(v["radius.md"]).toBe(12);
    expect(project.imported!.unmapped.join()).toMatch(/sparkle/);
  });

  it("re-opens a studio project file and rejects garbage", () => {
    const p = { ...newProject("card"), name: "Projekt X" };
    expect(importTokensJson(JSON.stringify(p)).project.name).toBe("Projekt X");
    expect(importTokensJson("{nope").issues[0]).toMatch(/Kein gültiges JSON/);
  });
});

describe("page analysis", () => {
  const page = {
    url: "https://example.org/",
    html: `<!doctype html><html><head><meta name="theme-color" content="#1d4ed8"><style>.btn{background:#1d4ed8;color:#fff;border-radius:4px;padding:8px 16px}</style>
      <script>document.write("x")</script></head><body><h1>Titel</h1><a class="btn" href="/kontakt">Kontakt</a><img src="logo.png" alt="Logo"></body></html>`,
    stylesheets: [{ url: "https://example.org/a.css", css: "body{color:#111827;background:#ffffff;font-family:Georgia,serif}" }],
  };

  it("extracts styles, marks what it could not determine and copies no content", () => {
    const res = analyzePage(page, parse);
    const ref = Object.fromEntries(res.reference.map((e) => [e.label, e]));
    expect(ref["Primärfarbe"]!.value).toBe("#1d4ed8");
    expect(ref["Textfarbe"]!.value).toBe("#111827");
    expect(ref["Schrift (Text)"]!.value).toContain("Georgia");
    expect(ref["Sekundärfarbe"]!.confidence).toBe("none");
    expect(ref["Sekundärfarbe"]!.value).toBe("nicht ermittelt");
    expect(ref["Button-Gestaltung"]!.confidence).toBe("high");
    expect(res.project.seed.style.radius.tl).toBe(4);
    const serialised = JSON.stringify(res.project);
    expect(serialised).not.toContain("Kontakt");
    expect(serialised).not.toContain("logo.png");
    expect(res.project.imported!.preservedCss).toBe("");
  });
});

describe("preview", () => {
  it("is purely visual: no scripts, no handlers, no navigation, no submitting", () => {
    const p = newProject();
    for (const view of ["components", "panel", "landing"] as const) {
      const body = previewBody(p.prefix, view, "de");
      expect(body).not.toMatch(/<script|\son[a-z]+=|javascript:/i);
      for (const m of body.matchAll(/href="([^"]*)"/g)) expect(m[1]).toBe("#");
      for (const m of body.matchAll(/<button\b[^>]*>/g)) expect(m[0]).toContain('type="button"');
      expect(body).not.toMatch(/action=|method=/);
    }
    const doc = previewDocument({ css: "", prefix: "ds", body: "", theme: "dark", lang: "de" });
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain('data-theme="dark"');
  });

  it("all three views use the same generated stylesheet", () => {
    const r = resolveProject(newProject());
    const css = emitCss(r, { simulateStates: true });
    for (const view of ["components", "panel", "landing"] as const) {
      const body = previewBody("ds", view, "en");
      const classes = [...body.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(/\s+/)).filter((c) => c.startsWith("ds-"));
      expect(classes.length).toBeGreaterThan(10);
      for (const cls of classes) {
        expect(css, `${view}: .${cls}`).toContain(`.${cls}`);
      }
    }
  });
});
