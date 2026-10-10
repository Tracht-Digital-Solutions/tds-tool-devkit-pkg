/**
 * A CSS parser built on a real tokenizer (CSS Syntax Level 3 shapes), not on
 * regular expressions over raw text. It handles strings, escapes, comments,
 * `url()`, nested blocks (`@media`, `@supports`, `@layer`, CSS nesting) and
 * keeps source positions for error messages and the editor's highlighting.
 *
 * It is tolerant like a browser — a broken declaration is reported and
 * skipped, the rest still parses — but unlike a browser it TELLS you.
 */

export type TokenType =
  | "ws"
  | "comment"
  | "string"
  | "bad-string"
  | "url"
  | "ident"
  | "function"
  | "at-keyword"
  | "hash"
  | "number"
  | "percentage"
  | "dimension"
  | "delim"
  | "colon"
  | "semicolon"
  | "comma"
  | "{"
  | "}"
  | "("
  | ")"
  | "["
  | "]"
  | "cdo"
  | "cdc";

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
}

export interface CssIssue {
  severity: "error" | "warning";
  message: string;
  line: number;
  column: number;
  offset: number;
}

export interface Declaration {
  type: "decl";
  prop: string;
  value: string;
  important: boolean;
  start: number;
  end: number;
}

export interface StyleRule {
  type: "rule";
  selector: string;
  body: Node[];
  start: number;
  end: number;
}

export interface AtRule {
  type: "at";
  name: string;
  prelude: string;
  /** null for statement at-rules such as `@import …;` */
  body: Node[] | null;
  start: number;
  end: number;
}

export type Node = Declaration | StyleRule | AtRule;

export interface ParseResult {
  nodes: Node[];
  issues: CssIssue[];
}

const isNameStart = (c: string) => /[A-Za-z_\u0080-￿]/.test(c);
const isName = (c: string) => /[A-Za-z0-9_\-\u0080-￿]/.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9";

