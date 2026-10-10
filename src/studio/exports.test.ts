import { describe, expect, it, vi } from "vitest";
import { auditProject } from "./a11y";
import { contrast } from "./color";
import { checkCustomCss } from "./customCss";
import { parseCss } from "./cssParser";
import { ADAPTERS, buildExport, fileStem } from "./export/adapters";
import { createZip, readZip, safeZipPath } from "./export/zip";
import { handleExport } from "./exportRoute";
import { newProject, setPath, type DesignProject } from "./model";
import { EXPORT_FORMATS, defaultPolicy, type ExportFormat } from "./policy";
import { resolveProject } from "./resolve";
import { manualCount, reduce } from "./state";

const text = (b: string | Uint8Array) => (typeof b === "string" ? b : new TextDecoder().decode(b));

describe("accessibility assistant", () => {
  it("flags a low-contrast button, proposes a fix and the fix passes", () => {
    let p = newProject("button");
    p = { ...p, variant: "original", seed: setPath(setPath(p.seed, "style.background", "#7dd3fc"), "style.color", "#ffffff") };
    const r = resolveProject(p);
    const fail = auditProject(r).findings.find((f) => f.id === "button-text:light")!;
    expect(fail.status).toBe("fail");
    expect(fail.criterion).toMatch(/1\.4\.3/);
    expect(fail.suggestion).toBeTruthy();
    // The white text was the user's choice (seed) — applying must be confirmed.
    expect(fail.suggestion!.overridesUserChoice).toBe(true);
    const fixed = reduce(p, { type: "suggestion", suggestion: fail.suggestion! });
    const again = auditProject(resolveProject(fixed)).findings.find((f) => f.id === "button-text:light")!;
    expect(again.status).toBe("pass");
  });

  it("reports a missing focus state and an endless animation", () => {
    let p = { ...newProject("button"), variant: "original" as const };
    p = { ...p, seed: setPath(setPath(p.seed, "style.states.focus", {}), "style.animation", "pulse") };
    const findings = auditProject(resolveProject(p)).findings;
    expect(findings.find((f) => f.id === "focus-visible-button")!.status).toBe("fail");
    expect(findings.find((f) => f.id === "animation-button")!.criterion).toMatch(/2\.2\.2/);
  });

  it("separates passes, problems and manual items and never claims conformance", () => {
    const report = auditProject(resolveProject(newProject()));
    expect(report.counts.pass).toBeGreaterThan(10);
    expect(report.counts.manual).toBeGreaterThanOrEqual(8);
    expect(JSON.stringify(report)).not.toMatch(/WCAG-konform|vollständig barrierefrei/i);
    // Derived themes hold AA for body text in both light and dark.
    for (const t of ["light", "dark"]) expect(report.findings.find((f) => f.id === `text:${t}`)!.status).toBe("pass");
  });

  it("a fresh design has no failures in any variant, starting kind or theme", () => {
    // The generator must not produce what its own checker rejects.
    for (const kind of ["button", "card", "input", "link"] as const) {
      for (const variant of ["original", "minimal", "modern", "elegant", "playful", "technical"] as const) {
        let p: DesignProject = { ...newProject(kind), variant };
        p = reduce(p, { type: "themeAdd", name: "Kontrast", base: "dark", contrast: "more" });
        const fails = auditProject(resolveProject(p)).findings.filter((f) => f.status === "fail");
        expect(fails.map((f) => `${f.id} ${f.actual}`), `${kind}/${variant}`).toEqual([]);
      }
    }
  });

  it("derived dark theme keeps every text role readable", () => {
    const r = resolveProject({ ...newProject(), globals: { "color.primary": "#facc15" } });
    const dark = r.themes.find((t) => t.def.id === "dark")!.colors;
    expect(contrast(dark.text, dark.background)!).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark.muted, dark.surfaceAlt)!).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark.onPrimary, dark.primary)!).toBeGreaterThanOrEqual(4.5);
  });
});

