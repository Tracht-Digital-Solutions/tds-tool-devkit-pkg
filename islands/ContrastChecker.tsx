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

function Badge({ pass, label }: { pass: boolean; label: string }) {
  return (
    <span className={`status-pill text-sm ${pass ? "status-pill--success" : "status-pill--danger"}`}>
      {label}: {pass ? "bestanden ✓" : "nicht bestanden ✗"}
    </span>
  );
}

/**
 * WCAG colour-contrast checker — foreground vs. background, live ratio and
 * AA/AAA pass badges for normal + large text, with a preview swatch. Client-side.
 */
export default function ContrastChecker() {
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

  const field = "w-28 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-paper)] px-2 py-1 font-mono text-sm";

  const swatch = (label: string, value: string, set: (v: string) => void) => (
    <div className="flex items-center gap-2">
      <input type="color" value={parseHex(value) ? value : "#000000"} onChange={(e) => set(e.target.value)} className="h-10 w-10 rounded" aria-label={label} />
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
          {swatch("Textfarbe", fg, setFg)}
          {swatch("Hintergrund", bg, setBg)}
        </div>

        {!parsed ? (
          <p className="status-pill status-pill--warning text-sm">Bitte gültige Hex-Farben eingeben (z. B. #1f2937).</p>
        ) : (
          <div className="space-y-3">
            <p className="text-3xl font-semibold">{rounded}</p>
            <div className="flex flex-wrap gap-2">
              <Badge label="AA (Normal)" pass={r >= 4.5} />
              <Badge label="AA (Groß)" pass={r >= 3} />
              <Badge label="AAA (Normal)" pass={r >= 7} />
              <Badge label="AAA (Groß)" pass={r >= 4.5} />
            </div>
            <p className="text-xs opacity-60">
              „Groß“ = ab 18,66px fett bzw. 24px normal. AA verlangt 4,5:1 (normal) / 3:1 (groß), AAA 7:1 / 4,5:1.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[color:var(--color-border)] p-6" style={{ background: parseHex(bg) ? bg : "#fff", color: parseHex(fg) ? fg : "#000" }}>
        <p className="text-2xl font-semibold">Beispieltext</p>
        <p className="mt-2">
          Digitalisierung für Unternehmen — barrierefrei und lesbar für alle. Dieser Vorschautext verwendet die gewählten Farben.
        </p>
        <p className="mt-2 text-sm opacity-90">Kleinerer Fließtext zur Kontrollprüfung.</p>
      </div>
    </div>
  );
}