export function tokenize(src: string, issues: CssIssue[] = []): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;
  const push = (type: TokenType, start: number, value = src.slice(start, i)) => tokens.push({ type, value, start, end: i });
  const err = (message: string, offset: number) => issues.push({ severity: "error", message, offset, ...lineCol(src, offset) });

  const readEscape = () => {
    // Called with src[i] === "\\"
    i++;
    if (i < n && /[0-9a-fA-F]/.test(src[i]!)) {
      let k = 0;
      while (i < n && k < 6 && /[0-9a-fA-F]/.test(src[i]!)) {
        i++;
        k++;
      }
      if (src[i] === " ") i++;
    } else if (i < n) i++;
  };
  const startsIdent = (at: number) => {
    const c = src[at] ?? "";
    if (c === "-") return isNameStart(src[at + 1] ?? "") || src[at + 1] === "-" || (src[at + 1] === "\\" && src[at + 2] !== "\n");
    if (c === "\\") return src[at + 1] !== "\n" && at + 1 < n;
    return isNameStart(c);
  };
  const readName = () => {
    while (i < n) {
      if (src[i] === "\\" && src[i + 1] !== "\n") readEscape();
      else if (isName(src[i]!)) i++;
      else break;
    }
  };
  const startsNumber = (at: number) => {
    const c = src[at] ?? "";
    if (isDigit(c)) return true;
    if (c === "." ) return isDigit(src[at + 1] ?? "");
    if (c === "+" || c === "-") return isDigit(src[at + 1] ?? "") || (src[at + 1] === "." && isDigit(src[at + 2] ?? ""));
    return false;
  };

  while (i < n) {
    const start = i;
    const c = src[i]!;
    if (/\s/.test(c)) {
      while (i < n && /\s/.test(src[i]!)) i++;
      push("ws", start);
    } else if (c === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i + 2);
      if (close < 0) {
        err("Kommentar wird nicht geschlossen (fehlendes */).", start);
        i = n;
      } else i = close + 2;
      push("comment", start);
    } else if (c === '"' || c === "'") {
      i++;
      let bad = false;
      while (i < n && src[i] !== c) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === "\n") {
          bad = true;
          break;
        }
        i++;
      }
      if (i >= n || bad) {
        err("Zeichenkette wird nicht geschlossen.", start);
        push("bad-string", start);
      } else {
        i++;
        push("string", start);
      }
    } else if (startsNumber(i)) {
      if (src[i] === "+" || src[i] === "-") i++;
      while (i < n && isDigit(src[i]!)) i++;
      if (src[i] === "." && isDigit(src[i + 1] ?? "")) {
        i++;
        while (i < n && isDigit(src[i]!)) i++;
      }
      if ((src[i] === "e" || src[i] === "E") && (isDigit(src[i + 1] ?? "") || ((src[i + 1] === "+" || src[i + 1] === "-") && isDigit(src[i + 2] ?? "")))) {
        i += 2;
        while (i < n && isDigit(src[i]!)) i++;
      }
      if (src[i] === "%") {
        i++;
        push("percentage", start);
      } else if (startsIdent(i)) {
        readName();
        push("dimension", start);
      } else push("number", start);
    } else if (startsIdent(i)) {
      readName();
      if (src[i] === "(") {
        const name = src.slice(start, i).toLowerCase();
        i++;
        if (name === "url") {
          let j = i;
          while (j < n && /\s/.test(src[j]!)) j++;
          if (src[j] !== '"' && src[j] !== "'") {
            const close = src.indexOf(")", j);
            if (close < 0) {
              err("url( wird nicht geschlossen.", start);
              i = n;
            } else i = close + 1;
            push("url", start);
            continue;
          }
        }
        push("function", start);
      } else push("ident", start);
    } else if (c === "@") {
      i++;
      if (startsIdent(i)) {
        readName();
        push("at-keyword", start);
      } else push("delim", start);
    } else if (c === "#") {
      i++;
      if (i < n && (isName(src[i]!) || src[i] === "\\")) {
        readName();
        push("hash", start);
      } else push("delim", start);
    } else if (c === "<" && src.startsWith("<!--", i)) {
      i += 4;
      push("cdo", start);
    } else if (c === "-" && src.startsWith("-->", i)) {
      i += 3;
      push("cdc", start);
    } else {
      i++;
      const map: Record<string, TokenType> = { ":": "colon", ";": "semicolon", ",": "comma", "{": "{", "}": "}", "(": "(", ")": ")", "[": "[", "]": "]" };
      push(map[c] ?? "delim", start);
    }
  }
  return tokens;
}

export function lineCol(src: string, offset: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  for (let k = 0; k < offset && k < src.length; k++) {
    if (src[k] === "\n") {
      line++;
      last = k;
    }
  }
  return { line, column: offset - last };
}

/** At-rules whose block holds rules (not declarations). */
const RULE_BLOCK_AT = new Set(["media", "supports", "layer", "container", "document", "scope", "starting-style"]);
/** At-rules whose block holds declarations. */
const DECL_BLOCK_AT = new Set(["font-face", "page", "property", "counter-style", "font-palette-values", "viewport"]);