describe("state", () => {
  it("keeps manual work when the variant or the seed changes", () => {
    let p = newProject("button");
    p = reduce(p, { type: "global", path: "radius.md", value: 3 });
    p = reduce(p, { type: "component", kind: "card", path: "padding.top", value: 40 });
    p = reduce(p, { type: "customCss", css: ".ds-card { outline: 1px solid red; }" });
    p = reduce(p, { type: "themeRole", id: "dark", role: "background", value: "#000000" });
    p = reduce(p, { type: "variant", variant: "playful" });
    p = reduce(p, { type: "seed", path: "background", value: "#16a34a" });
    const r = resolveProject(p);
    expect(r.tokens.radius.md).toBe(3);
    expect(r.components.card.style.padding.top).toBe(40);
    expect(r.themes.find((t) => t.def.id === "dark")!.colors.background).toBe("#000000");
    expect(p.customCss).toContain("outline");
    expect(manualCount(p)).toBe(3);
  });

  it("locks freeze the current value; unlocking releases it", () => {
    let p: DesignProject = { ...newProject("button"), variant: "modern" };
    const before = resolveProject(p).tokens.radius.button;
    p = reduce(p, { type: "lock", path: "radius.button", value: before });
    p = reduce(p, { type: "variant", variant: "technical" });
    expect(resolveProject(p).tokens.radius.button).toBe(before);
    expect(resolveProject(p).tokenSource["radius.button"]).toBe("locked");
    p = reduce(p, { type: "unlock", path: "radius.button" });
    expect(resolveProject(p).tokens.radius.button).toBe(0);
  });

  it("adds named themes with unique ids and keeps at least one", () => {
    let p = newProject();
    p = reduce(p, { type: "themeAdd", name: "Hoher Kontrast", base: "light", contrast: "more" });
    p = reduce(p, { type: "themeAdd", name: "Hoher Kontrast", base: "dark", contrast: "more" });
    expect(p.themes.map((t) => t.id)).toEqual(["light", "dark", "hoher-kontrast", "hoher-kontrast-2"]);
    const css = buildExport(p, "css").body as string;
    expect(css).toContain('[data-theme="hoher-kontrast"]');
    expect(css).toContain("@media (prefers-contrast: more)");
    for (const t of p.themes.slice()) p = reduce(p, { type: "themeRemove", id: t.id });
    expect(p.themes.length).toBe(1);
  });

  it("reset of manual edits keeps locks and custom CSS", () => {
    let p = reduce(newProject(), { type: "lock", path: "radius.md", value: 5 });
    p = reduce(p, { type: "global", path: "font.size", value: 18 });
    p = reduce(p, { type: "customCss", css: "a{}" });
    p = reduce(p, { type: "resetManual" });
    expect(p.globals).toEqual({ "radius.md": 5 });
    expect(p.customCss).toBe("a{}");
  });
});

describe("custom CSS conflicts", () => {
  it("names generated properties the custom CSS overrides", () => {
    const p = { ...newProject(), customCss: ".ds-btn { background: hotpink; cursor: wait; }\n.ds-btn:hover { color: red !important }" };
    const { conflicts, issues } = checkCustomCss(resolveProject(p));
    expect(conflicts.map((c) => `${c.selector}|${c.property}|${c.kind}`)).toEqual([".ds-btn|background|button", ".ds-btn|cursor|button"]);
    expect(issues.some((i) => /!important/.test(i.message))).toBe(true);
  });
});

