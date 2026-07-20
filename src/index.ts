import { defineToolPack, defineTool } from "@tracht-digital-solutions/tds-tools-contract";

/** Developer & design utilities: a JSON formatter/validator + a WCAG contrast checker. */
export default defineToolPack({
  id: "dev",
  name: "Entwickler & Design",
  version: "0.1.0",
  tools: [
    defineTool({
      id: "json-formatter",
      slug: "json-formatter",
      name: "JSON-Formatter & -Validator",
      category: "developer",
      description:
        "Formatiere, validiere und minimiere JSON. Zeigt Syntaxfehler mit Position an — alles lokal im Browser.",
      icon: "braces",
      keywords: ["json", "formatter", "validator", "beautify", "minify"],
      component: "@tracht-digital-solutions/tds-tool-devkit/tools/JsonFormatter.astro",
      seo: {
        title: "JSON-Formatter & -Validator — online, kostenlos",
        description:
          "Kostenloser JSON-Formatter: einrücken, validieren und minimieren mit Fehleranzeige. Läuft komplett im Browser, keine Anmeldung.",
      },
    }),
    defineTool({
      id: "contrast-checker",
      slug: "kontrast-checker",
      name: "Farb-Kontrast-Checker (WCAG)",
      category: "design",
      description:
        "Prüfe das Kontrastverhältnis zwischen Text- und Hintergrundfarbe gegen die WCAG-AA/AAA-Kriterien für barrierefreie Websites.",
      icon: "contrast",
      keywords: ["kontrast", "wcag", "barrierefrei", "accessibility", "farbe"],
      component: "@tracht-digital-solutions/tds-tool-devkit/tools/ContrastChecker.astro",
      seo: {
        title: "Farb-Kontrast-Checker (WCAG) — Barrierefreiheit prüfen",
        description:
          "Kostenloser WCAG-Kontrast-Checker: prüft das Kontrastverhältnis von Text und Hintergrund gegen AA/AAA. Für barrierefreie Websites.",
      },
    }),
  ],
  i18n: {
    de: { "dev.json": "JSON-Formatter", "dev.contrast": "Kontrast-Checker" },
    en: { "dev.json": "JSON Formatter", "dev.contrast": "Contrast Checker" },
  },
});