export function parseCss(src: string): ParseResult {
  const issues: CssIssue[] = [];
  const all = tokenize(src, issues);
  const toks = all.filter((t) => t.type !== "comment");
  let pos = 0;
  const err = (message: string, offset: number, severity: CssIssue["severity"] = "error") =>
    issues.push({ severity, message, offset, ...lineCol(src, offset) });
  const text = (from: number, to: number) => src.slice(from, to).trim().replace(/\s+/g, " ");

  /** Consumes tokens until a stop token at depth 0, returning the end offset. */
  const skipBalanced = (stops: TokenType[]): number => {
    const stack: TokenType[] = [];
    while (pos < toks.length) {
      const t = toks[pos]!;
      if (stack.length === 0 && stops.includes(t.type)) return t.start;
      if (t.type === "{" || t.type === "(" || t.type === "[" || t.type === "function") stack.push(t.type);
      else if (t.type === "}" || t.type === ")" || t.type === "]") {
        const open = stack.pop();
        if (open === undefined) return t.start;
        const want = t.type === "}" ? "{" : t.type === ")" ? ["(", "function"] : "[";
        if (Array.isArray(want) ? !want.includes(open) : open !== want) err(`Klammern passen nicht zusammen („${t.value}“).`, t.start);
      }
      pos++;
    }
    return src.length;
  };

  const parseBlock = (mode: "rules" | "decls" | "mixed", closeAt: boolean): Node[] => {
    const out: Node[] = [];
    while (pos < toks.length) {
      const t = toks[pos]!;
      if (t.type === "ws" || t.type === "semicolon" || t.type === "cdo" || t.type === "cdc") {
        pos++;
        continue;
      }
      if (t.type === "}") {
        if (closeAt) return out;
        err("Überzählige schließende Klammer „}“.", t.start);
        pos++;
        continue;
      }
      if (t.type === "at-keyword") {
        out.push(parseAt());
        continue;
      }
      if (mode !== "rules" && isDeclStart()) {
        const d = parseDecl();
        if (d) out.push(d);
        continue;
      }
      if (mode === "decls") {
        // Garbage in a declaration block: skip to the next `;` or `}`.
        err("Ungültige Deklaration (erwartet „Eigenschaft: Wert;“).", t.start);
        skipBalanced(["semicolon", "}"]);
        continue;
      }
      out.push(parseRule());
    }
    if (closeAt) err("Block wird nicht geschlossen (fehlende „}“).", src.length);
    return out;
  };

  /** Is the token stream at `ident ws* :` (and not a selector like `a:hover {`)? */
  const isDeclStart = () => {
    const t = toks[pos]!;
    if (t.type !== "ident") return false;
    let j = pos + 1;
    while (toks[j]?.type === "ws") j++;
    if (toks[j]?.type !== "colon") return false;
    if (t.value.startsWith("--")) return true;
    // `a:hover {` vs `color: red;` — look for `{` before `;`/`}` at depth 0.
    let depth = 0;
    for (let k = j + 1; k < toks.length; k++) {
      const tk = toks[k]!;
      if (tk.type === "(" || tk.type === "function" || tk.type === "[") depth++;
      else if (tk.type === ")" || tk.type === "]") depth--;
      else if (depth === 0 && (tk.type === "semicolon" || tk.type === "}")) return true;
      else if (depth === 0 && tk.type === "{") return false;
    }
    return true;
  };

  const parseDecl = (): Declaration | null => {
    const first = toks[pos]!;
    const prop = first.value;
    pos++;
    while (toks[pos]?.type === "ws") pos++;
    pos++; // colon
    const vStart = toks[pos]?.start ?? src.length;
    const end = skipBalanced(["semicolon", "}"]);
    let value = src.slice(vStart, end).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    let important = false;
    const imp = /!\s*important\s*$/i.exec(value);
    if (imp) {
      important = true;
      value = value.slice(0, imp.index).trim();
    }
    if (toks[pos]?.type === "semicolon") pos++;
    if (value === "") {
      err(`„${prop}“ hat keinen Wert.`, first.start);
      return null;
    }
    if (!prop.startsWith("--")) {
      const lower = prop.toLowerCase();
      if (!KNOWN_PROPERTIES.has(lower) && !/^-(webkit|moz|ms|o)-/.test(lower)) {
        err(`Unbekannte Eigenschaft „${prop}“ — Tippfehler?`, first.start, "warning");
      }
    }
    return { type: "decl", prop: prop.startsWith("--") ? prop : prop.toLowerCase(), value, important, start: first.start, end };
  };

  const parseRule = (): StyleRule => {
    const start = toks[pos]!.start;
    const preludeEnd = skipBalanced(["{", "semicolon", "}"]);
    const selector = text(start, preludeEnd);
    const t = toks[pos];
    if (!t || t.type !== "{") {
      err(`Nach „${selector.slice(0, 40)}“ fehlt ein „{“.`, start);
      if (t?.type === "semicolon") pos++;
      return { type: "rule", selector, body: [], start, end: preludeEnd };
    }
    if (selector === "") err("Regel ohne Selektor.", start);
    pos++;
    const body = parseBlock("mixed", true);
    const end = toks[pos]?.end ?? src.length;
    if (toks[pos]?.type === "}") pos++;
    return { type: "rule", selector, body, start, end };
  };

  const parseAt = (): AtRule => {
    const kw = toks[pos]!;
    const name = kw.value.slice(1).toLowerCase();
    pos++;
    const preStart = toks[pos]?.start ?? src.length;
    const preEnd = skipBalanced(["{", "semicolon", "}"]);
    const prelude = text(preStart, preEnd);
    const t = toks[pos];
    if (!t || t.type !== "{") {
      if (t?.type === "semicolon") pos++;
      return { type: "at", name, prelude, body: null, start: kw.start, end: preEnd };
    }
    pos++;
    const mode = RULE_BLOCK_AT.has(name) ? "rules" : DECL_BLOCK_AT.has(name) ? "decls" : name === "keyframes" || name.endsWith("-keyframes") ? "rules" : "mixed";
    const body = parseBlock(mode, true);
    const end = toks[pos]?.end ?? src.length;
    if (toks[pos]?.type === "}") pos++;
    return { type: "at", name, prelude, body, start: kw.start, end };
  };

  const nodes = parseBlock("rules", false);
  return { nodes, issues };
}

