import { useMemo, useState } from "react";
import { colorIn } from "../../src/studio/a11y";
import { FONT_STACKS, COMPONENT_KINDS, VARIANTS, type ComponentKind, type DesignProject, type VariantId } from "../../src/studio/model";
import { HARMONIES, type Harmony } from "../../src/studio/color";
import { resolveProject, type ResolvedProject } from "../../src/studio/resolve";
import { COLOR_ROLES } from "../../src/studio/themes";
import { getPath } from "../../src/studio/model";
import type { Action } from "../../src/studio/state";
import { manualCount } from "../../src/studio/state";
import { ColorInput, Field, NumberInput, Section, SelectInput, Segmented, SourceBadge, TextInput, Toggle } from "./controls";
import { ChoiceCard } from "./Layout";
import { ComponentEditor } from "./ComponentEditor";
import type { Strings } from "./strings";

type Tab = "variants" | "tokens" | "components" | "themes";

type TokenControl =
  | { kind: "color" }
  | { kind: "number"; min: number; max: number; step?: number; unit?: string }
  | { kind: "font" }
  | { kind: "text" }
  | { kind: "bool" }
  | { kind: "select"; options: Array<[string, string]> };

function tokenGroups(t: Strings): Array<[string, Array<[string, TokenControl]>]> {
  return [
    [t.system.groups.colors, [["color.primary", { kind: "color" }], ["color.secondary", { kind: "color" }], ["color.accent", { kind: "color" }], ["color.neutralChroma", { kind: "number", min: 0, max: 0.06, step: 0.002 }]]],
    [
      t.system.groups.typography,
      [
        ["font.body", { kind: "font" }],
        ["font.heading", { kind: "font" }],
        ["font.size", { kind: "number", min: 12, max: 22, unit: "px" }],
        ["font.ratio", { kind: "number", min: 1.067, max: 1.618, step: 0.001 }],
        ["font.lineHeight", { kind: "number", min: 1.1, max: 2, step: 0.05 }],
        ["font.bodyWeight", { kind: "number", min: 300, max: 600, step: 100 }],
        ["font.headingWeight", { kind: "number", min: 300, max: 900, step: 100 }],
        ["font.headingTracking", { kind: "number", min: -0.05, max: 0.15, step: 0.005, unit: "em" }],
        ["font.headingTransform", { kind: "select", options: [["none", "–"], ["uppercase", "ABC"]] }],
      ],
    ],
    [t.system.groups.spacing, [["space.unit", { kind: "number", min: 2, max: 12, step: 1, unit: "px" }]]],
    [
      t.system.groups.radius,
      [
        ["radius.sm", { kind: "number", min: 0, max: 24, unit: "px" }],
        ["radius.md", { kind: "number", min: 0, max: 32, unit: "px" }],
        ["radius.lg", { kind: "number", min: 0, max: 48, unit: "px" }],
        ["radius.button", { kind: "number", min: 0, max: 48, unit: "px" }],
      ],
    ],
    [t.system.groups.border, [["border.width", { kind: "number", min: 1, max: 6, unit: "px" }], ["border.style", { kind: "select", options: ["solid", "dashed", "dotted", "double"].map((s) => [s, s]) }]]],
    [t.system.groups.shadow, [["shadow.sm", { kind: "text" }], ["shadow.md", { kind: "text" }], ["shadow.lg", { kind: "text" }]]],
    [t.system.groups.motion, [["motion.duration", { kind: "number", min: 0, max: 800, step: 10, unit: "ms" }], ["motion.easing", { kind: "text" }]]],
    [
      t.system.groups.layout,
      [
        ["layout.container", { kind: "number", min: 640, max: 1600, step: 10, unit: "px" }],
        ["layout.gutter", { kind: "number", min: 8, max: 64, unit: "px" }],
        ["layout.fluid", { kind: "bool" }],
        ["layout.navBreakpoint", { kind: "number", min: 480, max: 1200, step: 8, unit: "px" }],
      ],
    ],
    [
      t.system.groups.style,
      [
        ["style.hover", { kind: "select", options: (["darken", "lift", "scale", "glow", "underline"] as const).map((h) => [h, h === "underline" ? "underline" : t.presets.hover[h]]) }],
        ["style.shadow", { kind: "select", options: (["none", "soft", "hard"] as const).map((s) => [s, t.system.shadowStyles[s]]) }],
        ["style.buttonCase", { kind: "select", options: [["none", "–"], ["uppercase", "ABC"]] }],
        ["style.buttonTracking", { kind: "number", min: 0, max: 0.2, step: 0.005, unit: "em" }],
        ["style.focus", { kind: "select", options: (["ring", "outline", "dashed"] as const).map((f) => [f, t.system.focusStyles[f]]) }],
      ],
    ],
  ];
}

