import { useState } from "react";
import { FONT_STACKS, BORDER_STYLES, ANIMATIONS, type ComponentStyle, type StateStyle } from "../../src/studio/model";
import { parseShadow } from "../../src/studio/tokens";
import { parseColor, shiftLightness } from "../../src/studio/color";
import { ColorInput, Field, NumberInput, Section, Segmented, SelectInput, SourceBadge, TextInput, Toggle } from "./controls";
import type { Strings } from "./strings";

type Mode = "simple" | "expert";
type Change = (path: string, value: unknown) => void;

const SIDES = ["top", "right", "bottom", "left"] as const;
const CORNERS = ["tl", "tr", "br", "bl"] as const;

const SHADOW_PRESETS: Record<"none" | "soft" | "medium" | "hard", string> = {
  none: "none",
  soft: "0 1px 3px rgba(15, 23, 42, 0.12)",
  medium: "0 6px 18px rgba(15, 23, 42, 0.14)",
  hard: "4px 4px 0 rgba(15, 23, 42, 0.9)",
};

const fontOptions = (t: Strings, current: string): Array<[string, string]> => {
  const known = Object.entries(FONT_STACKS).map(([id, stack]) => [stack, t.presets.fonts[id as keyof typeof FONT_STACKS]] as [string, string]);
  return known.some(([s]) => s === current) ? known : [[current, current.split(",")[0]!.replace(/["']/g, "")], ...known];
};

/** Detects which hover preset a state set corresponds to (for the simple mode chips). */
function hoverPreset(h: StateStyle): "none" | "darken" | "lift" | "scale" | "glow" {
  if ((h.translateY ?? 0) < 0) return "lift";
  if ((h.scale ?? 1) > 1) return "scale";
  if (h.shadow && h.shadow !== "none" && h.shadow.includes("0 0 0")) return "glow";
  if (h.background) return "darken";
  return "none";
}

/**
 * Edits one {@link ComponentStyle}. Used for the seed (the wizard) and for
 * per-component overrides in the system view; `sources` marks values the user
 * set there and `onReset` takes them back.
 */
export function ComponentEditor({
  style,
  onChange,
  t,
  mode,
  prefix,
  sources,
  onReset,
  resolveColor,
  showStates = true,
}: {
  style: ComponentStyle;
  onChange: Change;
  t: Strings;
  mode: Mode;
  prefix?: string;
  sources?: Record<string, string>;
  onReset?: (path: string) => void;
  resolveColor?: (v: string) => string | null;
  showStates?: boolean;
}) {
  const expert = mode === "expert";
  const [perSide, setPerSide] = useState(false);
  const [perCorner, setPerCorner] = useState(false);
  const [state, setState] = useState<"hover" | "focus" | "active" | "disabled">("hover");
  const st = style.states[state];

  const marker = (path: string) => {
    const s = sources && Object.keys(sources).find((k) => k === path || k.startsWith(`${path}.`)) ? sources[Object.keys(sources).find((k) => k === path || k.startsWith(`${path}.`))!] : undefined;
    if (!s || s === "generated") return undefined;
    return (
      <span className="flex items-center gap-1">
        <SourceBadge source={s} t={t} />
        {s === "manual" && onReset && (
          <button type="button" className="btn btn-ghost px-2 py-0 text-xs" onClick={() => onReset(path)}>
            {t.system.reset}
          </button>
        )}
      </span>
    );
  };

  const color = (path: string, label: string, tech: string, value: string) => (
    <Field label={label} tech={tech} aside={marker(path)}>
      <ColorInput value={value} label={label} t={t} expert={expert} prefix={prefix} resolve={resolveColor} onChange={(v) => onChange(path, v)} />
    </Field>
  );

  const uniformBorder = Math.max(...SIDES.map((s) => style.borderWidth[s]));
  const uniformRadius = style.radius.tl;
  const shadow = parseShadow(style.shadow);

  return (
    <div className="dss-editor grid gap-1">
      <Section title={t.g.colors} open>
        {color("background", t.f.background, "background", style.background)}
        <Toggle
          label={t.f.gradient}
          checked={!!style.gradientTo}
          onChange={(on) => onChange("gradientTo", on ? (style.background.startsWith("var(") ? style.background : "#7c3aed") : "")}
        />
        {style.gradientTo && color("gradientTo", t.f.gradientTo, "linear-gradient", style.gradientTo)}
        {style.gradientTo && expert && (
          <Field label={t.f.gradientAngle} tech="deg">
            <NumberInput label={t.f.gradientAngle} value={style.gradientAngle} min={0} max={360} unit="°" onChange={(v) => onChange("gradientAngle", v)} />
          </Field>
        )}
        {color("color", t.f.color, "color", style.color)}
        {expert && (
          <Field label={t.f.opacity} tech="opacity" aside={marker("opacity")}>
            <NumberInput label={t.f.opacity} value={Math.round(style.opacity * 100)} min={0} max={100} unit="%" onChange={(v) => onChange("opacity", v / 100)} />
          </Field>
        )}
      </Section>

      <Section title={t.g.type}>
        <Field label={t.f.fontFamily} tech="font-family" aside={marker("fontFamily")}>
          <SelectInput label={t.f.fontFamily} value={style.fontFamily} options={fontOptions(t, style.fontFamily)} onChange={(v) => onChange("fontFamily", v)} />
        </Field>
        {expert && (
          <Field label={t.f.customFont} tech="font-family">
            <TextInput label={t.f.customFont} value={style.fontFamily} onChange={(v) => v.trim() && onChange("fontFamily", v)} />
          </Field>
        )}
        <Field label={t.f.fontSize} tech="font-size" aside={marker("fontSize")}>
          <NumberInput label={t.f.fontSize} value={style.fontSize} min={10} max={72} unit="px" onChange={(v) => onChange("fontSize", v)} />
        </Field>
        <Field label={t.f.fontWeight} tech="font-weight" aside={marker("fontWeight")}>
          <SelectInput
            label={t.f.fontWeight}
            value={String(style.fontWeight)}
            options={[300, 400, 500, 600, 700, 800, 900].map((w) => [String(w), `${w} · ${t.presets.weight[w]}`])}
            onChange={(v) => onChange("fontWeight", Number(v))}
          />
        </Field>
        {expert && (
          <Field label={t.f.lineHeight} tech="line-height" aside={marker("lineHeight")}>
            <NumberInput label={t.f.lineHeight} value={style.lineHeight} min={0.8} max={2.4} step={0.05} onChange={(v) => onChange("lineHeight", v)} />
          </Field>
        )}
        <Field label={t.f.letterSpacing} tech="letter-spacing" aside={marker("letterSpacing")}>
          <NumberInput label={t.f.letterSpacing} value={style.letterSpacing} min={-0.05} max={0.3} step={0.005} unit="em" onChange={(v) => onChange("letterSpacing", v)} />
        </Field>
        <Field label={t.f.textTransform} tech="text-transform" aside={marker("textTransform")}>
          <Segmented label={t.f.textTransform} value={style.textTransform} options={(["none", "uppercase", "lowercase", "capitalize"] as const).map((v) => [v, t.presets.transform[v]])} onChange={(v) => onChange("textTransform", v)} />
        </Field>
        {expert && (
          <Field label={t.f.textAlign} tech="text-align">
            <Segmented label={t.f.textAlign} value={style.textAlign} options={(["left", "center", "right"] as const).map((v) => [v, t.presets.align[v]])} onChange={(v) => onChange("textAlign", v)} />
          </Field>
        )}
      </Section>

      <Section title={t.g.border}>
        <Toggle
          label={t.f.borderOn}
          checked={uniformBorder > 0 && style.borderStyle !== "none"}
          onChange={(on) => {
            for (const s of SIDES) onChange(`borderWidth.${s}`, on ? 1 : 0);
            if (on && style.borderStyle === "none") onChange("borderStyle", "solid");
          }}
        />
        {uniformBorder > 0 && (
          <>
            {expert && <Toggle label={t.f.perSide} checked={perSide} onChange={setPerSide} />}
            {perSide && expert ? (
              SIDES.map((s) => (
                <div key={s} className="grid gap-2">
                  <Field label={`${t.f.borderWidth} (${t.f[s]})`} tech={`border-${s}-width`} aside={marker(`borderWidth.${s}`)}>
                    <NumberInput label={`${t.f.borderWidth} ${t.f[s]}`} value={style.borderWidth[s]} min={0} max={12} unit="px" onChange={(v) => onChange(`borderWidth.${s}`, v)} />
                  </Field>
                  {color(`borderColor.${s}`, `${t.f.borderColor} (${t.f[s]})`, `border-${s}-color`, style.borderColor[s])}
                </div>
              ))
            ) : (
              <>
                <Field label={t.f.borderWidth} tech="border-width" aside={marker("borderWidth")}>
                  <NumberInput label={t.f.borderWidth} value={uniformBorder} min={0} max={12} unit="px" onChange={(v) => SIDES.forEach((s) => onChange(`borderWidth.${s}`, v))} />
                </Field>
                <Field label={t.f.borderColor} tech="border-color" aside={marker("borderColor")}>
                  <ColorInput value={style.borderColor.top} label={t.f.borderColor} t={t} expert={expert} prefix={prefix} resolve={resolveColor} onChange={(v) => SIDES.forEach((s) => onChange(`borderColor.${s}`, v))} />
                </Field>
              </>
            )}
            <Field label={t.f.borderStyle} tech="border-style" aside={marker("borderStyle")}>
              <SelectInput label={t.f.borderStyle} value={style.borderStyle} options={BORDER_STYLES.map((b) => [b, b])} onChange={(v) => onChange("borderStyle", v)} />
            </Field>
          </>
        )}
        <Field label={t.f.radius} tech="border-radius" aside={marker("radius")}>
          <Segmented
            label={t.f.radius}
            value={uniformRadius >= 999 ? 999 : uniformRadius === 0 ? 0 : uniformRadius <= 4 ? 4 : uniformRadius <= 14 ? 12 : -1}
            options={[
              [0, t.presets.radius.square],
              [4, t.presets.radius.slight],
              [12, t.presets.radius.round],
              [999, t.presets.radius.pill],
            ]}
            onChange={(v) => CORNERS.forEach((c) => onChange(`radius.${c}`, v))}
          />
          {!perCorner && <NumberInput label={t.f.radius} value={Math.min(uniformRadius, 64)} min={0} max={64} unit="px" onChange={(v) => CORNERS.forEach((c) => onChange(`radius.${c}`, v))} />}
        </Field>
        {expert && <Toggle label={t.f.perCorner} checked={perCorner} onChange={setPerCorner} />}
        {expert &&
          perCorner &&
          CORNERS.map((c) => (
            <Field key={c} label={`${t.f.radius} (${t.f[c]})`} tech={`border-${c === "tl" ? "top-left" : c === "tr" ? "top-right" : c === "br" ? "bottom-right" : "bottom-left"}-radius`}>
              <NumberInput label={`${t.f.radius} ${t.f[c]}`} value={Math.min(style.radius[c], 64)} min={0} max={64} unit="px" onChange={(v) => onChange(`radius.${c}`, v)} />
            </Field>
          ))}
      </Section>

      <Section title={t.g.spacing}>
        {expert ? (
          SIDES.map((s) => (
            <Field key={s} label={`${t.f.padding} (${t.f[s]})`} tech={`padding-${s}`} aside={marker(`padding.${s}`)}>
              <NumberInput label={`${t.f.padding} ${t.f[s]}`} value={style.padding[s]} min={0} max={64} unit="px" onChange={(v) => onChange(`padding.${s}`, v)} />
            </Field>
          ))
        ) : (
          <>
            <Field label={t.f.paddingY} tech="padding-block" aside={marker("padding")}>
              <NumberInput
                label={t.f.paddingY}
                value={style.padding.top}
                min={0}
                max={48}
                unit="px"
                onChange={(v) => {
                  onChange("padding.top", v);
                  onChange("padding.bottom", v);
                }}
              />
            </Field>
            <Field label={t.f.paddingX} tech="padding-inline">
              <NumberInput
                label={t.f.paddingX}
                value={style.padding.left}
                min={0}
                max={64}
                unit="px"
                onChange={(v) => {
                  onChange("padding.left", v);
                  onChange("padding.right", v);
                }}
              />
            </Field>
          </>
        )}
        <Field label={t.f.minHeight} tech="min-height" aside={marker("minHeight")}>
          <NumberInput label={t.f.minHeight} value={style.minHeight} min={0} max={96} unit="px" onChange={(v) => onChange("minHeight", v)} />
        </Field>
      </Section>

      <Section title={t.g.effects}>
        <Field label={t.f.shadow} tech="box-shadow" aside={marker("shadow")}>
          <Segmented
            label={t.f.shadow}
            value={(Object.entries(SHADOW_PRESETS).find(([, v]) => v === style.shadow)?.[0] ?? "custom") as string}
            options={(Object.keys(SHADOW_PRESETS) as Array<keyof typeof SHADOW_PRESETS>).map((k) => [k, t.presets.shadow[k]])}
            onChange={(k) => onChange("shadow", SHADOW_PRESETS[k as keyof typeof SHADOW_PRESETS])}
          />
        </Field>
        {expert && shadow && (
          <div className="grid gap-3 sm:grid-cols-2">
            {(["x", "y", "blur", "spread"] as const).map((k) => (
              <Field key={k} label={t.f[k]} tech="px">
                <NumberInput
                  label={`${t.f.shadow} ${t.f[k]}`}
                  value={shadow[k]}
                  min={k === "blur" || k === "spread" ? (k === "spread" ? -20 : 0) : -40}
                  max={k === "blur" ? 80 : 40}
                  unit="px"
                  onChange={(v) => {
                    const s = { ...shadow, [k]: v };
                    onChange("shadow", `${s.inset ? "inset " : ""}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`);
                  }}
                />
              </Field>
            ))}
          </div>
        )}
        {expert && (
          <Field label={t.f.shadowCustom} tech="box-shadow">
            <TextInput label={t.f.shadowCustom} value={style.shadow} onChange={(v) => onChange("shadow", v || "none")} />
          </Field>
        )}
        {expert && (
          <Field label={t.f.textShadow} tech="text-shadow" aside={marker("textShadow")}>
            <TextInput label={t.f.textShadow} value={style.textShadow} placeholder="0 1px 2px rgba(0,0,0,.3)" onChange={(v) => onChange("textShadow", v)} />
          </Field>
        )}
        {expert && (
          <Field label={t.f.filter} tech="filter" aside={marker("filter")}>
            <TextInput label={t.f.filter} value={style.filter} placeholder="saturate(1.2)" onChange={(v) => onChange("filter", v)} />
          </Field>
        )}
      </Section>

      {showStates && (
        <Section title={t.g.states}>
          <Field label={t.f.hoverEffect} tech=":hover">
            <Segmented
              label={t.f.hoverEffect}
              value={hoverPreset(style.states.hover)}
              options={(["none", "darken", "lift", "scale", "glow"] as const).map((k) => [k, t.presets.hover[k]])}
              onChange={(k) => {
                const keep = style.states.hover.background ?? style.background;
                const next: StateStyle =
                  k === "none"
                    ? {}
                    : k === "darken"
                      ? {
                          background:
                            keep !== style.background
                              ? keep
                              : parseColor(style.background)
                                ? shiftLightness(style.background, -0.08)
                                : prefix
                                  ? `var(--${prefix}-color-primary-hover)`
                                  : style.background,
                        }
                      : k === "lift"
                        ? { background: keep, translateY: -2, shadow: "0 8px 20px rgba(15, 23, 42, 0.18)" }
                        : k === "scale"
                          ? { background: keep, scale: 1.04 }
                          : { background: keep, shadow: `0 0 0 4px rgba(37, 99, 235, 0.3)` };
                // Every leaf is written explicitly, so a preset fully replaces
                // the previous one — both on the seed and as a component
                // override, which can only hold scalar paths.
                const leaves = {
                  background: next.background ?? style.background,
                  translateY: next.translateY ?? 0,
                  scale: next.scale ?? 1,
                  shadow: next.shadow ?? (style.shadow || "none"),
                };
                for (const [key, v] of Object.entries(leaves)) onChange(`states.hover.${key}`, v);
              }}
            />
          </Field>
          <Toggle
            label={t.f.focusRing}
            checked={(style.states.focus.outlineWidth ?? 0) > 0}
            onChange={(on) => onChange("states.focus.outlineWidth", on ? 2 : 0)}
          />
          <Segmented
            label={t.g.states}
            value={state}
            options={(["hover", "focus", "active", "disabled"] as const).map((s) => [s, t.states[s]])}
            onChange={setState}
          />
          {color(`states.${state}.background`, `${t.states[state]}: ${t.f.stateBackground}`, "background", st.background ?? style.background)}
          {color(`states.${state}.color`, `${t.states[state]}: ${t.f.stateColor}`, "color", st.color ?? style.color)}
          {expert && color(`states.${state}.borderColor`, `${t.states[state]}: ${t.f.stateBorder}`, "border-color", st.borderColor ?? style.borderColor.top)}
          {(expert || state === "hover") && (
            <>
              <Field label={t.f.translateY} tech="transform: translateY" aside={marker(`states.${state}.translateY`)}>
                <NumberInput label={`${t.states[state]} ${t.f.translateY}`} value={st.translateY ?? 0} min={-12} max={12} unit="px" onChange={(v) => onChange(`states.${state}.translateY`, v)} />
              </Field>
              <Field label={t.f.scale} tech="transform: scale" aside={marker(`states.${state}.scale`)}>
                <NumberInput label={`${t.states[state]} ${t.f.scale}`} value={st.scale ?? 1} min={0.8} max={1.3} step={0.01} onChange={(v) => onChange(`states.${state}.scale`, v)} />
              </Field>
            </>
          )}
          {expert && (
            <Field label={t.f.opacity} tech="opacity">
              <NumberInput label={`${t.states[state]} ${t.f.opacity}`} value={Math.round((st.opacity ?? 1) * 100)} min={0} max={100} unit="%" onChange={(v) => onChange(`states.${state}.opacity`, v / 100)} />
            </Field>
          )}
          {expert && (
            <Field label={`${t.states[state]}: ${t.f.shadow}`} tech="box-shadow">
              <TextInput label={`${t.states[state]} ${t.f.shadow}`} value={st.shadow ?? ""} placeholder="none" onChange={(v) => onChange(`states.${state}.shadow`, v)} />
            </Field>
          )}
          {state === "focus" && (
            <>
              <Field label={t.f.outlineWidth} tech="outline-width" aside={marker("states.focus.outlineWidth")}>
                <NumberInput label={t.f.outlineWidth} value={st.outlineWidth ?? 0} min={0} max={6} unit="px" onChange={(v) => onChange("states.focus.outlineWidth", v)} />
              </Field>
              {color("states.focus.outlineColor", t.f.outlineColor, "outline-color", st.outlineColor ?? (prefix ? `var(--${prefix}-color-focus)` : "#2563eb"))}
              <Field label={t.f.outlineOffset} tech="outline-offset">
                <NumberInput label={t.f.outlineOffset} value={st.outlineOffset ?? 2} min={-4} max={8} unit="px" onChange={(v) => onChange("states.focus.outlineOffset", v)} />
              </Field>
            </>
          )}
        </Section>
      )}

      <Section title={t.g.motion}>
        <Field label={t.f.duration} tech="transition-duration" aside={marker("transitionDuration")}>
          <NumberInput label={t.f.duration} value={style.transitionDuration} min={0} max={1000} step={10} unit="ms" onChange={(v) => onChange("transitionDuration", v)} />
        </Field>
        <Field label={t.f.easing} tech="transition-timing-function" aside={marker("transitionEasing")}>
          <SelectInput
            label={t.f.easing}
            value={style.transitionEasing}
            options={(Array.from(new Set([style.transitionEasing, "ease", "ease-out", "ease-in-out", "linear", "cubic-bezier(0.2, 0.8, 0.2, 1)", "cubic-bezier(0.34, 1.56, 0.64, 1)"])) as string[]).map((e) => [e, e])}
            onChange={(v) => onChange("transitionEasing", v)}
          />
        </Field>
        <Field label={t.f.animation} tech="animation / @keyframes" aside={marker("animation")}>
          <SelectInput label={t.f.animation} value={style.animation} options={ANIMATIONS.map((a) => [a, t.presets.animation[a]])} onChange={(v) => onChange("animation", v)} />
        </Field>
      </Section>
    </div>
  );
}
