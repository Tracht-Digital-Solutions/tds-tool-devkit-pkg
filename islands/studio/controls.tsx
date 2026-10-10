import { useEffect, useId, useState, type ReactNode } from "react";
import { formatColor, parseColor, toHex, type ColorFormat } from "../../src/studio/color";
import { COLOR_ROLES } from "../../src/studio/themes";
import type { Strings } from "./strings";

/**
 * Small, labelled controls built only from shared primitives (`field-boxed`,
 * `chip`, `btn`). Every control names the plain-language property first and
 * the CSS property second, so no CSS knowledge is needed to use it.
 */

export function Field({ label, tech, children, aside }: { label: string; tech?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="dss-field grid gap-1 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="opacity-80">
          {label}
          {tech && <code className="ml-2 text-xs opacity-60">{tech}</code>}
        </span>
        {aside}
      </div>
      {children}
    </div>
  );
}

export function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="tds-disclosure dss-section" open={open}>
      <summary className="cursor-pointer py-2 font-semibold">{title}</summary>
      <div className="grid gap-4 pb-4 pt-2">{children}</div>
    </details>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" className={value === v ? "chip chip-active" : "chip"} aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** A range slider with a number box beside it; both edit the same value. */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  label: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (raw: string) => {
    const n = Number(raw.replace(",", "."));
    if (Number.isFinite(n)) onChange(Math.min(max * 10, Math.max(min < 0 ? min * 10 : 0, n)));
  };
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        className="min-w-0 flex-1"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        className="field-boxed text-right"
        style={{ width: "5rem", flex: "none" }}
        inputMode="decimal"
        aria-label={`${label} (${unit ?? "Wert"})`}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
      />
      {unit && <span className="w-8 text-xs opacity-70">{unit}</span>}
    </div>
  );
}

export function SelectInput<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <select className="field-boxed w-full" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  );
}

export function TextInput({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="field-boxed w-full"
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const id = useId();
  return (
    <div className="tds-toggle-row">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

const ROLE_RE = /^var\(--[a-z0-9-]+?-color-([a-z-]+)\)$/;
const camel = (s: string) => s.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/**
 * Colour control: a picker, a free text field (HEX, RGB, HSL, OKLCH, names),
 * a transparency slider and — where the value may be a theme role — a role
 * selector, so a component colour can follow the theme instead of being fixed.
 */
export function ColorInput({
  value,
  onChange,
  label,
  t,
  expert,
  prefix,
  resolve,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  t: Strings;
  expert: boolean;
  /** Set to allow theme-role references (`var(--prefix-color-role)`). */
  prefix?: string;
  /** Turns a role reference into a concrete colour for the swatch. */
  resolve?: (v: string) => string | null;
}) {
  const roleMatch = ROLE_RE.exec(value.trim());
  const role = roleMatch ? camel(roleMatch[1]!) : null;
  const concrete = role ? (resolve?.(value) ?? "#000000") : value;
  const parsed = parseColor(concrete);
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const alpha = parsed ? parsed.a : 1;

  return (
    <div className="grid gap-2">
      {prefix && (
        <select
          className="field-boxed w-full"
          aria-label={`${label}: ${t.f.role}`}
          value={role ?? "__custom"}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__custom") onChange(parsed ? toHex(parsed) : "#000000");
            else onChange(`var(--${prefix}-color-${kebab(v)})`);
          }}
        >
          <option value="__custom">{t.f.customColor}</option>
          {COLOR_ROLES.map((r) => (
            <option key={r} value={r}>
              {t.f.role}: {r}
            </option>
          ))}
        </select>
      )}
      {!role && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="field-boxed p-1"
            // Inline, not utilities: the shared `field-boxed` width is unlayered
            // and beats `w-14`, which stretched the swatch over the text field.
            style={{ width: "3.5rem", height: "2.75rem", flex: "none" }}
            aria-label={label}
            value={parsed ? toHex({ ...parsed, a: 1 }).slice(0, 7) : "#000000"}
            onChange={(e) => {
              const c = parseColor(e.target.value)!;
              onChange(toHex({ ...c, a: alpha }));
            }}
          />
          <input
            className="field-boxed font-mono text-sm"
            style={{ flex: "1 1 auto", minWidth: 0, width: "auto" }}
            aria-label={`${label} (CSS)`}
            value={draft}
            spellCheck={false}
            onChange={(e) => {
              setDraft(e.target.value);
              if (parseColor(e.target.value) || e.target.value === "transparent") onChange(e.target.value.trim());
            }}
          />
        </div>
      )}
      {!role && expert && parsed && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={t.f.alpha} tech="alpha">
            <NumberInput label={`${label}: ${t.f.alpha}`} value={Math.round(alpha * 100)} min={0} max={100} unit="%" onChange={(n) => onChange(toHex({ ...parsed, a: n / 100 }))} />
          </Field>
          <Field label={t.f.format}>
            <SelectInput
              label={`${label}: ${t.f.format}`}
              value={format}
              options={[
                ["hex", "HEX"],
                ["rgb", "RGB"],
                ["hsl", "HSL"],
                ["oklch", "OKLCH"],
              ]}
              onChange={(f) => {
                setFormat(f);
                onChange(formatColor(parsed, f));
              }}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

export function SourceBadge({ source, t }: { source?: string; t: Strings }) {
  if (!source) return null;
  const tone = source === "manual" || source === "locked" ? "chip chip--info" : source === "imported" || source === "seed" ? "chip chip--success" : "chip chip--neutral";
  return <span className={`${tone} text-xs`}>{t.sources[source] ?? source}</span>;
}

/** Copies text; falls back to a hidden textarea where the async API is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
