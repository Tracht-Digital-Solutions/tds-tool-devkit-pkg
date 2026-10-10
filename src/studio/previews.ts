/**
 * The three preview views (components, panel, landing page) plus the
 * single-component view of the wizard.
 *
 * Preview markup is purely visual: buttons are `type="button"`, links point at
 * `#`, forms carry no action, nothing has a handler — and the frame that shows
 * it has no `allow-scripts` and no `allow-forms`. Layout scaffolding that only
 * the demo pages need (sidebar grid, table, hero) uses `pv-` classes built from
 * the system's own tokens; it is not part of the exported component library.
 */

import { componentClass } from "./components";
import { COLOR_ROLES } from "./themes";
import type { ComponentKind, SeedKind } from "./model";

export const PREVIEW_VIEWS = ["components", "panel", "landing"] as const;
export type PreviewView = (typeof PREVIEW_VIEWS)[number];

export const DEVICES = { desktop: 1280, tablet: 820, phone: 390 } as const;
export type Device = keyof typeof DEVICES;

type Lang = "de" | "en";

const T = {
  de: {
    brand: "Musterfirma",
    nav: ["Start", "Leistungen", "Über uns", "Kontakt"],
    h1: "Überschrift erster Ordnung",
    h2: "Überschrift zweiter Ordnung",
    h3: "Überschrift dritter Ordnung",
    h4: "Überschrift vierter Ordnung",
    lead: "Ein einleitender Absatz fasst zusammen, worum es auf dieser Seite geht.",
    body: "Fließtext für längere Abschnitte. Er sollte bequem lesbar sein, mit ausreichender Zeilenhöhe und einem ruhigen Kontrast.",
    muted: "Ergänzender, gedämpfter Hinweistext.",
    link: "Ein Textlink",
    primary: "Jetzt anfragen",
    secondary: "Mehr erfahren",
    states: { normal: "Normal", hover: "Hover", focus: "Fokus", active: "Aktiv", disabled: "Deaktiviert" },
    cardTitle: "Kartentitel",
    cardText: "Karten bündeln zusammengehörige Inhalte und Aktionen.",
    label: "E-Mail-Adresse",
    placeholder: "name@beispiel.de",
    message: "Nachricht",
    choose: "Bitte wählen",
    send: "Absenden",
    footer: "© 2026 Musterfirma · Alle Rechte vorbehalten",
    footerLinks: ["Impressum", "Datenschutz", "Kontakt"],
    typography: "Typografie",
    buttons: "Buttons und Links",
    cards: "Karten",
    forms: "Formulare",
    navFooter: "Navigation und Footer",
    colors: "Farbrollen",
    dashboard: "Übersicht",
    side: ["Übersicht", "Projekte", "Kunden", "Rechnungen", "Einstellungen"],
    stats: [
      ["Offene Anfragen", "24"],
      ["Umsatz (Monat)", "12.480 €"],
      ["Zufriedenheit", "96 %"],
    ],
    table: ["Kunde", "Status", "Betrag"],
    rows: [
      ["Bäckerei Krause", "Bezahlt", "480 €"],
      ["Elektro Nord", "Offen", "1.250 €"],
      ["Studio Weiß", "Entwurf", "320 €"],
    ],
    quick: "Schnell erfassen",
    heroEyebrow: "Digitale Maßarbeit",
    heroTitle: "Websites, die zu Ihrem Betrieb passen",
    heroText: "Klar gestaltet, schnell geladen und einfach zu pflegen — für kleine und mittlere Unternehmen.",
    services: "Unsere Leistungen",
    serviceItems: [
      ["Webdesign", "Individuelle Gestaltung, die Ihre Marke trägt."],
      ["Pflege", "Updates, Sicherheit und Inhalte aus einer Hand."],
      ["Beratung", "Ehrliche Einschätzung, was Ihr Projekt braucht."],
    ],
    contact: "Kontakt aufnehmen",
    contactText: "Schreiben Sie uns — wir melden uns innerhalb eines Werktags.",
    name: "Name",
  },
  en: {
    brand: "Example Ltd",
    nav: ["Home", "Services", "About", "Contact"],
    h1: "First-level heading",
    h2: "Second-level heading",
    h3: "Third-level heading",
    h4: "Fourth-level heading",
    lead: "An introductory paragraph sums up what this page is about.",
    body: "Body copy for longer sections. It should read comfortably, with enough line height and calm contrast.",
    muted: "Supplementary, muted hint text.",
    link: "A text link",
    primary: "Get in touch",
    secondary: "Learn more",
    states: { normal: "Normal", hover: "Hover", focus: "Focus", active: "Active", disabled: "Disabled" },
    cardTitle: "Card title",
    cardText: "Cards group related content and actions.",
    label: "Email address",
    placeholder: "name@example.com",
    message: "Message",
    choose: "Please choose",
    send: "Send",
    footer: "© 2026 Example Ltd · All rights reserved",
    footerLinks: ["Imprint", "Privacy", "Contact"],
    typography: "Typography",
    buttons: "Buttons and links",
    cards: "Cards",
    forms: "Forms",
    navFooter: "Navigation and footer",
    colors: "Colour roles",
    dashboard: "Overview",
    side: ["Overview", "Projects", "Customers", "Invoices", "Settings"],
    stats: [
      ["Open requests", "24"],
      ["Revenue (month)", "€12,480"],
      ["Satisfaction", "96 %"],
    ],
    table: ["Customer", "Status", "Amount"],
    rows: [
      ["Krause Bakery", "Paid", "€480"],
      ["Nord Electrics", "Open", "€1,250"],
      ["Studio White", "Draft", "€320"],
    ],
    quick: "Quick entry",
    heroEyebrow: "Made to measure",
    heroTitle: "Websites that fit your business",
    heroText: "Clearly designed, fast to load and easy to maintain — for small and medium-sized businesses.",
    services: "Our services",
    serviceItems: [
      ["Web design", "Individual design that carries your brand."],
      ["Maintenance", "Updates, security and content from one source."],
      ["Consulting", "An honest view of what your project needs."],
    ],
    contact: "Get in touch",
    contactText: "Write to us — we reply within one working day.",
    name: "Name",
  },
} as const;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function k(p: string, kind: ComponentKind) {
  return componentClass(p, kind);
}

