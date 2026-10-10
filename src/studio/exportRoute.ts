/**
 * Server half of the export: a framework-free request handler that the tools
 * site mounts at `POST /tds/studio/export`. It lives here, beside the
 * adapters, so the policy check and the file it guards are one module.
 *
 * Premium formats are generated ONLY after the API confirmed the entitlement
 * for the visitor's own session cookie. When the API cannot be asked, the
 * default policy applies and premium stays closed (fail closed).
 */

import { buildExport } from "./export/adapters";
import { parseProject } from "./model";
import { EXPORT_FORMATS, isExportFormat, mayExport, offlineAccess, parseAccess, type StudioAccess } from "./policy";

const MAX_BODY = 1_000_000;

export interface ExportRouteDeps {
  /** Absolute API base, e.g. https://api.tracht-digital.de */
  apiBase: () => string;
  fetch?: typeof fetch;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export async function accessFor(request: Request, deps: ExportRouteDeps): Promise<StudioAccess> {
  const f = deps.fetch ?? fetch;
  try {
    const res = await f(`${deps.apiBase().replace(/\/+$/, "")}/tools/studio/access`, {
      headers: {
        Accept: "application/json",
        Cookie: request.headers.get("cookie") ?? "",
        ...(request.headers.get("x-forwarded-for") ? { "X-Forwarded-For": request.headers.get("x-forwarded-for")! } : {}),
      },
      redirect: "error",
      signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(6000) : undefined,
    });
    if (!res.ok) return offlineAccess();
    return parseAccess(await res.json());
  } catch {
    return offlineAccess();
  }
}

export async function handleExport(request: Request, deps: ExportRouteDeps): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return json(415, { error: "JSON erwartet." });
  const text = await request.text();
  if (text.length > MAX_BODY) return json(413, { error: "Projekt zu groß." });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return json(400, { error: "Ungültiges JSON." });
  }
  const format = body.format;
  if (!isExportFormat(format)) return json(422, { error: "Unbekanntes Format.", code: "format" });
  const project = parseProject(body.project);
  if (!project) return json(422, { error: "Ungültiges Projekt.", code: "project" });

  const access = await accessFor(request, deps);
  if (!access.enabled) return json(403, { error: "Das Designsystem-Studio ist derzeit deaktiviert.", code: "disabled" });
  if (!mayExport(access, format)) return json(403, { error: "Dieses Format ist Premium-Nutzern vorbehalten.", code: "premium_required" });

  const allowed = EXPORT_FORMATS.filter((f) => mayExport(access, f));
  const file = buildExport(project, format, allowed);
  const body2 = typeof file.body === "string" ? file.body : new Blob([file.body as BlobPart]);
  return new Response(body2, {
    status: 200,
    headers: {
      "Content-Type": file.mime,
      // fileStem() leaves only [a-z0-9-] plus a fixed suffix — safe in a header.
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
