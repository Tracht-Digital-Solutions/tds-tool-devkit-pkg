import { useMemo, useState } from "react";
import { analyzeUrl, ApiError } from "../../src/studio/api";
import { emitCss, sanitizeCss } from "../../src/studio/css";
import { analyzePage, importCss, importHtmlComponent, importTokensJson, type ImportResult, type PageAnalysis } from "../../src/studio/importer";
import { SEED_KINDS, VARIANTS, type DesignProject, type SeedKind, type VariantId } from "../../src/studio/model";
import { previewBody } from "../../src/studio/previews";
import { resolveProject } from "../../src/studio/resolve";
import { Field, Segmented } from "./controls";
import { PreviewFrame } from "./PreviewFrame";
import type { Lang, Strings } from "./strings";

type ImportKind = "css" | "html" | "json";
const MAX_FILE = 1_000_000;

export function StartStep({
  t,
  lang,
  analysisEnabled,
  onDesign,
  onLoaded,
}: {
  t: Strings;
  lang: Lang;
  analysisEnabled: boolean;
  onDesign: (kind: SeedKind) => void;
  onLoaded: (project: DesignProject, next: "component" | "system") => void;
}) {
  const [path, setPath] = useState<"a" | "b" | "c" | null>(null);
  const [kind, setKind] = useState<SeedKind>("button");

  const card = (id: "a" | "b" | "c", title: string, text: string) => (
    <button type="button" className={`btn ${path === id ? "btn-primary" : "btn-ghost"} dss-entry h-auto w-full flex-col items-start gap-1 whitespace-normal p-4 text-left`} aria-pressed={path === id} onClick={() => setPath(id)}>
      <span className="font-semibold">{title}</span>
      <span className="text-sm font-normal opacity-80">{text}</span>
    </button>
  );

  return (
    <div className="grid gap-6">
      <h2 className="text-xl font-semibold">{t.start.title}</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {card("a", t.start.a, t.start.aText)}
        {card("b", t.start.b, t.start.bText)}
        {card("c", t.start.c, t.start.cText)}
      </div>

      {path === "a" && (
        <div className="grid gap-4">
          <Segmented label={t.wizard.kind} value={kind} options={SEED_KINDS.map((k) => [k, t.start.kinds[k]])} onChange={setKind} />
          <div>
            <button type="button" className="btn btn-primary" onClick={() => onDesign(kind)}>
              {t.start.aGo}
            </button>
          </div>
        </div>
      )}
      {path === "b" && <ImportPanel t={t} onLoaded={onLoaded} />}
      {path === "c" && (analysisEnabled ? <UrlPanel t={t} lang={lang} onLoaded={onLoaded} /> : <p className="tds-alert tds-alert--warning">{t.url.disabled}</p>)}
    </div>
  );
}

