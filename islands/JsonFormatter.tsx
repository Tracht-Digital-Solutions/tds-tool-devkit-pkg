import { useState } from "react";

interface Result {
  ok: boolean;
  output?: string;
  error?: string;
}

/** Try to point at the offending line/col from a `JSON.parse` "position N" error. */
function locate(input: string, message: string): string {
  const m = /position (\d+)/.exec(message);
  if (!m) return message;
  const pos = Number(m[1]);
  const upto = input.slice(0, pos);
  const line = upto.split("\n").length;
  const col = pos - upto.lastIndexOf("\n");
  return `${message} (Zeile ${line}, Spalte ${col})`;
}

/**
 * JSON formatter / validator / minifier — parse, then re-stringify with the
 * chosen indent (or compact). Errors report an approximate line/column. Fully
 * client-side.
 */
export default function JsonFormatter() {
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState<2 | 4 | 0>(2);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const run = (minify: boolean) => {
    setCopied(false);
    if (!input.trim()) {
      setResult({ ok: false, error: "Bitte JSON eingeben." });
      return;
    }
    try {
      const parsed = JSON.parse(input);
      const output = minify ? JSON.stringify(parsed) : JSON.stringify(parsed, null, indent === 0 ? undefined : indent);
      setResult({ ok: true, output });
    } catch (e) {
      setResult({ ok: false, error: locate(input, e instanceof Error ? e.message : "Ungültiges JSON.") });
    }
  };

  const copy = async () => {
    if (!result?.output) return;
    try {
      await navigator.clipboard.writeText(result.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const area = "w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-paper)] px-3 py-2 font-mono text-sm";

  return (
    <div className="json-tool space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block opacity-80">JSON eingeben</span>
        <textarea className={area} rows={8} value={input} onChange={(e) => setInput(e.target.value)} placeholder='{"hallo": "welt"}' spellcheck={false} />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => run(false)} className="rounded-lg bg-[color:var(--color-primary)] px-4 py-2 text-sm text-[color:var(--color-paper)]">Formatieren</button>
        <button type="button" onClick={() => run(true)} className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm">Minimieren</button>
        <label className="ml-auto flex items-center gap-2 text-sm">
          Einrückung
          <select className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-paper)] px-2 py-1" value={indent} onChange={(e) => setIndent(Number(e.target.value) as 2 | 4 | 0)}>
            <option value={2}>2 Leerzeichen</option>
            <option value={4}>4 Leerzeichen</option>
            <option value={0}>Tab-frei / kompakt</option>
          </select>
        </label>
      </div>

      {result?.ok === false && <p className="status-pill status-pill--danger text-sm">{result.error}</p>}

      {result?.ok && result.output !== undefined && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="status-pill status-pill--success text-sm">Gültiges JSON ✓</span>
            <button type="button" onClick={copy} className="rounded-lg border border-[color:var(--color-border)] px-3 py-1 text-sm">{copied ? "Kopiert ✓" : "Kopieren"}</button>
          </div>
          <pre className="max-h-96 overflow-auto rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-3 font-mono text-sm">{result.output}</pre>
        </div>
      )}
    </div>
  );
}
