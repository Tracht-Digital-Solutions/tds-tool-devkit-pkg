import { useMemo, useState } from "react";
import { auditProject, type CheckStatus, type Finding, type Suggestion } from "../../src/studio/a11y";
import type { ResolvedProject } from "../../src/studio/resolve";
import { copyText, Segmented } from "./controls";
import type { Strings } from "./strings";

type Filter = "problems" | "warn" | "pass" | "manual" | "all";

const PILL: Record<CheckStatus, string> = {
  pass: "status-pill status-pill--ok",
  fail: "status-pill status-pill--danger",
  warn: "status-pill status-pill--warning",
  manual: "status-pill status-pill--muted",
};

export function A11yStep({
  t,
  resolved,
  onApply,
  onShow,
}: {
  t: Strings;
  resolved: ResolvedProject;
  onApply: (s: Suggestion) => void;
  onShow: (themeId: string | undefined) => void;
}) {
  const report = useMemo(() => auditProject(resolved), [resolved]);
  const [filter, setFilter] = useState<Filter>(report.counts.fail > 0 ? "problems" : "all");
  const [themeId, setThemeId] = useState<string>("all");
  const [pending, setPending] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const visible = report.findings.filter((f) => {
    if (themeId !== "all" && f.themeId && f.themeId !== themeId) return false;
    if (filter === "all") return true;
    if (filter === "problems") return f.status === "fail";
    return f.status === filter;
  });

  const apply = (f: Finding) => {
    if (!f.suggestion) return;
    if (f.suggestion.overridesUserChoice && pending !== f.id) {
      setPending(f.id);
      return;
    }
    onApply(f.suggestion);
    setPending(null);
    setApplied(f.id);
  };

  const themeName = (id?: string) => resolved.themes.find((th) => th.def.id === id)?.def.name;

  const markdown = () =>
    [
      `# ${t.a11y.report} — ${resolved.project.name}`,
      "",
      t.a11y.disclaimer,
      "",
      `| ${t.a11y.result} | ${t.a11y.criterion} | ${t.a11y.subject} | ${t.a11y.property} | ${t.a11y.actual} | ${t.a11y.required} | ${t.a11y.suggestion} |`,
      "|---|---|---|---|---|---|---|",
      ...report.findings.map(
        (f) =>
          `| ${t.a11y.status[f.status]} | ${f.criterion} (${f.level}) | ${f.subject}${f.themeId ? ` · ${themeName(f.themeId)}` : ""} | ${f.property} | ${f.actual ?? ""} | ${f.required ?? ""} | ${f.suggestion?.text ?? (f.status === "pass" ? "" : f.message)} |`,
      ),
    ].join("\n");

  return (
    <div className="grid gap-5">
      <p className="tds-alert tds-alert--warning text-sm">{t.a11y.disclaimer}</p>
      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        <span className="chip chip--danger">
          {report.counts.fail} {t.a11y.filters.problems}
        </span>
        <span className="chip chip--warning">
          {report.counts.warn} {t.a11y.filters.warn}
        </span>
        <span className="chip chip--success">
          {report.counts.pass} {t.a11y.filters.pass}
        </span>
        <span className="chip chip--neutral">
          {report.counts.manual} {t.a11y.filters.manual}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label={t.a11y.title} value={filter} options={(["problems", "warn", "pass", "manual", "all"] as const).map((k) => [k, t.a11y.filters[k]])} onChange={setFilter} />
        <Segmented label={t.preview.theme} value={themeId} options={[["all", t.a11y.allThemes] as [string, string], ...resolved.themes.map((th) => [th.def.id, th.def.name] as [string, string])]} onChange={setThemeId} />
      </div>
      {applied && <p className="tds-alert tds-alert--success text-sm">{t.a11y.applied}</p>}
      {visible.length === 0 ? (
        <p className="tds-empty">{t.a11y.none}</p>
      ) : (
        <ul className="grid gap-3">
          {visible.map((f) => (
            <li key={f.id} className="tds-card grid gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={PILL[f.status]}>{t.a11y.status[f.status]}</span>
                <span className="text-sm font-semibold">
                  {f.subject}
                  {f.themeId ? ` · ${themeName(f.themeId)}` : ""}
                </span>
                <span className="text-xs opacity-70">
                  {f.criterion} · {f.level}
                </span>
              </div>
              <p className="text-sm">{f.message}</p>
              {(f.actual || f.required) && (
                <p className="text-xs opacity-80">
                  {f.property}: {t.a11y.actual} {f.actual ?? "–"} · {t.a11y.required} {f.required ?? "–"}
                </p>
              )}
              {f.suggestion && f.status !== "pass" && (
                <div className="grid gap-2">
                  <p className="text-sm">
                    <strong>{t.a11y.suggestion}:</strong> {f.suggestion.text}
                    {f.suggestion.after ? ` (→ ${f.suggestion.after}:1)` : ""}
                  </p>
                  {pending === f.id && <p className="tds-alert tds-alert--warning text-sm">{t.a11y.overrideWarn}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-primary" onClick={() => apply(f)}>
                      {pending === f.id ? t.a11y.applyAnyway : t.a11y.apply}
                    </button>
                    {pending === f.id && (
                      <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
                        {t.a11y.cancel}
                      </button>
                    )}
                    {f.themeId && (
                      <button type="button" className="btn btn-ghost" onClick={() => onShow(f.themeId)}>
                        {t.a11y.show}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="tds-disclosure">
        <summary className="cursor-pointer font-semibold">{t.a11y.report}</summary>
        <div className="mt-3 grid gap-3">
          <div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                setCopied(await copyText(markdown()));
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? t.code.copied : t.a11y.copyReport}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="tds-table text-sm">
              <thead>
                <tr>
                  <th scope="col">{t.a11y.result}</th>
                  <th scope="col">{t.a11y.criterion}</th>
                  <th scope="col">{t.a11y.subject}</th>
                  <th scope="col">{t.a11y.property}</th>
                  <th scope="col">{t.a11y.actual}</th>
                  <th scope="col">{t.a11y.required}</th>
                </tr>
              </thead>
              <tbody>
                {report.findings.map((f) => (
                  <tr key={f.id}>
                    <td>{t.a11y.status[f.status]}</td>
                    <td>
                      {f.criterion} ({f.level})
                    </td>
                    <td>
                      {f.subject}
                      {f.themeId ? ` · ${themeName(f.themeId)}` : ""}
                    </td>
                    <td>{f.property}</td>
                    <td>{f.actual ?? "–"}</td>
                    <td>{f.required ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  );
}
