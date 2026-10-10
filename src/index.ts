import { defineToolPack, defineTool } from "@tracht-digital-solutions/tds-tools-contract";

/**
 * Developer & design utilities: a JSON formatter/validator, a WCAG contrast
 * checker and the Designsystem-Studio. The studio's engine lives in
 * `src/studio/` and is published as source (`./studio/*`): the island imports
 * it, and the tools site mounts its export handler server-side.
 */
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
    defineTool({
      id: "design-system-studio",
      slug: "designsystem-studio",
      name: "Designsystem-Studio",
      category: "design",
      description:
        "CSS-Komponente visuell gestalten und daraus ein komplettes Designsystem erzeugen: Themes, Barrierefreiheits-Prüfung, Export als CSS, SCSS, Tailwind oder JSON.",
      icon: "palette",
      keywords: ["css generator", "designsystem", "design tokens", "button generator", "theme", "dark mode", "tailwind", "scss", "barrierefreiheit"],
      component: "@tracht-digital-solutions/tds-tool-devkit/tools/DesignSystemStudio.astro",
      seo: {
        title: "CSS-Designsystem-Generator — Komponenten visuell gestalten",
        description:
          "Button oder Karte visuell gestalten, daraus ein Designsystem mit Hell- und Dunkelmodus ableiten, Kontraste prüfen und als CSS, SCSS oder Tailwind exportieren.",
        jsonLdType: "WebApplication",
      },
    }),
  ],
  i18n: {
    de: { "dev.json": "JSON-Formatter", "dev.contrast": "Kontrast-Checker", "dev.studio": "Designsystem-Studio" },
    en: { "dev.json": "JSON Formatter", "dev.contrast": "Contrast Checker", "dev.studio": "Design System Studio" },
  },
});
