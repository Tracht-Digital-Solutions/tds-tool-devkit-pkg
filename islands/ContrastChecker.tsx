import { useMemo, useState } from "react";

/** Parse #rgb / #rrggbb into [r,g,b] 0-255, or null if malformed. */
function parseHex(hex: string): [number, number, number] | null {
  const s = hex.trim().replace(/^#/, "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance of an sRGB channel triple. */
function luminance([r, g, b]: [number, number, number]): number {
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function ratio(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** See the tools-site convention: labels are translated, the maths is not. */
type Lang = "de" | "en";

interface Strings {
  pass: string;
  fail: string;
  textColour: string;
  background: string;
  invalidHex: string;
  aaNormal: string;
  aaLarge: string;
  aaaNormal: string;
  aaaLarge: string;
  legend: string;
  sampleHeading: string;
  sampleBody: string;
  sampleSmall: string;
}

/** German is the default — every existing test here asserts German labels. */
const STRINGS = {
  de: {
    pass: "bestanden ✓",
    fail: "nicht bestanden ✗",
    textColour: "Textfarbe",
    background: "Hintergrund",
    invalidHex: "Bitte gültige Hex-Farben eingeben (z. B. #1f2937).",
    aaNormal: "AA (Normal)",
    aaLarge: "AA (Groß)",
    aaaNormal: "AAA (Normal)",
    aaaLarge: "AAA (Groß)",
    legend: "„Groß“ = ab 18,66px fett bzw. 24px normal. AA verlangt 4,5:1 (normal) / 3:1 (groß), AAA 7:1 / 4,5:1.",
    sampleHeading: "Beispieltext",
    sampleBody: "Digitalisierung für Unternehmen — barrierefrei und lesbar für alle. Dieser Vorschautext verwendet die gewählten Farben.",
    sampleSmall: "Kleinerer Fließtext zur Kontrollprüfung.",
  },
  en: {
    pass: "passed ✓",
    fail: "not passed ✗",
    textColour: "Text colour",
    background: "Background",
    invalidHex: "Please enter valid hex colours (e.g. #1f2937).",
    aaNormal: "AA (normal)",
    aaLarge: "AA (large)",
    aaaNormal: "AAA (normal)",
    aaaLarge: "AAA (large)",
    legend: "“Large” = from 18.66px bold or 24px regular. AA requires 4.5:1 (normal) / 3:1 (large), AAA 7:1 / 4.5:1.",
    sampleHeading: "Sample text",
    sampleBody: "Digitalisation for businesses — accessible and readable for everyone. This preview text uses the colours you selected.",
    sampleSmall: "Smaller body copy for a second check.",
  },
} satisfies Record<Lang, Strings>;

function Badge({ pass, label, t }: { pass: boolean; label: string; t: Strings }) {
  return (
    <span className={`status-pill text-sm ${pass ? "status-pill--success" : "status-pill--danger"}`}>
      {label}: {pass ? t.pass : t.fail}
    </span>
  );
}

/**
 * WCAG colour-contrast checker — foreground vs. background, live ratio and
 * AA/AAA pass badges for normal + large text, with a preview swatch. Client-side.
 */
interface Props {
  lang?: Lang;
}

export default function ContrastChecker({ lang = "de" }: Props) {
  const t = STRINGS[lang];
  const [fg, setFg] = useState("#1f2937");
  const [bg, setBg] = useState("#ffffff");

  const parsed = useMemo(() => {
    const f = parseHex(fg);
    const b = parseHex(bg);
    if (!f || !b) return null;
    return { r: ratio(f, b) };
  }, [fg, bg]);

  const r = parsed?.r ?? 0;
  const rounded = r ? `${r.toFixed(2)} : 1` : "—";

  // Geometry/border/padding from the shared primitive; the pack ships no CSS.
  const field = "field-boxed w-28 font-mono text-sm";

  const swatch = (label: string, value: string, set: (v: string) => void) => (
    <div className="flex items-center gap-2">
      <input type="color" className="field-boxed h-10 w-10" value={parseHex(value) ? value : "#000000"} onChange={(e) => set(e.target.value)} aria-label={label} />
      <label className="text-sm">
        <span className="mb-1 block opacity-80">{label}</span>
        <input className={field} value={value} onChange={(e) => set(e.target.value)} />
      </label>
    </div>
  );

  return (
    <div className="contrast-tool grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-4">
          {swatch(t.textColour, fg, setFg)}
          {swatch(t.background, bg, setBg)}
        </div>

        {!parsed ? (
          <p className="status-pill status-pill--warning text-sm">{t.invalidHex}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-3xl font-semibold">{rounded}</p>
            <div className="flex flex-wrap gap-2">
              <Badge label={t.aaNormal} pass={r >= 4.5} t={t} />
              <Badge label={t.aaLarge} pass={r >= 3} t={t} />
              <Badge label={t.aaaNormal} pass={r >= 7} t={t} />
              <Badge label={t.aaaLarge} pass={r >= 4.5} t={t} />
            </div>
            <p className="text-xs opacity-60">{t.legend}</p>
          </div>
        )}
      </div>

      {/* The sample panel keeps a literal 1px outline of its own, and it is the
          one place in this pack that may. Every other edge here goes through
          `--tds-border-hairline`, which the tools site zeroes (`data-flat`) —
          but this panel's FILL IS THE USER'S, so it cannot be relied on to
          separate the sample from the card behind it. At the default #ffffff
          on the site's white card the two grounds are identical and the sample
          area has no boundary at all: the text still renders, and nothing shows
          the visitor what region is being measured.

          `--color-line` rather than a fixed grey so it follows the theme, and
          the outline sits OUTSIDE the fill (`outline`, not `border`) so it
          cannot be mistaken for part of the colour pair under test. */}
      <div
        className="tds-card p-6"
        style={{
          background: parseHex(bg) ? bg : "#fff",
          color: parseHex(fg) ? fg : "#000",
          outline: "1px solid var(--color-line)",
          outlineOffset: "-1px",
        }}
      >
        <p className="text-2xl font-semibold">{t.sampleHeading}</p>
        <p className="mt-2">{t.sampleBody}</p>
        <p className="mt-2 text-sm opacity-90">{t.sampleSmall}</p>
      </div>
    </div>
  );
}