export function SystemStep({
  t,
  project,
  resolved,
  dispatch,
  mode,
  previewTheme,
}: {
  t: Strings;
  project: DesignProject;
  resolved: ResolvedProject;
  dispatch: (a: Action) => void;
  mode: "simple" | "expert";
  previewTheme: string | null;
}) {
  const [tab, setTab] = useState<Tab>("variants");
  const [kind, setKind] = useState<ComponentKind>("button");
  const [themeId, setThemeId] = useState(project.themes[0]?.id ?? "light");
  const [confirmReset, setConfirmReset] = useState(false);
  const theme = resolved.themes.find((th) => th.def.id === themeId) ?? resolved.themes[0]!;
  const previewThemeObj = resolved.themes.find((th) => th.def.id === previewTheme) ?? resolved.themes[0]!;
  const resolveColor = (v: string) => colorIn(v, previewThemeObj);
  const count = manualCount(project);

  const variantSamples = useMemo(
    () => VARIANTS.map((v) => ({ v, r: resolveProject({ ...project, variant: v }) })),
    // Only geometry/type matter for the swatch; recompute when the project changes.
    [project],
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label={t.steps.system} value={tab} options={(["variants", "tokens", "components", "themes"] as const).map((k) => [k, t.system.tabs[k]])} onChange={setTab} />
        {count > 0 && (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span className="chip chip--info">{t.system.manualCount(count)}</span>
            {confirmReset ? (
              <>
                <span>{t.system.resetConfirm}</span>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    dispatch({ type: "resetManual" });
                    setConfirmReset(false);
                  }}
                >
                  {t.common.yes}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
                  {t.common.no}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(true)}>
                {t.system.resetManual}
              </button>
            )}
          </span>
        )}
      </div>

      {tab === "variants" && (
        <div className="grid gap-4">
          <h3 className="eyebrow">{t.system.variantTitle}</h3>
          <div className="grid gap-3">
            {variantSamples.map(({ v, r }) => {
              const [name, text] = t.system.variants[v]!;
              const tk = r.tokens;
              const light = r.themes[0]!.colors;
              return (
                <ChoiceCard key={v} title={name} text={text} selected={project.variant === v} onSelect={() => dispatch({ type: "variant", variant: v as VariantId })} t={t}>
                  {/* Same seed, this variant: palette, heading face, button shape. */}
                  <span aria-hidden="true" className="flex flex-wrap items-center gap-3">
                    <span className="flex gap-1">
                      {[light.primary, light.secondary, light.accent, light.text, light.surfaceAlt].map((c, i) => (
                        <span key={i} style={{ width: 16, height: 16, borderRadius: 999, background: c, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)" }} />
                      ))}
                    </span>
                    <span style={{ fontFamily: tk.font.heading, fontWeight: tk.font.headingWeight, fontSize: 18, textTransform: tk.font.headingTransform }}>Aa</span>
                    <span
                      className="inline-block px-3 py-1 text-xs"
                      style={{
                        background: light.primary,
                        color: light.onPrimary,
                        borderRadius: tk.radius.button >= 999 ? 999 : tk.radius.button,
                        fontWeight: 600,
                        textTransform: tk.style.buttonCase,
                        letterSpacing: `${tk.style.buttonTracking}em`,
                        boxShadow: tk.shadow.sm === "none" ? undefined : tk.shadow.sm,
                      }}
                    >
                      Button
                    </span>
                  </span>
                </ChoiceCard>
              );
            })}
          </div>
          <Field label={t.system.harmony} tech="hue">
            <Segmented label={t.system.harmony} value={project.harmony} options={HARMONIES.map((h) => [h, t.system.harmonies[h]])} onChange={(h) => dispatch({ type: "harmony", harmony: h as Harmony })} />
          </Field>
        </div>
      )}

      {tab === "tokens" && (
        <div className="grid gap-6">
          {tokenGroups(t).map(([title, items], gi) => (
            <Section key={title} title={title} open={gi === 0}>
              {items.map(([path, control]) => {
                const value = getPath(resolved.tokens, path) as string | number | boolean;
                const source = resolved.tokenSource[path];
                const locked = project.locks.includes(path);
                const label = t.system.tokens[path] ?? path;
                const set = (v: string | number | boolean) => dispatch({ type: "global", path, value: v });
                return (
                  <Field
                    key={path}
                    label={label}
                    tech={path}
                    aside={
                      <span className="flex flex-wrap items-center gap-1">
                        {source !== "derived" && <SourceBadge source={source} t={t} />}
                        <button
                          type="button"
                          className={locked ? "chip chip-active text-xs" : "chip text-xs"}
                          aria-pressed={locked}
                          title={locked ? t.system.unlock : t.system.lock}
                          onClick={() => dispatch(locked ? { type: "unlock", path } : { type: "lock", path, value })}
                        >
                          {locked ? `🔒 ${t.layout.locked}` : t.system.lock}
                        </button>
                        {source === "manual" && (
                          <button type="button" className="chip text-xs" onClick={() => dispatch({ type: "resetGlobal", path })}>
                            ↺ {t.system.reset}
                          </button>
                        )}
                      </span>
                    }
                  >
                    {control.kind === "color" && <ColorInput value={String(value)} label={label} t={t} expert={mode === "expert"} onChange={set} />}
                    {control.kind === "number" && <NumberInput label={label} value={Number(value)} min={control.min} max={control.max} step={control.step} unit={control.unit} onChange={set} />}
                    {control.kind === "text" && <TextInput label={label} value={String(value)} onChange={(v) => v.trim() && set(v)} />}
                    {control.kind === "bool" && <Toggle label={label} checked={value === true} onChange={set} />}
                    {control.kind === "select" && <SelectInput label={label} value={String(value)} options={control.options} onChange={set} />}
                    {control.kind === "font" && (
                      <SelectInput
                        label={label}
                        value={String(value)}
                        options={[
                          ...(Object.values(FONT_STACKS).includes(String(value) as never) ? [] : ([[String(value), String(value).split(",")[0]!.replace(/["']/g, "")]] as Array<[string, string]>)),
                          ...Object.entries(FONT_STACKS).map(([id, stack]) => [stack, t.presets.fonts[id as keyof typeof FONT_STACKS]] as [string, string]),
                        ]}
                        onChange={set}
                      />
                    )}
                  </Field>
                );
              })}
            </Section>
          ))}
        </div>
      )}

      {tab === "components" && (
        <div className="grid gap-4">
          <Field label={t.system.component}>
            <SelectInput label={t.system.component} value={kind} options={COMPONENT_KINDS.map((k) => [k, t.kinds[k]!])} onChange={(k) => setKind(k as ComponentKind)} />
          </Field>
          <p className="text-sm opacity-80">{t.system.overrideHint}</p>
          {project.components[kind] && Object.keys(project.components[kind]!).length > 0 && (
            <div>
              <button type="button" className="btn btn-ghost" onClick={() => dispatch({ type: "resetComponent", kind })}>
                {t.system.resetComponent}
              </button>
            </div>
          )}
          <ComponentEditor
            key={kind}
            style={resolved.components[kind].style}
            t={t}
            mode={mode}
            prefix={project.prefix}
            sources={resolved.components[kind].source}
            resolveColor={resolveColor}
            onReset={(path) => dispatch({ type: "resetComponent", kind, path })}
            onChange={(path, value) => {
              if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") dispatch({ type: "component", kind, path, value });
            }}
            showStates={!["heading", "text", "label"].includes(kind)}
          />
        </div>
      )}

      {tab === "themes" && (
        <ThemesPanel t={t} project={project} resolved={resolved} dispatch={dispatch} themeId={theme.def.id} setThemeId={setThemeId} mode={mode} />
      )}
    </div>
  );
}

function ThemesPanel({
  t,
  project,
  resolved,
  dispatch,
  themeId,
  setThemeId,
  mode,
}: {
  t: Strings;
  project: DesignProject;
  resolved: ResolvedProject;
  dispatch: (a: Action) => void;
  themeId: string;
  setThemeId: (id: string) => void;
  mode: "simple" | "expert";
}) {
  const theme = resolved.themes.find((th) => th.def.id === themeId) ?? resolved.themes[0]!;
  const [name, setName] = useState(t.system.newThemeName);
  const [base, setBase] = useState<"light" | "dark">("light");
  const [contrast, setContrast] = useState<"normal" | "more">("normal");
  return (
    <div className="grid gap-5">
      <Segmented label={t.system.themes} value={theme.def.id} options={project.themes.map((th) => [th.id, th.name])} onChange={setThemeId} />
      <div className="grid gap-4">
        <Field label={t.system.themeName}>
          <TextInput label={t.system.themeName} value={theme.def.name} onChange={(v) => dispatch({ type: "themeUpdate", id: theme.def.id, name: v })} />
        </Field>
        <Field label={t.system.themeBase}>
          <SelectInput label={t.system.themeBase} value={theme.def.base} options={[["light", t.system.light], ["dark", t.system.dark]]} onChange={(v) => dispatch({ type: "themeUpdate", id: theme.def.id, base: v as "light" | "dark" })} />
        </Field>
        <Field label={t.system.contrast}>
          <SelectInput label={t.system.contrast} value={theme.def.contrast} options={[["normal", t.system.contrastNormal], ["more", t.system.contrastMore]]} onChange={(v) => dispatch({ type: "themeUpdate", id: theme.def.id, contrast: v as "normal" | "more" })} />
        </Field>
      </div>
      <p className="text-sm opacity-80">
        <code>data-theme="{theme.def.id}"</code> · {t.system.roleHint}
      </p>
      <Section title={t.system.roles} open>
        {COLOR_ROLES.map((role) => (
          <Field
            key={role}
            label={role}
            tech={`--${project.prefix}-color-${role.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`}
            aside={
              <span className="flex items-center gap-1">
                <SourceBadge source={theme.source[role]} t={t} />
                {theme.source[role] === "manual" && (
                  <button type="button" className="btn btn-ghost px-2 py-0 text-xs" onClick={() => dispatch({ type: "themeRole", id: theme.def.id, role, value: null })}>
                    {t.system.reset}
                  </button>
                )}
              </span>
            }
          >
            <ColorInput value={theme.colors[role]} label={role} t={t} expert={mode === "expert"} onChange={(v) => dispatch({ type: "themeRole", id: theme.def.id, role, value: v })} />
          </Field>
        ))}
      </Section>
      {project.themes.length > 1 && (
        <div>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              dispatch({ type: "themeRemove", id: theme.def.id });
              setThemeId(project.themes.find((th) => th.id !== theme.def.id)!.id);
            }}
          >
            {t.system.removeTheme}
          </button>
        </div>
      )}
      <fieldset className="grid gap-3 p-4" style={{ background: "var(--color-soft)" }}>
        <legend className="eyebrow mb-1">{t.system.addTheme}</legend>
        <Field label={t.system.themeName}>
          <input className="field-boxed w-full" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t.system.themeBase}>
          <SelectInput label={t.system.themeBase} value={base} options={[["light", t.system.light], ["dark", t.system.dark]]} onChange={(v) => setBase(v as "light" | "dark")} />
        </Field>
        <Field label={t.system.contrast}>
          <SelectInput label={t.system.contrast} value={contrast} options={[["normal", t.system.contrastNormal], ["more", t.system.contrastMore]]} onChange={(v) => setContrast(v as "normal" | "more")} />
        </Field>
        <button type="button" className="btn btn-primary" disabled={project.themes.length >= 12} onClick={() => dispatch({ type: "themeAdd", name, base, contrast })}>
          {t.system.addTheme}
        </button>
      </fieldset>
    </div>
  );
}