function ImportPanel({ t, onLoaded }: { t: Strings; onLoaded: (p: DesignProject, next: "component" | "system") => void }) {
  const [kind, setKind] = useState<ImportKind>("css");
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (source = text) => {
    setError(null);
    if (!source.trim()) {
      setError(t.imp.empty);
      return;
    }
    setResult(kind === "css" ? importCss(source) : kind === "html" ? importHtmlComponent(source) : importTokensJson(source));
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE) {
      setError(t.imp.fileTooBig);
      return;
    }
    const content = await file.text();
    const detected: ImportKind = /\.json$/i.test(file.name) ? "json" : /\.html?$/i.test(file.name) ? "html" : "css";
    setKind(detected);
    setText(content);
    setResult(detected === "css" ? importCss(content) : detected === "html" ? importHtmlComponent(content) : importTokensJson(content));
  };

  const placeholder = kind === "css" ? t.imp.placeholderCss : kind === "html" ? t.imp.placeholderHtml : t.imp.placeholderJson;
  const isProject = result?.notes.includes("Studio-Projekt geladen.");

  return (
    <div className="grid gap-4">
      <Segmented
        label={t.start.b}
        value={kind}
        options={(["css", "html", "json"] as const).map((k) => [k, t.imp.tabs[k]])}
        onChange={(k) => {
          setKind(k);
          setResult(null);
        }}
      />
      <Field label={t.imp.paste}>
        <textarea className="field-boxed min-h-48 w-full font-mono text-sm" spellCheck={false} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Field label={t.imp.file}>
        <input type="file" accept=".css,.html,.htm,.json,text/css,text/html,application/json" onChange={(e) => void onFile(e.target.files?.[0])} />
      </Field>
      <div>
        <button type="button" className="btn btn-primary" onClick={() => run()}>
          {t.imp.run}
        </button>
      </div>
      {error && <p className="tds-alert tds-alert--danger">{error}</p>}
      {result && (
        <div className="tds-appear grid gap-4">
          {result.issues.length > 0 && (
            <div className="tds-alert tds-alert--warning">
              <p className="font-semibold">{t.imp.issues}</p>
              <ul className="list-disc pl-5">
                {result.issues.slice(0, 12).map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          )}
          {result.notes.length > 0 && (
            <div>
              <p className="eyebrow mb-1">{t.imp.notes}</p>
              <ul className="list-disc pl-5 text-sm">
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {result.project.imported && result.project.imported.values.length > 0 && (
            <div>
              <p className="eyebrow mb-1">{t.imp.found}</p>
              <ul className="grid gap-1 text-sm">
                {result.project.imported.values.map((v) => (
                  <li key={v.path} className="flex flex-wrap items-center gap-2">
                    <code>{v.path}</code>
                    <span>{String(v.value)}</span>
                    <span className="chip chip--neutral text-xs">{t.url.conf[v.confidence]}</span>
                    <span className="text-xs opacity-70">{v.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.project.imported && result.project.imported.unmapped.length > 0 && (
            <details className="tds-disclosure">
              <summary className="cursor-pointer text-sm font-semibold">
                {t.imp.unmapped} ({result.project.imported.unmapped.length})
              </summary>
              <ul className="mt-2 grid gap-1 font-mono text-xs">
                {result.project.imported.unmapped.slice(0, 80).map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </details>
          )}
          {result.referenceHtml && (
            <div>
              <p className="eyebrow mb-1">{t.imp.reference}</p>
              <PreviewFrame
                css={sanitizeCss(result.project.imported?.preservedCss ?? "")}
                body={`<div style="padding:24px">${result.referenceHtml}</div>`}
                prefix="ref"
                theme={null}
                device="phone"
                lang="de"
                title={t.imp.reference}
                height={220}
              />
            </div>
          )}
          <div>
            <button type="button" className="btn btn-primary" onClick={() => onLoaded(result.project, isProject ? "system" : "component")}>
              {t.imp.open}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UrlPanel({ t, lang, onLoaded }: { t: Strings; lang: Lang; onLoaded: (p: DesignProject, next: "component" | "system") => void }) {
  const [url, setUrl] = useState("https://");
  const [mode, setMode] = useState<"faithful" | "creative">("faithful");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; location?: string } | null>(null);
  const [analysis, setAnalysis] = useState<PageAnalysis | null>(null);
  const [pick, setPick] = useState<VariantId>("original");

  const run = async () => {
    setError(null);
    setAnalysis(null);
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      setError({ text: t.url.errors.invalid_url! });
      return;
    }
    if (parsed.protocol !== "https:") {
      setError({ text: t.url.httpsOnly });
      return;
    }
    setBusy(true);
    try {
      const page = await analyzeUrl(parsed.toString());
      const result = analyzePage(page);
      setAnalysis(result);
      setPick(mode === "faithful" ? "original" : "modern");
    } catch (e) {
      const err = e as ApiError;
      const code = err.status === 0 ? "network" : (err.code ?? "fetch_failed");
      const loc = code === "redirect" ? /https:\/\/\S+/.exec(err.message)?.[0] : undefined;
      setError({ text: t.url.errors[code] ?? t.url.errors.fetch_failed!, location: loc });
    } finally {
      setBusy(false);
    }
  };

  const variants: VariantId[] = mode === "faithful" ? ["original", "modern", "minimal", "elegant"] : ["modern", "minimal", "elegant", "playful", "technical", "original"];
  const previews = useMemo(() => {
    if (!analysis) return [];
    return variants.map((v) => {
      const project = { ...analysis.project, variant: v };
      return { v, project, css: emitCss(resolveProject(project)) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, mode]);

  return (
    <div className="grid gap-4">
      <Field label={t.url.label}>
        <input className="field-boxed w-full" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.beispiel.de/" />
      </Field>
      <p className="text-sm opacity-80">{t.url.hint}</p>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm opacity-80">{t.url.mode}</legend>
        <Segmented
          label={t.url.mode}
          value={mode}
          options={[
            ["faithful", t.url.faithful],
            ["creative", t.url.creative],
          ]}
          onChange={setMode}
        />
        <p className="text-sm opacity-80">{mode === "faithful" ? t.url.faithfulText : t.url.creativeText}</p>
      </fieldset>
      <div>
        <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={busy}>
          {busy ? t.url.running : t.url.run}
        </button>
      </div>
      {error && (
        <p className="tds-alert tds-alert--danger" role="alert">
          {error.text}
          {error.location && (
            <>
              {" "}
              <button type="button" className="btn btn-ghost px-2 py-0" onClick={() => setUrl(error.location!)}>
                {error.location}
              </button>
            </>
          )}
        </p>
      )}
      {analysis && (
        <div className="tds-appear grid gap-5">
          <p className="text-sm opacity-80">{t.url.noContent}</p>
          <div>
            <p className="eyebrow mb-2">{t.url.reference}</p>
            <div className="overflow-x-auto">
              <table className="tds-table text-sm">
                <thead>
                  <tr>
                    <th scope="col"></th>
                    <th scope="col">{t.url.value}</th>
                    <th scope="col">{t.url.confidence}</th>
                    <th scope="col">{t.url.source}</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.reference.map((e) => (
                    <tr key={e.label}>
                      <th scope="row">{e.label}</th>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          {/^#[0-9a-f]{3,8}$/i.test(e.value) && <span aria-hidden="true" className="inline-block h-4 w-4 rounded-full" style={{ background: e.value }} />}
                          <span className={e.confidence === "none" ? "opacity-60" : ""}>{e.value}</span>
                        </span>
                      </td>
                      <td>
                        <span className={e.confidence === "none" ? "chip chip--warning text-xs" : e.confidence === "high" ? "chip chip--success text-xs" : "chip chip--neutral text-xs"}>{t.url.conf[e.confidence]}</span>
                      </td>
                      <td className="text-xs opacity-70">{e.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {analysis.notes.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {analysis.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <div>
            <p className="eyebrow mb-2">{t.url.compare}</p>
            <div className="grid gap-4 md:grid-cols-2">
              {previews.map(({ v, css }) => (
                <div key={v} className="grid gap-2">
                  <button type="button" className={pick === v ? "chip chip-active justify-self-start" : "chip justify-self-start"} aria-pressed={pick === v} onClick={() => setPick(v)}>
                    {v === "original" ? (mode === "faithful" ? t.url.faithful : t.system.variants.original![0]) : t.system.variants[v]![0]}
                  </button>
                  <PreviewFrame css={css} body={previewBody(analysis.project.prefix, "landing", lang)} prefix={analysis.project.prefix} theme="light" device="desktop" lang={lang} title={`${t.preview.frameTitle}: ${v}`} height={340} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <button type="button" className="btn btn-primary" onClick={() => onLoaded({ ...analysis.project, variant: VARIANTS.includes(pick) ? pick : "original" }, "system")}>
              {t.url.choose}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
