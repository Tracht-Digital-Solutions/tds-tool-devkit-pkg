import { useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { getAccess } from "../../src/studio/api";
import { emitCss } from "../../src/studio/css";
import { newProject, type DesignProject, type SeedKind } from "../../src/studio/model";
import { mayExport, offlineAccess, type StudioAccess } from "../../src/studio/policy";
import { previewBody, seedBody, PREVIEW_VIEWS, type Device, type PreviewView } from "../../src/studio/previews";
import { resolveProject } from "../../src/studio/resolve";
import { reduce } from "../../src/studio/state";
import { A11yStep } from "./A11yStep";
import { CodeStep } from "./CodeStep";
import { ComponentEditor } from "./ComponentEditor";
import { Segmented, SelectInput } from "./controls";
import { PreviewToolbar, StepFooter, StepIntro, Stepper, Workspace } from "./Layout";
import { ExportStep, ProjectsPanel } from "./ExportStep";
import { PreviewFrame } from "./PreviewFrame";
import { StartStep } from "./StartStep";
import { STRINGS, type Lang } from "./strings";
import { SystemStep } from "./SystemStep";
import { Alert } from "@tracht-digital-solutions/tds-shared/alert";

const STEPS = ["start", "component", "system", "preview", "code", "a11y", "export"] as const;
type Step = (typeof STEPS)[number];

/**
 * Designsystem-Studio: design one component, derive a complete design system
 * by rule, refine it, check it, export it.
 *
 * Nothing here persists on its own. The project lives in memory; Premium users
 * save it server-side through `tds-ext-tools-pkg`. There is deliberately no
 * localStorage/IndexedDB copy — a guest's work ends with the tab, and the page
 * warns before that happens.
 */
export default function Studio({ lang = "de" as Lang }: { lang?: Lang }) {
  const t = STRINGS[lang];
  const [project, dispatch] = useReducer(reduce, undefined, () => newProject("button"));
  const [step, setStep] = useState<Step>("start");
  const [generated, setGenerated] = useState(false);
  const [mode, setMode] = useState<"simple" | "expert">("simple");
  const [view, setView] = useState<PreviewView>("components");
  const [device, setDevice] = useState<Device>("desktop");
  const [previewTheme, setPreviewTheme] = useState<string>("light");
  const [access, setAccess] = useState<StudioAccess>(offlineAccess());
  const [projectId, setProjectId] = useState<number | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const top = useRef<HTMLDivElement | null>(null);

  const resolved = useMemo(() => resolveProject(project), [project]);
  // The preview may lag a frame behind fast slider drags; the controls never do.
  const deferred = useDeferredValue(resolved);
  const previewCss = useMemo(() => emitCss(deferred, { simulateStates: true }), [deferred]);
  const serialized = useMemo(() => JSON.stringify(project), [project]);
  // The wizard shows the seed exactly as designed, whatever variant is chosen.
  const deferredProject = useDeferredValue(project);
  const seedCss = useMemo(() => emitCss(resolveProject({ ...deferredProject, variant: "original" }), { simulateStates: true }), [deferredProject]);
  const dirty = touched && serialized !== savedSnapshot;

  useEffect(() => {
    void getAccess().then(setAccess);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = t.leaveWarning;
      return t.leaveWarning;
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, t.leaveWarning]);

  useEffect(() => {
    if (!project.themes.some((th) => th.id === previewTheme)) setPreviewTheme(project.themes[0]?.id ?? "light");
  }, [project.themes, previewTheme]);

  const act = (a: Parameters<typeof dispatch>[0]) => {
    setTouched(true);
    dispatch(a);
  };

  const go = (s: Step) => {
    setStep(s);
    if (typeof top.current?.scrollIntoView === "function") top.current.scrollIntoView({ block: "start", behavior: "auto" });
  };

  const load = (p: DesignProject, next: Step) => {
    dispatch({ type: "load", project: p });
    setTouched(true);
    if (next !== "component") setGenerated(true);
    go(next);
  };

  const themeForFrame = previewTheme === "auto" ? null : previewTheme;
  const themeOptions: Array<[string, string]> = [["auto", t.preview.auto], ...project.themes.map((th) => [th.id, th.name] as [string, string])];
  const stepEnabled = (s: Step) => s === "start" || s === "component" || generated;
  const stepIndex = STEPS.indexOf(step);
  const nextStep = STEPS[stepIndex + 1];
  const prevStep = STEPS[stepIndex - 1];
  const [introTitle, introText] = t.layout.intro[step]!;

  const themeSelect = (
    <div className="min-w-36">
      <SelectInput label={t.preview.theme} value={previewTheme} options={themeOptions} onChange={setPreviewTheme} />
    </div>
  );

  const fullToolbar = (
    <PreviewToolbar>
      <Segmented label={t.preview.view} value={view} options={PREVIEW_VIEWS.map((v) => [v, t.preview.views[v]])} onChange={setView} />
      <Segmented label={t.preview.device} value={device} options={(["desktop", "tablet", "phone"] as const).map((d) => [d, t.preview.devices[d]])} onChange={setDevice} />
      {themeSelect}
    </PreviewToolbar>
  );

  const note = (
    <p className="text-xs" style={{ color: "var(--color-muted)" }}>
      {t.preview.note}
    </p>
  );

  const modeToggle = (
    <Segmented
      label={t.wizard.mode}
      value={mode}
      options={[
        ["simple", t.wizard.simple],
        ["expert", t.wizard.expert],
      ]}
      onChange={setMode}
    />
  );

  // Save state, said once, in the header — not repeated on every step.
  const status = !touched ? null : access.entitled ? (
    <span className={dirty ? "chip chip--warning" : "chip chip--success"}>{dirty ? t.unsaved : t.saved}</span>
  ) : (
    <span className="chip chip--neutral" title={t.guestNote}>
      {t.layout.notSaved}
    </span>
  );

  return (
    <div ref={top} className="dss grid gap-6" style={{ scrollMarginTop: "6rem" }}>
      <header className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{project.name}</span>
            {status}
          </p>
          {(step === "component" || step === "system") && modeToggle}
        </div>
        <Stepper steps={STEPS} current={step} enabled={stepEnabled} done={(s) => STEPS.indexOf(s) < stepIndex} labels={t.steps} onGo={go} t={t} />
      </header>

      {!access.enabled && <Alert tone="warning">{t.exp.disabled}</Alert>}

      <StepIntro title={introTitle} text={introText} />

      {step === "start" && (
        <StartStep
          t={t}
          lang={lang}
          analysisEnabled={access.analysisEnabled}
          onDesign={(kind: SeedKind) => {
            act({ type: "seedKind", kind });
            go("component");
          }}
          onLoaded={(p, next) => load(p, next)}
        />
      )}

      {step === "component" && (
        <Workspace
          t={t}
          controls={
            <>
              <Segmented label={t.wizard.kind} value={project.seed.kind} options={(["button", "card", "input", "link"] as const).map((k) => [k, t.start.kinds[k]])} onChange={(k) => act({ type: "seedKind", kind: k })} />
              <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                {t.wizard.kindChangeWarn}
              </p>
              <ComponentEditor style={project.seed.style} t={t} mode={mode} onChange={(path, value) => act({ type: "seed", path, value })} />
              {generated && (
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                  {t.wizard.regenerateNote}
                </p>
              )}
            </>
          }
          preview={
            <>
              <PreviewToolbar>{themeSelect}</PreviewToolbar>
              <PreviewFrame css={seedCss} body={seedBody(project.prefix, project.seed.kind, lang)} prefix={project.prefix} theme={themeForFrame} device="fit" lang={lang} title={t.preview.frameTitle} height={380} />
              {note}
            </>
          }
        />
      )}

      {step === "system" && (
        <Workspace
          t={t}
          controls={<SystemStep t={t} project={project} resolved={resolved} dispatch={act} mode={mode} previewTheme={themeForFrame} />}
          preview={
            <>
              {fullToolbar}
              <PreviewFrame css={previewCss} body={previewBody(project.prefix, view, lang)} prefix={project.prefix} theme={themeForFrame} device={device} lang={lang} title={t.preview.frameTitle} height={640} />
              {note}
            </>
          }
        />
      )}

      {step === "preview" && (
        <div className="grid gap-3">
          {fullToolbar}
          <PreviewFrame css={previewCss} body={previewBody(project.prefix, view, lang)} prefix={project.prefix} theme={themeForFrame} device={device} lang={lang} title={t.preview.frameTitle} height={820} />
          {note}
        </div>
      )}

      {step === "code" && <CodeStep t={t} resolved={resolved} customCss={project.customCss} onCustomCss={(css) => act({ type: "customCss", css })} canCopy={mayExport(access, "css")} />}

      {step === "a11y" && (
        <A11yStep
          t={t}
          resolved={resolved}
          onApply={(s) => act({ type: "suggestion", suggestion: s })}
          onShow={(themeId) => {
            if (themeId) setPreviewTheme(themeId);
            setView("components");
            go("preview");
          }}
        />
      )}

      {step === "export" && (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section className="grid content-start gap-3">
            <h3 className="eyebrow">{t.exp.title}</h3>
            <ExportStep t={t} lang={lang} project={project} access={access} />
          </section>
          <section className="grid content-start gap-3">
            <h3 className="eyebrow">{t.projects.title}</h3>
            <ProjectsPanel
              t={t}
              lang={lang}
              access={access}
              project={project}
              projectId={projectId}
              dirty={dirty}
              onNameChange={(name) => act({ type: "name", name })}
              onSaved={(id) => {
                setProjectId(id);
                setSavedSnapshot(serialized);
              }}
              onOpen={(p, id) => {
                dispatch({ type: "load", project: p });
                setProjectId(id);
                setSavedSnapshot(JSON.stringify(p));
                setTouched(true);
                setGenerated(true);
                go("system");
              }}
            />
          </section>
        </div>
      )}

      {step !== "start" && (
        <StepFooter
          back={prevStep ? () => go(prevStep) : undefined}
          backLabel={prevStep ? t.steps[prevStep] : t.common.back}
          next={
            step === "component"
              ? () => {
                  setGenerated(true);
                  setTouched(true);
                  go("system");
                }
              : nextStep && stepEnabled(nextStep)
                ? () => go(nextStep)
                : undefined
          }
          nextLabel={step === "component" ? t.wizard.generate : nextStep ? t.layout.next(t.steps[nextStep]) : undefined}
        />
      )}
    </div>
  );
}