const STATES = ["normal", "hover", "focus", "active", "disabled"] as const;
const stateClass = (s: (typeof STATES)[number]) => (s === "normal" ? "" : ` is-${s}`);

function nav(p: string, t: (typeof T)[Lang]) {
  return `<nav class="${k(p, "nav")}" aria-label="Hauptnavigation">
  <a class="${p}-nav__brand" href="#">${esc(t.brand)}</a>
  <button type="button" class="${p}-nav__toggle" aria-label="Menü"></button>
  <ul class="${p}-nav__links">${t.nav.map((n, i) => `<li><a class="${p}-nav__link" href="#"${i === 0 ? ' aria-current="page"' : ""}>${esc(n)}</a></li>`).join("")}</ul>
</nav>`;
}

function footer(p: string, t: (typeof T)[Lang]) {
  return `<footer class="${k(p, "footer")}"><div class="${p}-container ${p}-row" style="justify-content: space-between">
  <span>${esc(t.footer)}</span>
  <ul class="${p}-footer__links">${t.footerLinks.map((l) => `<li><a href="#">${esc(l)}</a></li>`).join("")}</ul>
</div></footer>`;
}

function field(p: string, t: (typeof T)[Lang], id: string, extra = "") {
  return `<div class="${p}-field"><label class="${k(p, "label")}" for="${id}">${esc(t.label)}</label><input class="${k(p, "input")}${extra}" id="${id}" type="email" placeholder="${esc(t.placeholder)}"${extra.includes("is-disabled") ? " disabled" : ""}></div>`;
}

/** The single seed component, shown in all five states (wizard view). */
export function seedBody(prefix: string, kind: SeedKind, lang: Lang): string {
  const t = T[lang];
  const p = prefix;
  const cell = (s: (typeof STATES)[number], inner: string) => `<figure class="pv-state"><div class="pv-state__stage">${inner}</div><figcaption>${esc(t.states[s])}</figcaption></figure>`;
  const items = STATES.map((s) => {
    switch (kind) {
      case "button":
        return cell(s, `<button type="button" class="${k(p, "button")}${stateClass(s)}"${s === "disabled" ? " disabled" : ""}>${esc(t.primary)}</button>`);
      case "link":
        return cell(s, `<a class="${k(p, "link")}${stateClass(s)}" href="#">${esc(t.link)}</a>`);
      case "input":
        return cell(s, `<input class="${k(p, "input")}${stateClass(s)}" type="text" placeholder="${esc(t.placeholder)}"${s === "disabled" ? " disabled" : ""}>`);
      case "card":
        return s === "disabled" || s === "active"
          ? ""
          : cell(s, `<article class="${k(p, "card")}${stateClass(s)}" tabindex="-1"><h3 class="${p}-card__title">${esc(t.cardTitle)}</h3><p class="${k(p, "text")}">${esc(t.cardText)}</p></article>`);
    }
  }).join("");
  return `<main class="pv-seed">${items}</main>`;
}

