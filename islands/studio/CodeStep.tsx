import { useDeferredValue, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { checkCustomCss } from "../../src/studio/customCss";
import { emitCss, singleComponentCss } from "../../src/studio/css";
import { tokenize, type Token } from "../../src/studio/cssParser";
import { COMPONENT_KINDS, type ComponentKind } from "../../src/studio/model";
import type { ResolvedProject } from "../../src/studio/resolve";
import { copyText, Field, SelectInput } from "./controls";
import type { Strings } from "./strings";

const COLORS: Partial<Record<Token["type"], string>> = {
  comment: "var(--color-muted)",
  "at-keyword": "var(--color-accent)",
  string: "var(--color-success, #15803d)",
  "bad-string": "var(--color-danger)",
  hash: "var(--color-warning, #b45309)",
  number: "var(--color-warning, #b45309)",
  percentage: "var(--color-warning, #b45309)",
  dimension: "var(--color-warning, #b45309)",
  function: "var(--color-accent)",
  url: "var(--color-success, #15803d)",
};

/** Syntax highlighting from the same tokenizer that validates the CSS. */
export function highlight(css: string): ReactNode[] {
  const toks = tokenize(css);
  const out: ReactNode[] = [];
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i]!;
    let color = COLORS[tok.type];
    if (tok.type === "ident") {
      // An ident followed by a colon inside a block is a property name.
      let j = i + 1;
      while (toks[j]?.type === "ws") j++;
      if (toks[j]?.type === "colon") color = "var(--color-primary, #1d4ed8)";
    }
    out.push(
      color ? (
        <span key={i} style={{ color }}>
          {tok.value}
        </span>
      ) : (
        tok.value
      ),
    );
  }
  return out;
}

function CodeBlock({ code, t, canCopy }: { code: string; t: Strings; canCopy: boolean }) {
  const [copied, setCopied] = useState(false);
  const deferred = useDeferredValue(code);
  const nodes = useMemo(() => highlight(deferred), [deferred]);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!canCopy}
          onClick={async () => {
            setCopied(await copyText(code));
            setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? t.code.copied : t.code.copy}
        </button>
        {!canCopy && <span className="text-sm opacity-80">{t.code.copyLocked}</span>}
      </div>
      <pre className="dss-code max-h-96 overflow-auto p-4 font-mono text-xs leading-relaxed" style={{ background: "var(--color-soft)", margin: 0 }} tabIndex={0}>
        <code>{nodes}</code>
      </pre>
    </div>
  );
}

/**
 * A textarea over a highlighted copy of its own text. The textarea keeps every
 * native editing behaviour (undo, IME, screen readers); the layer behind it
 * only paints. Its metrics are copied from the textarea at runtime, because
 * the shared `field-boxed` padding is the source of truth, not this file.
 */
function CssEditor({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const area = useRef<HTMLTextAreaElement | null>(null);
  const layer = useRef<HTMLPreElement | null>(null);
  const deferred = useDeferredValue(value);
  const nodes = useMemo(() => highlight(deferred), [deferred]);

  useLayoutEffect(() => {
    const a = area.current;
    const l = layer.current;
    if (!a || !l || typeof getComputedStyle !== "function") return;
    const cs = getComputedStyle(a);
    for (const prop of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "fontSize", "lineHeight", "letterSpacing", "borderTopWidth", "borderLeftWidth"] as const) {
      (l.style as unknown as Record<string, string>)[prop] = cs[prop];
    }
  }, []);

  const sync = () => {
    if (area.current && layer.current) {
      layer.current.scrollTop = area.current.scrollTop;
      layer.current.scrollLeft = area.current.scrollLeft;
    }
  };

  return (
    <div className="relative">
      <pre ref={layer} aria-hidden="true" className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre font-mono" style={{ borderStyle: "solid", borderColor: "transparent" }}>
        <code>{nodes}</code>
        {"\n"}
      </pre>
      <textarea
        ref={area}
        className="field-boxed relative block min-h-64 w-full whitespace-pre font-mono text-sm"
        style={{ background: "transparent", color: "transparent", caretColor: "var(--color-ink, currentColor)", overflowWrap: "normal" }}
        aria-label={label}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        value={value}
        onScroll={sync}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function CodeStep({
  t,
  resolved,
  customCss,
  onCustomCss,
  canCopy,
}: {
  t: Strings;
  resolved: ResolvedProject;
  customCss: string;
  onCustomCss: (css: string) => void;
  canCopy: boolean;
}) {
  const [kind, setKind] = useState<ComponentKind>("button");
  const full = useMemo(() => emitCss(resolved), [resolved]);
  const single = useMemo(() => singleComponentCss(resolved, kind), [resolved, kind]);
  const deferred = useDeferredValue(resolved);
  const check = useMemo(() => checkCustomCss(deferred), [deferred]);

  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <h3 className="eyebrow">{t.code.custom}</h3>
        <p className="text-sm opacity-80">{t.code.customHint}</p>
        <CssEditor value={customCss} onChange={onCustomCss} label={t.code.editorLabel} />
        <div aria-live="polite" className="grid gap-2">
          {check.issues.length === 0 ? (
            <p className="text-sm opacity-80">{t.code.noIssues}</p>
          ) : (
            <ul className="tds-alert tds-alert--warning grid gap-1 text-sm">
              {check.issues.slice(0, 30).map((i, n) => (
                <li key={n}>
                  <strong>
                    {t.code.line} {i.line}:
                  </strong>{" "}
                  {i.message}
                </li>
              ))}
            </ul>
          )}
          {check.conflicts.length > 0 && (
            <div className="tds-alert tds-alert--warning text-sm">
              <p className="font-semibold">{t.code.conflicts}</p>
              <ul className="grid gap-1">
                {check.conflicts.map((c, n) => (
                  <li key={n}>
                    {t.code.line} {c.line}: <code>{c.selector}</code> → <code>{c.property}</code>
                    {c.kind ? ` (${t.kinds[c.kind]})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="eyebrow">{t.code.component}</h3>
        <Field label={t.system.component}>
          <SelectInput label={t.system.component} value={kind} options={COMPONENT_KINDS.map((k) => [k, t.kinds[k]!])} onChange={(k) => setKind(k as ComponentKind)} />
        </Field>
        <CodeBlock code={single} t={t} canCopy={canCopy} />
      </section>

      <section className="grid gap-3">
        <h3 className="eyebrow">{t.code.generated}</h3>
        <CodeBlock code={full} t={t} canCopy={canCopy} />
      </section>
    </div>
  );
}
