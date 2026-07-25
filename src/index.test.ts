import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import pack from "./index";

/**
 * Manifest contract tests.
 *
 * The tools site composes every pack at build time and `composeToolPacks`
 * hard-errors on a duplicate tool `id` or `slug` across ALL packs — so a
 * collision introduced here breaks the *site* build, not this repo's. These
 * tests pin the fields that contract depends on, plus the ones the public,
 * indexable tool pages need (slug → URL, SEO title/description).
 */

const repoRoot = new URL("..", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", repoRoot), "utf8")) as {
  name: string;
  version: string;
  files: string[];
};

describe("pack envelope", () => {
  it("declares a stable pack id and a human name", () => {
    expect(pack.id).toBe("dev");
    expect(pack.name).toBe("Entwickler & Design");
  });

  it("ships exactly the two documented tools", () => {
    expect(pack.tools.map((t) => t.id).sort()).toEqual(["contrast-checker", "json-formatter"]);
  });
});

describe("tool ids and slugs", () => {
  it("has no duplicate id within the pack", () => {
    const ids = pack.tools.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no duplicate slug within the pack", () => {
    // Slugs are globally unique across packs; a local dupe is a guaranteed
    // site-build failure, so catch it here where the error is readable.
    const slugs = pack.tools.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses URL-safe slugs (they become /tools/<slug>)", () => {
    for (const t of pack.tools) {
      expect(t.slug, `slug of ${t.id}`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(encodeURIComponent(t.slug)).toBe(t.slug);
    }
  });

  it("keeps the German slug for the contrast checker", () => {
    // The public URL is /tools/kontrast-checker — changing it breaks inbound
    // links and the SEO target, so it is pinned deliberately.
    const contrast = pack.tools.find((t) => t.id === "contrast-checker");
    expect(contrast?.slug).toBe("kontrast-checker");
  });
});

describe("required tool fields", () => {
  it.each([["json-formatter"], ["contrast-checker"]])("%s is fully described", (id) => {
    const tool = pack.tools.find((t) => t.id === id);
    if (!tool) throw new Error(`tool ${id} is missing from the pack`);

    expect(tool.name.length).toBeGreaterThan(3);
    expect(tool.description.length).toBeGreaterThan(20);
    expect(tool.icon).toBeTruthy();
    expect(tool.category).toMatch(/^(developer|design|marketing|media)$/);

    // The contract types keywords/seo as optional; this pack requires both,
    // because its tools are the public, indexable surface.
    const { keywords } = tool;
    if (!keywords) throw new Error(`tool ${id} has no keywords`);
    expect(keywords.length).toBeGreaterThan(2);
  });

  it("carries SEO metadata within search-result budgets", () => {
    // These pages are the indexable half of the platform; an over-long title
    // gets truncated in the SERP.
    for (const t of pack.tools) {
      const { title, description } = t.seo ?? {};
      if (!title || !description) throw new Error(`tool ${t.id} has an incomplete seo block`);

      expect(title.length, `seo.title of ${t.id}`).toBeLessThanOrEqual(70);
      expect(description.length, `seo.description of ${t.id}`).toBeGreaterThan(50);
      expect(description.length, `seo.description of ${t.id}`).toBeLessThanOrEqual(170);
    }
  });
});

describe("component wiring", () => {
  it("points every component at this package's own tools/ directory", () => {
    for (const t of pack.tools) {
      expect(t.component.startsWith(`${pkg.name}/tools/`), `${t.id} component specifier`).toBe(
        true,
      );
      expect(t.component.endsWith(".astro")).toBe(true);
    }
  });

  it("resolves every component to a file that actually exists", () => {
    // A typo here surfaces only as an ENOENT during the tools-site build.
    for (const t of pack.tools) {
      const rel = t.component.slice(`${pkg.name}/`.length);
      const abs = fileURLToPath(new URL(rel, repoRoot));
      expect(existsSync(abs), `missing component file for ${t.id}: ${rel}`).toBe(true);
    }
  });

  it("publishes the directories those components live in", () => {
    // `files` decides what npm ships; islands/ and tools/ are consumed as raw
    // source by the site, so dropping them from `files` breaks consumers.
    expect(pkg.files).toContain("tools");
    expect(pkg.files).toContain("islands");
  });
});

describe("i18n", () => {
  it("provides the same keys in German and English", () => {
    const de = Object.keys(pack.i18n?.de ?? {}).sort();
    const en = Object.keys(pack.i18n?.en ?? {}).sort();
    expect(de).toEqual(en);
    expect(de.length).toBeGreaterThan(0);
  });

  it("namespaces every i18n key under the pack id", () => {
    for (const key of Object.keys(pack.i18n?.de ?? {})) {
      expect(key.startsWith(`${pack.id}.`), `key "${key}"`).toBe(true);
    }
  });
});