describe("exports", () => {
  const project: DesignProject = { ...newProject("card"), name: "Bäckerei Müller / Test", customCss: ".ds-card { gap: 1rem; }" };

  it("every format builds, is non-empty and contains no script", () => {
    for (const f of EXPORT_FORMATS) {
      const out = buildExport(project, f);
      expect(out.filename).toMatch(/^baeckerei-mueller-test[a-z0-9.-]*$/);
      const body = f === "zip" ? readZip(out.body as Uint8Array).map((e) => text(e.data)).join("\n") : text(out.body);
      expect(body.length, f).toBeGreaterThan(200);
      expect(body, f).not.toMatch(/<script|\son[a-z]+\s*=|javascript:/i);
    }
  });

  it("CSS-like exports parse without errors and keep the custom CSS", () => {
    for (const f of ["css", "variables"] as const) {
      const css = text(buildExport(project, f).body);
      expect(parseCss(css).issues.filter((i) => i.severity === "error"), f).toEqual([]);
    }
    expect(text(buildExport(project, "css").body)).toContain(".ds-card { gap: 1rem; }");
  });

  it("JSON tokens are valid DTCG and carry the project for re-import", () => {
    const doc = JSON.parse(text(buildExport(project, "json").body));
    expect(doc.color.brand.primary.$type).toBe("color");
    expect(doc.theme.dark.background.$value).toMatch(/^#[0-9a-f]{6}$/);
    expect(doc.radius.md.$value.unit).toBe("px");
    expect(doc.$extensions["de.tracht-digital.designsystem-studio"].project.name).toBe(project.name);
  });

  it("SCSS, Tailwind and Bootstrap carry the same tokens", () => {
    const r = resolveProject(project);
    const scss = text(buildExport(project, "scss").body);
    expect(scss).toContain('@use "sass:map";');
    expect(scss).toContain(`$ds-radius-md: ${r.tokens.radius.md}px`);
    expect(scss.split("{").length).toBe(scss.split("}").length);
    const tw = text(buildExport(project, "tailwind").body);
    expect(tw).toContain("@theme inline");
    expect(tw).toContain("--color-primary: var(--ds-color-primary);");
    expect(tw).toContain("@layer components");
    const bs = text(buildExport(project, "bootstrap").body);
    expect(bs).toContain(`$primary: ${r.themes[0]!.colors.primary};`);
    expect(bs).toContain("$body-bg-dark:");
  });

  it("the ZIP holds the expected files and only allowed formats", () => {
    const all = readZip(buildExport(project, "zip").body as Uint8Array).map((e) => e.path);
    for (const path of ["README.md", "css/designsystem.css", "css/tokens.css", "scss/_designsystem.scss", "tokens/design-tokens.json", "tailwind/tailwind.theme.css", "bootstrap/_bootstrap-overrides.scss", "examples/components.html"]) {
      expect(all).toContain(`baeckerei-mueller-test/${path}`);
    }
    const limited = readZip(buildExport(project, "zip", ["css", "json", "zip"]).body as Uint8Array);
    expect(limited.map((e) => e.path).some((x) => x.includes("scss/"))).toBe(false);
    expect(text(limited.find((e) => e.path.endsWith("README.md"))!.data)).toMatch(/Nicht enthalten.*scss/);
  });

  it("is deterministic and has one adapter per non-zip format", () => {
    expect(text(buildExport(project, "css").body)).toBe(text(buildExport(project, "css").body));
    expect(Object.keys(ADAPTERS).sort()).toEqual(EXPORT_FORMATS.filter((f) => f !== "zip").sort());
    expect(Buffer.from(buildExport(project, "zip").body as Uint8Array).equals(Buffer.from(buildExport(project, "zip").body as Uint8Array))).toBe(true);
  });

  it("file names and zip paths cannot escape", () => {
    expect(fileStem("../../etc/passwd")).toBe("etc-passwd");
    expect(fileStem("   ")).toBe("designsystem");
    expect(safeZipPath("../x")).toBeNull();
    expect(safeZipPath("/abs")).toBeNull();
    expect(() => createZip([{ path: "a/../../b", data: new Uint8Array() }])).toThrow();
  });
});

describe("export route (server-side policy)", () => {
  const body = (format: ExportFormat) =>
    new Request("https://tools.example/tds/studio/export", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "tds_session=abc" },
      body: JSON.stringify({ format, project: newProject() }),
    });
  const api = (answer: unknown, status = 200) =>
    vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(answer), { status, headers: { "content-type": "application/json" } }));
  const deps = (f: ReturnType<typeof api>) => ({ apiBase: () => "https://api.example", fetch: f as unknown as typeof fetch });

  it("serves a free format to a guest and refuses a premium one", async () => {
    const f = api({ enabled: true, authenticated: false, entitled: false, formats: defaultPolicy() });
    const ok = await handleExport(body("css"), deps(f));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toMatch(/attachment; filename="mein-designsystem-designsystem\.css"/);
    const denied = await handleExport(body("scss"), deps(f));
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe("premium_required");
    // The visitor's own cookie is what the API judges.
    expect((f.mock.calls[0]![1]!.headers as Record<string, string>).Cookie).toBe("tds_session=abc");
  });

  it("serves premium formats to an entitled user", async () => {
    const res = await handleExport(body("zip"), deps(api({ enabled: true, authenticated: true, entitled: true, formats: defaultPolicy() })));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
  });

  it("follows the admin policy without a code change", async () => {
    const res = await handleExport(body("scss"), deps(api({ enabled: true, entitled: false, formats: { ...defaultPolicy(), scss: "free", css: "premium" } })));
    expect(res.status).toBe(200);
    const css = await handleExport(body("css"), deps(api({ enabled: true, entitled: false, formats: { ...defaultPolicy(), css: "premium" } })));
    expect(css.status).toBe(403);
  });

  it("fails closed when the API is down, and honours the off switch", async () => {
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect((await handleExport(body("zip"), { apiBase: () => "https://api.example", fetch: down as unknown as typeof fetch })).status).toBe(403);
    expect((await handleExport(body("css"), { apiBase: () => "https://api.example", fetch: down as unknown as typeof fetch })).status).toBe(200);
    expect((await handleExport(body("css"), deps(api({ enabled: false })))).status).toBe(403);
  });

  it("rejects malformed requests", async () => {
    const bad = (init: RequestInit) => handleExport(new Request("https://t.example/x", { method: "POST", ...init }), deps(api({})));
    expect((await bad({ headers: { "content-type": "application/json" }, body: "{" })).status).toBe(400);
    expect((await bad({ headers: { "content-type": "application/json" }, body: JSON.stringify({ format: "exe", project: newProject() }) })).status).toBe(422);
    expect((await bad({ headers: { "content-type": "application/json" }, body: JSON.stringify({ format: "css", project: { schema: 7 } }) })).status).toBe(422);
    expect((await bad({ headers: { "content-type": "text/plain" }, body: "x" })).status).toBe(415);
  });
});