function componentsBody(p: string, t: (typeof T)[Lang], simulate = true): string {
  const shown = simulate ? STATES : (["normal", "disabled"] as const);
  const states = (render: (s: (typeof STATES)[number]) => string) =>
    `<div class="pv-states">${shown.map((s) => `<figure class="pv-state"><div class="pv-state__stage">${render(s)}</div><figcaption>${esc(t.states[s])}</figcaption></figure>`).join("")}</div>`;
  return `${nav(p, t)}
<main class="${p}-container ${p}-section pv-gallery">
  <section class="${p}-stack"><p class="pv-eyebrow">${esc(t.typography)}</p>
    <h1 class="${k(p, "heading")} ${p}-h1">${esc(t.h1)}</h1>
    <h2 class="${k(p, "heading")} ${p}-h2">${esc(t.h2)}</h2>
    <h3 class="${k(p, "heading")} ${p}-h3">${esc(t.h3)}</h3>
    <h4 class="${k(p, "heading")} ${p}-h4">${esc(t.h4)}</h4>
    <p class="${k(p, "text")} ${p}-lead">${esc(t.lead)}</p>
    <p class="${k(p, "text")}">${esc(t.body)} <a class="${k(p, "link")}" href="#">${esc(t.link)}</a>.</p>
    <p class="${k(p, "text")} ${p}-text--muted">${esc(t.muted)}</p>
  </section>
  <section class="${p}-stack"><p class="pv-eyebrow">${esc(t.buttons)}</p>
    ${states((s) => `<button type="button" class="${k(p, "button")}${stateClass(s)}"${s === "disabled" ? " disabled" : ""}>${esc(t.primary)}</button>`)}
    ${states((s) => `<button type="button" class="${p}-btn ${k(p, "buttonSecondary")}${stateClass(s)}"${s === "disabled" ? " disabled" : ""}>${esc(t.secondary)}</button>`)}
    ${states((s) => `<a class="${k(p, "link")}${stateClass(s)}" href="#">${esc(t.link)}</a>`)}
  </section>
  <section class="${p}-stack"><p class="pv-eyebrow">${esc(t.cards)}</p>
    <div class="${p}-grid">${[0, 1, 2]
      .map(
        (i) => `<article class="${k(p, "card")}${i === 1 && simulate ? " is-hover" : ""}"><h3 class="${p}-card__title">${esc(t.cardTitle)}</h3><p class="${k(p, "text")}">${esc(t.cardText)}</p><p class="pv-card-actions"><a class="${k(p, "link")}" href="#">${esc(t.secondary)}</a></p></article>`,
      )
      .join("")}</div>
  </section>
  <section class="${p}-stack"><p class="pv-eyebrow">${esc(t.forms)}</p>
    <form class="${p}-form pv-form">
      ${states((s) => `<input class="${k(p, "input")}${stateClass(s)}" type="text" aria-label="${esc(t.label)}" placeholder="${esc(t.placeholder)}"${s === "disabled" ? " disabled" : ""}>`)}
      ${field(p, t, "pv-mail")}
      <div class="${p}-field"><label class="${k(p, "label")}" for="pv-msg">${esc(t.message)}</label><textarea class="${k(p, "input")}" id="pv-msg" rows="3"></textarea></div>
      <div class="${p}-field"><label class="${k(p, "label")}" for="pv-sel">${esc(t.choose)}</label><select class="${k(p, "input")}" id="pv-sel"><option>${esc(t.choose)}</option></select></div>
      <div><button type="button" class="${p}-btn ${k(p, "formButton")}">${esc(t.send)}</button></div>
    </form>
  </section>
  <section class="${p}-stack"><p class="pv-eyebrow">${esc(t.colors)}</p>
    <div class="pv-swatches">${COLOR_ROLES.map((r) => `<div class="pv-swatch"><span style="background: var(--${p}-color-${r.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)})"></span><code>${r}</code></div>`).join("")}</div>
  </section>
</main>
${footer(p, t)}`;
}

