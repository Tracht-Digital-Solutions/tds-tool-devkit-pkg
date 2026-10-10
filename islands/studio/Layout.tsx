import type { ReactNode } from "react";
import type { Strings } from "./strings";

/**
 * The studio's frame: a stepper that shows where you are and what is done, a
 * short intro per step, and one two-pane workspace (settings | live preview)
 * that every editing step uses the same way.
 *
 * Built from shared primitives only (`chip`, `btn`); areas are separated by
 * fill (`--color-soft`), never by drawn lines — the site is borderless.
 */

export function Stepper<S extends string>({
  steps,
  current,
  enabled,
  done,
  labels,
  onGo,
  t,
}: {
  steps: readonly S[];
  current: S;
  enabled: (s: S) => boolean;
  done: (s: S) => boolean;
  labels: Record<S, string>;
  onGo: (s: S) => void;
  t: Strings;
}) {
  const index = steps.indexOf(current);
  return (
    <nav aria-label={t.stepsLabel} className="dss-stepper grid gap-2">
      <div className="flex items-center justify-between gap-3 text-xs" style={{ color: "var(--color-muted)" }}>
        <span>{t.layout.progress(index + 1, steps.length)}</span>
        <span className="font-semibold" style={{ color: "var(--color-ink)" }}>
          {labels[current]}
        </span>
      </div>
      {/* Progress as a filled track — a fill, not a rule. */}
      <div aria-hidden="true" style={{ height: 4, background: "var(--color-soft)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${((index + 1) / steps.length) * 100}%`, background: "var(--color-accent)", transition: "width 200ms ease-out" }} />
      </div>
      <ol className="flex gap-2 overflow-x-auto pb-1" style={{ listStyle: "none", margin: 0, padding: 0, scrollbarWidth: "thin" }}>
        {steps.map((s, i) => {
          const isCurrent = s === current;
          const isDone = done(s) && !isCurrent;
          return (
            <li key={s} className="shrink-0">
              <button
                type="button"
                className={isCurrent ? "chip chip-active" : "chip"}
                aria-current={isCurrent ? "step" : undefined}
                disabled={!enabled(s)}
                title={enabled(s) ? undefined : t.lockedStep}
                onClick={() => onGo(s)}
              >
                <span aria-hidden="true" className="mr-1 inline-block text-center" style={{ minWidth: "1.1em", opacity: isCurrent ? 1 : 0.7 }}>
                  {isDone ? "✓" : i + 1}
                </span>
                {labels[s]}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StepIntro({ title, text, aside }: { title: string; text: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid max-w-2xl gap-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          {text}
        </p>
      </div>
      {aside}
    </div>
  );
}

/**
 * Settings left, preview right; the preview stays in view while the settings
 * scroll (`self-start` — a stretched grid item cannot stick). On a phone the
 * preview comes first, so a change is visible without scrolling back up.
 */
export function Workspace({ controls, preview, t }: { controls: ReactNode; preview: ReactNode; t: Strings }) {
  return (
    <div className="dss-workspace grid gap-6 lg:grid-cols-[minmax(20rem,27rem)_minmax(0,1fr)]">
      <section aria-label={t.layout.controls} className="order-2 grid content-start gap-4 lg:order-1">
        {controls}
      </section>
      <section aria-label={t.layout.previewPanel} className="order-1 grid content-start gap-3 self-start lg:sticky lg:top-24 lg:order-2">
        {preview}
      </section>
    </div>
  );
}

/** The bar above a preview frame: view, device and theme in one row. */
export function PreviewToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 p-2" style={{ background: "var(--color-soft)" }}>
      {children}
    </div>
  );
}

/** A labelled, selectable card: content plus a select / selected control. */
export function ChoiceCard({
  title,
  text,
  selected,
  onSelect,
  t,
  children,
  cta,
}: {
  title: string;
  text: string;
  selected: boolean;
  onSelect: () => void;
  t: Strings;
  children?: ReactNode;
  cta?: string;
}) {
  return (
    <article className="grid content-between gap-3 p-4" style={{ background: selected ? "color-mix(in srgb, var(--color-accent) 12%, var(--color-soft))" : "var(--color-soft)" }}>
      <div className="grid gap-2">
        <h3 className="font-semibold">{title}</h3>
        {children}
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          {text}
        </p>
      </div>
      <div>
        <button type="button" className={selected ? "chip chip-active" : "btn btn-ghost"} aria-pressed={selected} onClick={onSelect}>
          {selected ? `✓ ${t.layout.selected}` : (cta ?? t.layout.choose)}
        </button>
      </div>
    </article>
  );
}

/** Previous / next at the end of a step; the next button names its target. */
export function StepFooter({ back, next, backLabel, nextLabel }: { back?: () => void; next?: () => void; backLabel: string; nextLabel?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      {back ? (
        <button type="button" className="btn btn-ghost" onClick={back}>
          ← {backLabel}
        </button>
      ) : (
        <span />
      )}
      {next && nextLabel && (
        <button type="button" className="btn btn-primary" onClick={next}>
          {nextLabel} →
        </button>
      )}
    </div>
  );
}
