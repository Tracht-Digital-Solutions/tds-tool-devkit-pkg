/**
 * Browser client for the studio's server side.
 *
 * - `tds-ext-tools-pkg` (PHP, via the API host): access, premium projects,
 *   the single-page URL fetch, checkout. Credentialed: the shared session
 *   cookie identifies the user, exactly like the site's premium gate.
 * - `tds-tools-frontend` (same origin): `/tds/studio/export` builds export
 *   files and refuses premium formats without the entitlement.
 */

import type { FetchedPage } from "./importer";
import type { DesignProject } from "./model";
import { parseAccess, offlineAccess, STUDIO_TOOL_ID, type ExportFormat, type StudioAccess } from "./policy";

const FALLBACK_API = "https://api.tracht-digital.de";
const FALLBACK_LOGIN = "https://auth.tracht-digital.de";

let runtimePromise: Promise<{ api: string; login: string }> | null = null;

/** The host's runtime config (`/tds-runtime.json`), as the site's own gate reads it. */
export function runtime(): Promise<{ api: string; login: string }> {
  runtimePromise ??= (async () => {
    const envApi = (import.meta as { env?: Record<string, string | undefined> }).env?.PUBLIC_API_URL;
    const envLogin = (import.meta as { env?: Record<string, string | undefined> }).env?.PUBLIC_LOGIN_URL;
    let api = envApi ?? FALLBACK_API;
    let login = envLogin ?? FALLBACK_LOGIN;
    try {
      const res = await fetch("/tds-runtime.json", { credentials: "same-origin" });
      if (res.ok) {
        const cfg = (await res.json()) as Record<string, unknown>;
        if (typeof cfg.apiBase === "string" && cfg.apiBase) api = cfg.apiBase;
        if (typeof cfg.loginUrl === "string" && cfg.loginUrl) login = cfg.loginUrl;
      }
    } catch {
      /* build-time fallbacks */
    }
    return { api: api.replace(/\/+$/, ""), login };
  })();
  return runtimePromise;
}

export function resetRuntimeForTests() {
  runtimePromise = null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { api } = await runtime();
  let res: Response;
  try {
    res = await fetch(`${api}${path}`, {
      ...init,
      credentials: "include",
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError("network", 0);
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new ApiError(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`, res.status, typeof data?.code === "string" ? data.code : undefined);
  return data as T;
}

/** Never throws: an unreachable API means "guest, default policy, premium closed". */
export async function getAccess(): Promise<StudioAccess> {
  try {
    return parseAccess(await call<unknown>("/tools/studio/access"));
  } catch {
    return offlineAccess();
  }
}

export interface ProjectSummary {
  id: number;
  name: string;
  updated_at: string;
}

export const listProjects = () => call<{ projects: ProjectSummary[] }>("/tools/studio/projects").then((d) => d.projects);
export const openProject = (id: number) => call<{ project: { id: number; name: string; data: unknown } }>(`/tools/studio/projects/${id}`).then((d) => d.project);
export const saveProject = (project: DesignProject, id: number | null) =>
  call<{ project: ProjectSummary }>(id ? `/tools/studio/projects/${id}` : "/tools/studio/projects", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify({ name: project.name, data: project }),
  }).then((d) => d.project);
export const deleteProject = (id: number) => call<{ ok: boolean }>(`/tools/studio/projects/${id}`, { method: "DELETE" });

export const analyzeUrl = (url: string) => call<FetchedPage & { warnings?: string[] }>("/tools/studio/analyze", { method: "POST", body: JSON.stringify({ url }) });

export async function startCheckout(): Promise<string> {
  const d = await call<{ url?: string }>("/tools/checkout", { method: "POST", body: JSON.stringify({ tool: STUDIO_TOOL_ID }) });
  if (!d.url) throw new ApiError("no checkout url", 502);
  return d.url;
}

export async function loginHref(): Promise<string> {
  const { login } = await runtime();
  return `${login}?next=${encodeURIComponent(typeof location !== "undefined" ? location.href : "")}`;
}

/** Downloads one export from the site server, which enforces the policy. */
export async function requestExport(format: ExportFormat, project: DesignProject): Promise<{ blob: Blob; filename: string }> {
  let res: Response;
  try {
    res = await fetch("/tds/studio/export", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, project }),
    });
  } catch {
    throw new ApiError("network", 0);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    throw new ApiError(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`, res.status, typeof data?.code === "string" ? data.code : undefined);
  }
  const cd = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(cd)?.[1] ?? `designsystem.${format}`;
  return { blob: await res.blob(), filename };
}