/** Serialises nodes back to CSS (normalised whitespace, comments dropped). */
export function stringify(nodes: Node[], indent = ""): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "decl") out += `${indent}${node.prop}: ${node.value}${node.important ? " !important" : ""};\n`;
    else if (node.type === "rule") out += `${indent}${node.selector} {\n${stringify(node.body, `${indent}  `)}${indent}}\n`;
    else if (node.body === null) out += `${indent}@${node.name}${node.prelude ? ` ${node.prelude}` : ""};\n`;
    else out += `${indent}@${node.name}${node.prelude ? ` ${node.prelude}` : ""} {\n${stringify(node.body, `${indent}  `)}${indent}}\n`;
  }
  return out;
}

export interface FlatRule {
  selector: string;
  decls: Declaration[];
  /** Enclosing at-rule preludes, outermost first, e.g. ["media (max-width: 40em)"]. */
  context: string[];
  order: number;
}

/**
 * Flattens nested rules into selector + declarations, resolving CSS nesting
 * (`&`) and recording the at-rule context of each rule.
 */
export function flattenRules(nodes: Node[]): FlatRule[] {
  const out: FlatRule[] = [];
  let order = 0;
  const walk = (list: Node[], parentSel: string | null, context: string[]) => {
    for (const node of list) {
      if (node.type === "rule") {
        const sel = parentSel ? nestSelector(parentSel, node.selector) : node.selector;
        const decls = node.body.filter((b): b is Declaration => b.type === "decl");
        if (decls.length) out.push({ selector: sel, decls, context, order: order++ });
        walk(node.body.filter((b) => b.type !== "decl"), sel, context);
      } else if (node.type === "at" && node.body) {
        if (node.name === "keyframes" || node.name.endsWith("keyframes") || node.name === "font-face") continue;
        const decls = node.body.filter((b): b is Declaration => b.type === "decl");
        if (decls.length && parentSel) out.push({ selector: parentSel, decls, context: [...context, `${node.name} ${node.prelude}`], order: order++ });
        walk(node.body.filter((b) => b.type !== "decl"), parentSel, [...context, `${node.name} ${node.prelude}`.trim()]);
      }
    }
  };
  walk(nodes, null, []);
  return out;
}

