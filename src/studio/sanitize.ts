/**
 * Allow-list HTML sanitiser for user-supplied components.
 *
 * Pasted markup is only ever a visual reference. It is parsed inertly
 * (DOMParser documents run no scripts and load nothing), rebuilt from an
 * allow-list of elements and attributes, and shown in a sandboxed frame
 * without `allow-scripts`, `allow-forms` or navigation — two independent
 * layers, so a sanitiser gap alone cannot execute anything.
 *
 * `<style>` blocks and `style` attributes are not kept in the markup; they are
 * returned separately so the importer can read them as CSS.
 */

export type ParseHtml = (html: string) => Document;

export const browserParse: ParseHtml = (html) => new DOMParser().parseFromString(html, "text/html");

const ALLOWED_TAGS = new Set(
  (
    "a abbr article aside b blockquote br button caption code dd del details div dl dt em fieldset figcaption figure footer " +
    "form h1 h2 h3 h4 h5 h6 header hr i input ins kbd label legend li main mark nav ol optgroup option p pre q s section " +
    "select small span strong sub summary sup table tbody td textarea tfoot th thead time tr u ul"
  ).split(" "),
);

/** Dropped together with their whole content. */
const DROP_WITH_CONTENT = new Set(["script", "style", "template", "noscript", "iframe", "object", "embed", "svg", "math", "canvas", "audio", "video", "link", "meta", "base", "title", "head"]);

const ALLOWED_ATTRS = new Set([
  "class",
  "id",
  "role",
  "title",
  "alt",
  "placeholder",
  "value",
  "name",
  "for",
  "type",
  "disabled",
  "checked",
  "selected",
  "readonly",
  "required",
  "rows",
  "cols",
  "colspan",
  "rowspan",
  "datetime",
  "open",
  "lang",
  "dir",
  "tabindex",
  "href",
]);

const SAFE_INPUT_TYPES = new Set(["text", "email", "search", "tel", "url", "password", "number", "checkbox", "radio", "date", "range", "button"]);

export interface SanitizedHtml {
  html: string;
  /** Contents of every `<style>` element, in document order. */
  styles: string[];
  /** `selector { style-attribute }` rules rebuilt from inline styles, keyed by a generated id. */
  inlineCss: string;
  removed: string[];
}

export function sanitizeHtml(input: string, parse: ParseHtml = browserParse): SanitizedHtml {
  const src = parse(`<!doctype html><html><body>${input}</body></html>`);
  const out = src.implementation.createHTMLDocument("");
  const styles = Array.from(src.querySelectorAll("style")).map((s) => s.textContent ?? "");
  const removed = new Set<string>();
  const inline: string[] = [];
  let counter = 0;

  const copy = (node: Node, parent: Node) => {
    if (node.nodeType === 3) {
      parent.appendChild(out.createTextNode(node.textContent ?? ""));
      return;
    }
    if (node.nodeType !== 1) return; // comments, processing instructions
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      if (tag !== "style") removed.add(`<${tag}>`);
      return;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      removed.add(`<${tag}>`);
      // Unwrap: keep the allowed children of an unknown wrapper.
      for (const child of Array.from(el.childNodes)) copy(child, parent);
      return;
    }
    const clean = out.createElement(tag);
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        removed.add("Eventhandler (on…)");
        continue;
      }
      if (name === "style") {
        const id = `ds-import-${++counter}`;
        clean.setAttribute("data-import", id);
        inline.push(`[data-import="${id}"] { ${attr.value.replace(/[{}<>]/g, "")} }`);
        continue;
      }
      if (name.startsWith("aria-") || name.startsWith("data-")) {
        if (name !== "data-import") clean.setAttribute(name, attr.value);
        continue;
      }
      if (!ALLOWED_ATTRS.has(name)) {
        removed.add(`Attribut ${name}`);
        continue;
      }
      if (name === "href") {
        // Links in a preview never navigate.
        clean.setAttribute("href", "#");
        continue;
      }
      if (name === "type" && tag === "input") {
        const t = attr.value.toLowerCase();
        clean.setAttribute("type", SAFE_INPUT_TYPES.has(t) ? t : t === "submit" || t === "reset" || t === "image" ? "button" : "text");
        continue;
      }
      if (name === "type" && tag === "button") continue; // forced below
      clean.setAttribute(name, attr.value);
    }
    // `action`/`method` are not on the allow-list, and the preview frame has
    // no `allow-forms`, so a form can never submit.
    if (tag === "button") clean.setAttribute("type", "button");
    parent.appendChild(clean);
    for (const child of Array.from(el.childNodes)) copy(child, clean);
  };

  const container = out.createElement("div");
  for (const child of Array.from(src.body.childNodes)) copy(child, container);
  return { html: container.innerHTML, styles, inlineCss: inline.join("\n"), removed: [...removed] };
}
