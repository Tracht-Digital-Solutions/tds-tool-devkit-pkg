# Designsystem-Studio

Tool `design-system-studio`, slug `designsystem-studio`, category `design`. Free tool; its
Premium (saving projects, premium export formats) is the platform's per-tool entitlement
under the same id, sold through `tds-ext-tools-pkg`'s checkout.

## One model, one emitter

- `model.ts` — the versioned `DesignProject` (`schema`). `parseProject()` accepts stored or
  user-supplied JSON and fills new fields from defaults; bump `SCHEMA_VERSION` only with a
  migration in `parseProject`.
- Layers, lowest first: seed (+ imported values) → variant → `globals` → `components` →
  `customCss`. `locks` freeze a value into `globals`. Resolution is `resolve.ts`; never
  compute a token or a component style anywhere else.
- `css.ts` is the ONLY emitter. Preview, code view, every adapter and the a11y check read
  `resolveProject()`/`emitCss()`. The preview only adds `.is-*` state classes and a
  `pv-` scaffold for its demo pages (not part of the library).
- Components reference colour ROLES (`var(--ds-color-…)`), so themes cannot contradict a
  component. Seed/manual values are written as literals, generated ones as token vars.
- Variants change structure (radius, depth, type, motion), not just colour.

## Guarantees and where they are enforced

| Guarantee | Where |
|---|---|
| Generator output passes its own check | `exports.test.ts` "fresh design has no failures" |
| User CSS kept, last and unlayered; `<`/legacy vectors neutralised | `css.ts` `sanitizeCss`, engine tests |
| Preview runs nothing | iframe `sandbox="allow-same-origin"` (no scripts/forms), CSP meta, clicks cancelled from outside, markup tests |
| Pasted HTML is inert | `sanitize.ts` allow-list + the same sandbox |
| Premium exports server-side | `exportRoute.ts`, mounted by the site at `POST /tds/studio/export`; asks `/tools/studio/access` with the visitor's cookie, fails closed |
| Guests store nothing | no storage API in `islands/studio`; `Studio.test.tsx` spies on `setItem` |

`policy.ts` `DEFAULT_PREMIUM` must equal `StudioPolicy::DEFAULT_PREMIUM` in
`tds-ext-tools-pkg`.

## UI structure

- `islands/studio/Layout.tsx` is the frame every step uses: `Stepper` (progress fill + steps,
  `aria-current="step"`, done steps ticked), `StepIntro` (title + one sentence, copy in
  `strings.layout.intro`), `Workspace` (settings | sticky preview; preview first on a phone),
  `PreviewToolbar`, `ChoiceCard`, `StepFooter` (the next button names its target).
- Areas are separated by fill (`--color-soft`), not by nested `tds-card`s — their offset
  shadows stacked into noise inside the tool card.
- The manifest sets `layout: "wide"` (contract ≥ 1.2.0): the site gives the studio the full
  content width. A sticky preview needs `self-start`; a stretched grid item never sticks.
- Long lists open where the work is: token groups collapsed except colours, the a11y list on
  problems → notes → passes, never "all".

## URL analysis

The fetch (one HTTPS page + its stylesheets, SSRF-guarded) is PHP in `tds-ext-tools-pkg`;
the analysis is `importer.ts#analyzePage` in the browser. It reads styles only — no text,
images or logos — and reports "nicht ermittelt" instead of inventing values.

## Adding an export format

Add the id to `EXPORT_FORMATS` (and to `StudioPolicy::FORMATS` + the admin island list in
`tds-ext-tools-pkg`), add an adapter to `ADAPTERS`. The generator does not change.