function nestSelector(parent: string, child: string): string {
  const parents = splitSelectorList(parent);
  return splitSelectorList(child)
    .flatMap((c) => parents.map((p) => (c.includes("&") ? c.replace(/&/g, p) : `${p} ${c}`)))
    .join(", ");
}

/** Splits a selector list on top-level commas. */
export function splitSelectorList(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = "";
  for (const ch of selector) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Selector specificity [ids, classes/attributes/pseudo-classes, types]. */
export function specificity(selector: string): [number, number, number] {
  let a = 0;
  let b = 0;
  let c = 0;
  let s = selector.replace(/"[^"]*"|'[^']*'/g, "");
  // :where() contributes nothing; :is()/:not()/:has() contribute their argument's max.
  s = s.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, "");
  s = s.replace(/:(is|not|has|matches)\(((?:[^()]|\([^()]*\))*)\)/g, (_m, _n, inner: string) => {
    const best = splitSelectorList(inner)
      .map(specificity)
      .sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2])[0] ?? [0, 0, 0];
    a += best[0];
    b += best[1];
    c += best[2];
    return "";
  });
  a += (s.match(/#[\w-]+/g) ?? []).length;
  b += (s.match(/\.[\w-]+/g) ?? []).length;
  b += (s.match(/\[[^\]]*\]/g) ?? []).length;
  b += (s.replace(/::[\w-]+/g, "").match(/:[\w-]+(\([^)]*\))?/g) ?? []).length;
  c += (s.match(/::[\w-]+/g) ?? []).length;
  c += (s.replace(/\[[^\]]*\]/g, "").replace(/[#.:][\w-]+(\([^)]*\))?/g, "").match(/(^|[\s>+~])([a-zA-Z][\w-]*)/g) ?? []).length;
  return [a, b, c];
}

/** The base selector without trailing state pseudo-classes, e.g. `.btn:hover` → `.btn`. */
export function stripState(selector: string): { base: string; state: string | null } {
  const m = /^(.*?)(:(hover|focus|focus-visible|focus-within|active|disabled))+$/.exec(selector.trim());
  if (!m) return { base: selector.trim(), state: null };
  const state = /:(hover|focus-visible|focus-within|focus|active|disabled)$/.exec(selector.trim())?.[1] ?? null;
  return { base: m[1]!.trim(), state };
}

// A deliberately broad list of standard properties, used only for the
// "unknown property — typo?" warning. Missing entries cause a warning, never
// an error, so the list errs on the side of inclusion.
const KNOWN_PROPERTIES = new Set(
  (
    "accent-color align-content align-items align-self all animation animation-composition animation-delay animation-direction animation-duration " +
    "animation-fill-mode animation-iteration-count animation-name animation-play-state animation-timeline animation-timing-function appearance aspect-ratio " +
    "backdrop-filter backface-visibility background background-attachment background-blend-mode background-clip background-color background-image " +
    "background-origin background-position background-position-x background-position-y background-repeat background-size block-size border " +
    "border-block border-block-color border-block-end border-block-end-color border-block-end-style border-block-end-width border-block-start " +
    "border-block-start-color border-block-start-style border-block-start-width border-block-style border-block-width border-bottom " +
    "border-bottom-color border-bottom-left-radius border-bottom-right-radius border-bottom-style border-bottom-width border-collapse border-color " +
    "border-end-end-radius border-end-start-radius border-image border-image-outset border-image-repeat border-image-slice border-image-source " +
    "border-image-width border-inline border-inline-color border-inline-end border-inline-end-color border-inline-end-style border-inline-end-width " +
    "border-inline-start border-inline-start-color border-inline-start-style border-inline-start-width border-inline-style border-inline-width " +
    "border-left border-left-color border-left-style border-left-width border-radius border-right border-right-color border-right-style " +
    "border-right-width border-spacing border-start-end-radius border-start-start-radius border-style border-top border-top-color " +
    "border-top-left-radius border-top-right-radius border-top-style border-top-width border-width bottom box-decoration-break box-shadow box-sizing " +
    "break-after break-before break-inside caption-side caret-color clear clip clip-path color color-scheme column-count column-fill column-gap " +
    "column-rule column-rule-color column-rule-style column-rule-width column-span column-width columns contain contain-intrinsic-size " +
    "container container-name container-type content content-visibility counter-increment counter-reset counter-set cursor direction display " +
    "empty-cells field-sizing fill filter flex flex-basis flex-direction flex-flow flex-grow flex-shrink flex-wrap float font font-display " +
    "font-family font-feature-settings font-kerning font-optical-sizing font-palette font-size font-size-adjust font-stretch font-style " +
    "font-synthesis font-variant font-variant-caps font-variant-ligatures font-variant-numeric font-variation-settings font-weight forced-color-adjust gap grid " +
    "grid-area grid-auto-columns grid-auto-flow grid-auto-rows grid-column grid-column-end grid-column-gap grid-column-start grid-gap grid-row " +
    "grid-row-end grid-row-gap grid-row-start grid-template grid-template-areas grid-template-columns grid-template-rows hanging-punctuation " +
    "height hyphens hyphenate-character image-rendering inline-size inset inset-block inset-block-end inset-block-start inset-inline " +
    "inset-inline-end inset-inline-start isolation justify-content justify-items justify-self left letter-spacing line-break line-clamp line-height " +
    "list-style list-style-image list-style-position list-style-type margin margin-block margin-block-end margin-block-start margin-bottom " +
    "margin-inline margin-inline-end margin-inline-start margin-left margin-right margin-top marker mask mask-image mask-mode mask-position " +
    "mask-repeat mask-size max-block-size max-height max-inline-size max-width min-block-size min-height min-inline-size min-width " +
    "mix-blend-mode object-fit object-position offset opacity order orphans outline outline-color outline-offset outline-style outline-width " +
    "overflow overflow-anchor overflow-block overflow-clip-margin overflow-inline overflow-wrap overflow-x overflow-y overscroll-behavior " +
    "overscroll-behavior-block overscroll-behavior-inline overscroll-behavior-x overscroll-behavior-y padding padding-block padding-block-end " +
    "padding-block-start padding-bottom padding-inline padding-inline-end padding-inline-start padding-left padding-right padding-top page " +
    "page-break-after page-break-before page-break-inside paint-order perspective perspective-origin place-content place-items place-self " +
    "pointer-events position print-color-adjust quotes resize right rotate row-gap ruby-position scale scroll-behavior scroll-margin " +
    "scroll-margin-block scroll-margin-bottom scroll-margin-inline scroll-margin-left scroll-margin-right scroll-margin-top scroll-padding " +
    "scroll-padding-block scroll-padding-bottom scroll-padding-inline scroll-padding-left scroll-padding-right scroll-padding-top scroll-snap-align " +
    "scroll-snap-stop scroll-snap-type scrollbar-color scrollbar-gutter scrollbar-width shape-image-threshold shape-margin shape-outside stroke " +
    "stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset tab-size table-layout text-align text-align-last " +
    "text-combine-upright text-decoration text-decoration-color text-decoration-line text-decoration-skip-ink text-decoration-style " +
    "text-decoration-thickness text-emphasis text-indent text-justify text-orientation text-overflow text-rendering text-shadow text-size-adjust " +
    "text-transform text-underline-offset text-underline-position text-wrap text-wrap-mode text-wrap-style top touch-action transform transform-box " +
    "transform-origin transform-style transition transition-behavior transition-delay transition-duration transition-property " +
    "transition-timing-function translate unicode-bidi user-select vertical-align view-transition-name visibility white-space " +
    "white-space-collapse widows width will-change word-break word-spacing word-wrap writing-mode z-index zoom src font-named-instance " +
    "unicode-range size-adjust ascent-override descent-override line-gap-override syntax inherits initial-value interpolate-size anchor-name position-anchor"
  ).split(" "),
);
