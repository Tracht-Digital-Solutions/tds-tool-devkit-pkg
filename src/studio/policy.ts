/**
 * Export formats and the free/premium split.
 *
 * The split is configured in the admin panel (Einstellungen → Tools →
 * Designsystem-Studio) and served by `GET /tools/studio/access`. The default
 * here must stay identical to the PHP default in `tds-ext-tools-pkg`
 * (`StudioPolicy::DEFAULT_PREMIUM`): it is what applies when the API cannot be
 * reached, and then a premium format stays closed.
 */

export const EXPORT_FORMATS = ["css", "variables", "html", "scss", "json", "tailwind", "bootstrap", "zip"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export type Tier = "free" | "premium";
export type FormatPolicy = Record<ExportFormat, Tier>;

export const DEFAULT_PREMIUM: readonly ExportFormat[] = ["scss", "tailwind", "bootstrap", "zip"];

export const isExportFormat = (v: unknown): v is ExportFormat => typeof v === "string" && (EXPORT_FORMATS as readonly string[]).includes(v);

export function defaultPolicy(): FormatPolicy {
  return Object.fromEntries(EXPORT_FORMATS.map((f) => [f, DEFAULT_PREMIUM.includes(f) ? "premium" : "free"])) as FormatPolicy;
}

/** Reads a policy from an API answer; unknown or missing formats fall back to the default. */
export function parsePolicy(input: unknown): FormatPolicy {
  const out = defaultPolicy();
  if (!input || typeof input !== "object") return out;
  for (const f of EXPORT_FORMATS) {
    const v = (input as Record<string, unknown>)[f];
    if (v === "free" || v === "premium") out[f] = v;
  }
  return out;
}

/** What one visitor may do, as answered by `GET /tools/studio/access`. */
export interface StudioAccess {
  /** The tool is switched on in the admin catalog. */
  enabled: boolean;
  authenticated: boolean;
  /** Owns the studio's premium entitlement (or is an admin). */
  entitled: boolean;
  formats: FormatPolicy;
  priceCents: number;
  currency: string;
  analysisEnabled: boolean;
  projectLimit: number;
}

export function parseAccess(input: unknown): StudioAccess {
  const r = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    enabled: r.enabled !== false,
    authenticated: r.authenticated === true,
    entitled: r.entitled === true,
    formats: parsePolicy(r.formats),
    priceCents: num(r.priceCents, 0),
    currency: typeof r.currency === "string" ? r.currency : "EUR",
    analysisEnabled: r.analysisEnabled !== false,
    projectLimit: num(r.projectLimit, 0),
  };
}

/** Fail-closed access when the API cannot be asked. */
export function offlineAccess(): StudioAccess {
  return { enabled: true, authenticated: false, entitled: false, formats: defaultPolicy(), priceCents: 0, currency: "EUR", analysisEnabled: false, projectLimit: 0 };
}

export function mayExport(access: StudioAccess, format: ExportFormat): boolean {
  return access.enabled && (access.formats[format] === "free" || access.entitled);
}

/** The id the premium entitlement is stored under (the tool's catalog id). */
export const STUDIO_TOOL_ID = "design-system-studio";