function panelBody(p: string, t: (typeof T)[Lang]): string {
  return `<div class="pv-app">
  <aside class="pv-side"><a class="${p}-nav__brand" href="#">${esc(t.brand)}</a>
    <ul class="pv-side__links">${t.side.map((s, i) => `<li><a class="${p}-nav__link" href="#"${i === 0 ? ' aria-current="page"' : ""}>${esc(s)}</a></li>`).join("")}</ul>
  </aside>
  <div class="pv-main">
    <header class="${k(p, "nav")}"><span class="${p}-nav__brand">${esc(t.dashboard)}</span><div class="${p}-row"><button type="button" class="${p}-btn ${k(p, "buttonSecondary")}">${esc(t.secondary)}</button><button type="button" class="${k(p, "button")}">${esc(t.primary)}</button></div></header>
    <main class="pv-content ${p}-stack">
      <div class="${p}-grid">${t.stats.map(([label, value]) => `<article class="${k(p, "card")}"><p class="${k(p, "text")} ${p}-text--muted">${esc(label!)}</p><p class="pv-stat">${esc(value!)}</p></article>`).join("")}</div>
      <div class="pv-split">
        <article class="${k(p, "card")}"><h2 class="${p}-card__title">${esc(t.table[0]!)}</h2>
          <div class="pv-table-wrap"><table class="pv-table"><thead><tr>${t.table.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
          <tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => `<td>${i === 0 ? `<a class="${k(p, "link")}" href="#">${esc(c)}</a>` : esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        </article>
        <article class="${k(p, "card")}"><h2 class="${p}-card__title">${esc(t.quick)}</h2>
          <form class="${p}-form">${field(p, t, "pv-panel-mail")}<div><button type="button" class="${p}-btn ${k(p, "formButton")}">${esc(t.send)}</button></div></form>
        </article>
      </div>
    </main>
  </div>
</div>`;
}

function landingBody(p: string, t: (typeof T)[Lang]): string {
  return `${nav(p, t)}
<main>
  <section class="${p}-section pv-hero"><div class="${p}-container ${p}-stack">
    <p class="pv-eyebrow">${esc(t.heroEyebrow)}</p>
    <h1 class="${k(p, "heading")} ${p}-h1">${esc(t.heroTitle)}</h1>
    <p class="${k(p, "text")} ${p}-lead">${esc(t.heroText)}</p>
    <div class="${p}-row"><a class="${k(p, "button")}" href="#">${esc(t.primary)}</a><a class="${p}-btn ${k(p, "buttonSecondary")}" href="#">${esc(t.secondary)}</a></div>
  </div></section>
  <section class="${p}-section pv-band"><div class="${p}-container ${p}-stack">
    <h2 class="${k(p, "heading")} ${p}-h2">${esc(t.services)}</h2>
    <div class="${p}-grid">${t.serviceItems
      .map(([title, text]) => `<article class="${k(p, "card")}"><h3 class="${p}-card__title">${esc(title!)}</h3><p class="${k(p, "text")}">${esc(text!)}</p><p class="pv-card-actions"><a class="${k(p, "link")}" href="#">${esc(t.secondary)}</a></p></article>`)
      .join("")}</div>
  </div></section>
  <section class="${p}-section"><div class="${p}-container pv-contact">
    <div class="${p}-stack"><h2 class="${k(p, "heading")} ${p}-h2">${esc(t.contact)}</h2><p class="${k(p, "text")}">${esc(t.contactText)}</p></div>
    <form class="${k(p, "card")} ${p}-form">
      <div class="${p}-field"><label class="${k(p, "label")}" for="pv-name">${esc(t.name)}</label><input class="${k(p, "input")}" id="pv-name" type="text"></div>
      ${field(p, t, "pv-land-mail")}
      <div class="${p}-field"><label class="${k(p, "label")}" for="pv-land-msg">${esc(t.message)}</label><textarea class="${k(p, "input")}" id="pv-land-msg" rows="3"></textarea></div>
      <div><button type="button" class="${p}-btn ${k(p, "formButton")}">${esc(t.send)}</button></div>
    </form>
  </div></section>
</main>
${footer(p, t)}`;
}

/**
 * `simulate` adds the `.is-hover`/`.is-focus`/… state rows the preview shows.
 * The exported example pages pass false: they demonstrate real states only.
 */
export function previewBody(prefix: string, view: PreviewView, lang: Lang, simulate = true): string {
  const t = T[lang];
  if (view === "panel") return panelBody(prefix, t);
  if (view === "landing") return landingBody(prefix, t);
  return componentsBody(prefix, t, simulate);
}

/** Layout for the demo pages only — built from the system's tokens. */
export function scaffoldCss(p: string): string {
  return `
.pv-eyebrow { margin: 0; font: 600 0.75rem/1.2 var(--${p}-font-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--${p}-color-muted); }
.pv-gallery { display: grid; gap: var(--${p}-space-7); }
.pv-states { display: flex; flex-wrap: wrap; gap: var(--${p}-space-3); align-items: flex-end; }
.pv-state { margin: 0; display: grid; gap: var(--${p}-space-2); justify-items: start; }
.pv-state figcaption { font: 500 0.75rem/1 var(--${p}-font-mono); color: var(--${p}-color-muted); }
.pv-seed { min-height: 100vh; display: flex; flex-wrap: wrap; align-content: center; justify-content: center; gap: var(--${p}-space-5); padding: var(--${p}-space-5); }
.pv-seed .pv-state__stage { min-width: 12rem; }
.pv-seed .${p}-card { max-width: 18rem; }
.pv-card-actions { margin: var(--${p}-space-3) 0 0; }
.pv-form { max-width: 34rem; }
.pv-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: var(--${p}-space-2); }
.pv-swatch { display: flex; align-items: center; gap: var(--${p}-space-2); font-size: 0.75rem; }
.pv-swatch span { width: 1.75rem; height: 1.75rem; border-radius: var(--${p}-radius-sm); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--${p}-color-text) 18%, transparent); flex: none; }
.pv-swatch code { font-family: var(--${p}-font-mono); overflow-wrap: anywhere; }
.pv-app { display: grid; grid-template-columns: 15rem minmax(0, 1fr); min-height: 100vh; }
.pv-side { background: var(--${p}-color-surface-alt); padding: var(--${p}-space-4); display: grid; align-content: start; gap: var(--${p}-space-4); }
.pv-side__links { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--${p}-space-1); }
.pv-side .${p}-nav__link { width: 100%; }
.pv-main { min-width: 0; }
.pv-content { padding: var(--${p}-space-5); }
.pv-stat { margin: 0; font: 700 var(--${p}-text-2xl)/1.1 var(--${p}-font-heading); }
.pv-split { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: var(--${p}-space-4); }
.pv-table-wrap { overflow-x: auto; }
.pv-table { width: 100%; border-collapse: collapse; font-size: var(--${p}-text-sm); }
.pv-table th, .pv-table td { text-align: left; padding: var(--${p}-space-2) var(--${p}-space-3); border-bottom: 1px solid var(--${p}-color-border); }
.pv-table th { color: var(--${p}-color-muted); font-weight: 600; }
.pv-hero { background: linear-gradient(180deg, var(--${p}-color-surface-alt), var(--${p}-color-background)); }
.pv-band { background: var(--${p}-color-surface-alt); }
.pv-contact { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: var(--${p}-space-6); align-items: start; }
@media (max-width: 52em) {
  .pv-app { grid-template-columns: 1fr; }
  .pv-side { display: none; }
  .pv-split, .pv-contact { grid-template-columns: 1fr; }
}
`;
}

/**
 * The complete preview document. The CSP forbids every network load (a
 * pasted `url()` or `@import` cannot phone home) and every script.
 */
export function previewDocument(opts: { css: string; prefix: string; body: string; theme: string | null; lang: Lang }): string {
  const theme = opts.theme ? ` data-theme="${esc(opts.theme)}"` : "";
  return `<!doctype html><html lang="${opts.lang}"${theme}><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style id="ds-css">${opts.css}</style><style id="pv-css">${scaffoldCss(opts.prefix)}</style></head>
<body class="${esc(opts.prefix)}-body">${opts.body}</body></html>`;
}
