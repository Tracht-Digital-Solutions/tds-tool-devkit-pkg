import { useEffect, useState } from "react";
import { ApiError, deleteProject, listProjects, loginHref, openProject, requestExport, saveProject, startCheckout, type ProjectSummary } from "../../src/studio/api";
import { FORMAT_DESCRIPTIONS, FORMAT_LABELS } from "../../src/studio/export/adapters";
import { parseProject, type DesignProject } from "../../src/studio/model";
import { EXPORT_FORMATS, mayExport, type ExportFormat, type StudioAccess } from "../../src/studio/policy";
import type { Lang, Strings } from "./strings";

export function PremiumBox({ t, lang, access }: { t: Strings; lang: Lang; access: StudioAccess }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState("#");
  useEffect(() => {
    void loginHref().then(setLogin);
  }, []);
  if (access.entitled) return <p className="tds-alert tds-alert--success text-sm">{t.premium.active}</p>;
  const price = access.priceCents > 0 ? (access.priceCents / 100).toLocaleString(lang === "de" ? "de-DE" : "en-GB", { style: "currency", currency: access.currency || "EUR" }) : null;
  return (
    <div className="grid gap-3 p-4" style={{ background: "var(--color-soft)" }}>
      <p className="flex flex-wrap items-center gap-2 font-semibold">
        <span className="chip chip--warning">{t.premium.title}</span>
      </p>
      <p className="text-sm">{price ? t.premium.pitch(price) : t.premium.pitchNoPrice}</p>
      {!access.authenticated ? (
        <>
          <p className="text-sm opacity-80">{t.premium.loginText}</p>
          <div>
            <a className="btn btn-primary no-underline" href={login}>
              {t.premium.login}
            </a>
          </div>
        </>
      ) : (
        price && (
          <div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  window.location.href = await startCheckout();
                } catch (e) {
                  setError((e as ApiError).status === 0 ? t.premium.checkoutFailed : (e as Error).message || t.premium.checkoutFailed);
                  setBusy(false);
                }
              }}
            >
              {busy ? t.premium.redirecting : t.premium.unlock}
            </button>
          </div>
        )
      )}
      {error && <p className="tds-alert tds-alert--danger text-sm">{error}</p>}
    </div>
  );
}

export function ExportStep({ t, lang, project, access }: { t: Strings; lang: Lang; project: DesignProject; access: StudioAccess }) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (format: ExportFormat) => {
    setBusy(format);
    setError(null);
    try {
      const { blob, filename } = await requestExport(format, project);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      const err = e as ApiError;
      setError(err.code === "premium_required" ? t.exp.premiumRequired : err.code === "disabled" ? t.exp.disabled : t.exp.failed);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm opacity-80">{t.exp.noJs}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {EXPORT_FORMATS.map((f) => {
          const premium = access.formats[f] === "premium";
          const allowed = mayExport(access, f);
          return (
            <li key={f} className="grid content-between gap-3 p-4" style={{ background: "var(--color-soft)" }}>
              <div className="grid gap-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {FORMAT_LABELS[f][lang]}
                  <span className={premium ? "chip chip--warning text-xs" : "chip chip--success text-xs"}>{premium ? t.exp.premium : t.exp.free}</span>
                </p>
                <p className="text-sm opacity-80">{FORMAT_DESCRIPTIONS[f][lang]}</p>
              </div>
              <div>
                <button type="button" className={allowed ? "btn btn-primary" : "btn btn-ghost"} disabled={!allowed || busy !== null} onClick={() => void download(f)}>
                  {busy === f ? t.exp.preparing : allowed ? t.exp.download : t.exp.locked}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="tds-alert tds-alert--danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ProjectsPanel({
  t,
  lang,
  access,
  project,
  projectId,
  dirty,
  onSaved,
  onOpen,
  onNameChange,
}: {
  t: Strings;
  lang: Lang;
  access: StudioAccess;
  project: DesignProject;
  projectId: number | null;
  dirty: boolean;
  onSaved: (id: number) => void;
  onOpen: (project: DesignProject, id: number) => void;
  onNameChange: (name: string) => void;
}) {
  const [items, setItems] = useState<ProjectSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<number | null>(null);

  const refresh = async () => {
    try {
      setItems(await listProjects());
    } catch {
      setItems([]);
    }
  };
  useEffect(() => {
    if (access.entitled) void refresh();
  }, [access.entitled]);

  if (!access.entitled) {
    return (
      <div className="grid gap-3">
        <p className="text-sm">{t.projects.guest}</p>
        <PremiumBox t={t} lang={lang} access={access} />
      </div>
    );
  }

  const save = async (asNew: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await saveProject(project, asNew ? null : projectId);
      onSaved(saved.id);
      setMessage({ tone: "success", text: t.projects.savedOk });
      await refresh();
    } catch (e) {
      setMessage({ tone: "danger", text: (e as Error).message && (e as ApiError).status !== 0 ? (e as Error).message : t.projects.failed });
    } finally {
      setBusy(false);
    }
  };

  const open = async (id: number) => {
    if (dirty && confirmOpen !== id) {
      setConfirmOpen(id);
      return;
    }
    setConfirmOpen(null);
    try {
      const p = await openProject(id);
      const parsed = parseProject(p.data);
      if (!parsed) throw new Error("invalid");
      onOpen(parsed, p.id);
    } catch {
      setMessage({ tone: "danger", text: t.projects.failed });
    }
  };

  const remove = async (id: number) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setConfirmDelete(null);
    try {
      await deleteProject(id);
      await refresh();
    } catch {
      setMessage({ tone: "danger", text: t.projects.failed });
    }
  };

  return (
    <div className="grid gap-4">
      <PremiumBox t={t} lang={lang} access={access} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <label className="grid gap-1 text-sm">
          <span className="opacity-80">{t.projects.name}</span>
          <input className="field-boxed w-full" value={project.name} maxLength={120} onChange={(e) => onNameChange(e.target.value)} />
        </label>
        <button type="button" className="btn btn-primary" disabled={busy || !project.name.trim()} onClick={() => void save(false)}>
          {busy ? t.projects.saving : t.projects.save}
        </button>
        {projectId !== null && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void save(true)}>
            {t.projects.saveNew}
          </button>
        )}
      </div>
      {access.projectLimit > 0 && <p className="text-xs opacity-70">{t.projects.limit(access.projectLimit)}</p>}
      {message && <p className={`tds-alert tds-alert--${message.tone} text-sm`}>{message.text}</p>}
      {items === null ? (
        <p className="text-sm opacity-80">{t.common.loading}</p>
      ) : items.length === 0 ? (
        <p className="tds-empty">{t.projects.empty}</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((p) => (
            <li key={p.id} className="grid gap-2 p-3" style={{ background: "var(--color-soft)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {p.name}
                  {p.id === projectId && <span className="chip chip--info ml-2 text-xs">✓</span>}
                </span>
                <span className="text-xs opacity-70">
                  {t.projects.updated} {new Date(p.updated_at.replace(" ", "T")).toLocaleString(lang === "de" ? "de-DE" : "en-GB")}
                </span>
              </div>
              {confirmOpen === p.id && <p className="tds-alert tds-alert--warning text-sm">{t.projects.openWarn}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => void open(p.id)}>
                  {t.projects.open}
                </button>
                <button type="button" className="btn btn-danger" onClick={() => void remove(p.id)}>
                  {confirmDelete === p.id ? t.projects.deleteConfirm : t.projects.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
