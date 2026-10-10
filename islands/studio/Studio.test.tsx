/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRuntimeForTests } from "../../src/studio/api";
import { defaultPolicy } from "../../src/studio/policy";
import Studio from "./Studio";

type Answer = { status?: number; body: unknown };

function mockFetch(routes: Record<string, Answer | ((init?: RequestInit) => Answer)>) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    if (!key) return new Response("{}", { status: 404 });
    const r = routes[key]!;
    const a = typeof r === "function" ? r(init) : r;
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const guest = { enabled: true, authenticated: false, entitled: false, formats: defaultPolicy(), priceCents: 900, currency: "EUR", analysisEnabled: true, projectLimit: 50 };

beforeEach(() => {
  resetRuntimeForTests();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Designsystem-Studio", () => {
  it("lets a guest design a button and generate the system, without storing anything", async () => {
    mockFetch({ "/tds-runtime.json": { body: { apiBase: "https://api.example" } }, "/tools/studio/access": { body: guest } });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<Studio lang="de" />);

    // Later steps are locked until the system exists.
    expect((screen.getByRole("button", { name: /3\. Designsystem/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Neue Komponente gestalten/ }));
    fireEvent.click(screen.getByRole("button", { name: "Gestalten" }));
    expect(screen.getByRole("heading", { name: "Komponente gestalten" })).toBeTruthy();

    // Change the corner radius through a preset and the font size directly.
    fireEvent.click(screen.getByRole("button", { name: "Pille" }));
    expect(screen.getByRole("button", { name: "Pille" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Designsystem erzeugen" }));
    expect(screen.getByRole("button", { name: /3\. Designsystem/ }).getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("button", { name: /Verspielt/ })).toBeTruthy();
    expect(screen.getByText(/Ihre Arbeit bleibt nur in diesem Browserfenster/)).toBeTruthy();

    // Variant switch keeps working state.
    fireEvent.click(screen.getByRole("button", { name: /Technisch/ }));
    expect(screen.getByRole("button", { name: /Technisch/ }).getAttribute("aria-pressed")).toBe("true");

    expect(setItem).not.toHaveBeenCalled();
  });

  it("renders the preview in a sandbox without scripts, forms or navigation", async () => {
    mockFetch({ "/tools/studio/access": { body: guest } });
    const { container } = render(<Studio lang="en" />);
    fireEvent.click(screen.getByRole("button", { name: /Design a new component/ }));
    fireEvent.click(screen.getByRole("button", { name: "Design" }));
    const frame = container.querySelector("iframe")!;
    expect(frame.getAttribute("sandbox")).toBe("allow-same-origin");
    const doc = frame.getAttribute("srcdoc") ?? (frame as HTMLIFrameElement & { srcdoc: string }).srcdoc;
    expect(doc).toContain("default-src 'none'");
    expect(doc).not.toMatch(/<script/i);
  });

  it("shows premium formats as locked for guests and downloads free ones through the server", async () => {
    const fetchMock = mockFetch({
      "/tools/studio/access": { body: guest },
    });
    // The export endpoint answers a file.
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/tools/studio/access")) return new Response(JSON.stringify(guest), { status: 200 });
      if (url.endsWith("/tds/studio/export")) return new Response("/* css */", { status: 200, headers: { "Content-Disposition": 'attachment; filename="x.css"' } });
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
    render(<Studio lang="de" />);
    fireEvent.click(screen.getByRole("button", { name: /Neue Komponente gestalten/ }));
    fireEvent.click(screen.getByRole("button", { name: "Gestalten" }));
    fireEvent.click(screen.getByRole("button", { name: "Designsystem erzeugen" }));
    fireEvent.click(screen.getByRole("button", { name: /7\. Export/ }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/tools/studio/access"))).toBe(true));
    const scss = screen.getByText("SCSS").closest("li")!;
    expect((within(scss).getByRole("button", { name: "Premium erforderlich" }) as HTMLButtonElement).disabled).toBe(true);
    const css = screen.getByText("CSS").closest("li")!;
    fireEvent.click(within(css).getByRole("button", { name: "Herunterladen" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/tds/studio/export"))).toBe(true));
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/tds/studio/export"))!;
    expect(JSON.parse(String((call[1] as RequestInit).body)).format).toBe("css");
    // Saving is not offered to a guest.
    expect(screen.queryByRole("button", { name: "Speichern" })).toBeNull();
    expect(screen.getByText(/Speichern ist Premium-Nutzern vorbehalten/)).toBeTruthy();
  });

  it("lets an entitled user save the project", async () => {
    const saved: unknown[] = [];
    mockFetch({
      "/tools/studio/access": { body: { ...guest, authenticated: true, entitled: true } },
      "/tools/studio/projects": (init) => {
        if (init?.method === "POST") {
          saved.push(JSON.parse(String(init.body)));
          return { status: 201, body: { project: { id: 7, name: "Mein Designsystem", updated_at: "2026-10-10 12:00:00" } } };
        }
        return { body: { projects: [] } };
      },
    });
    render(<Studio lang="de" />);
    fireEvent.click(screen.getByRole("button", { name: /Neue Komponente gestalten/ }));
    fireEvent.click(screen.getByRole("button", { name: "Gestalten" }));
    fireEvent.click(screen.getByRole("button", { name: "Designsystem erzeugen" }));
    fireEvent.click(screen.getByRole("button", { name: /7\. Export/ }));
    const save = await screen.findByRole("button", { name: "Speichern" });
    fireEvent.click(save);
    await screen.findByText("Projekt gespeichert.");
    expect((saved[0] as { data: { schema: number } }).data.schema).toBe(1);
  });

  it("runs the accessibility check and applies a suggestion", async () => {
    mockFetch({ "/tools/studio/access": { body: guest } });
    render(<Studio lang="de" />);
    fireEvent.click(screen.getByRole("button", { name: /Neue Komponente gestalten/ }));
    fireEvent.click(screen.getByRole("button", { name: "Gestalten" }));
    // Pale background with white text: a contrast problem the check must find.
    const bg = screen.getAllByLabelText("Hintergrundfarbe (CSS)")[0]!;
    fireEvent.change(bg, { target: { value: "#bae6fd" } });
    fireEvent.click(screen.getByRole("button", { name: "Designsystem erzeugen" }));
    fireEvent.click(screen.getByRole("button", { name: /6\. Barrierefreiheit/ }));
    expect(screen.getAllByText("Problem").length).toBeGreaterThan(0);
    expect(screen.getByText(/keine Konformitätsbestätigung/)).toBeTruthy();
    const apply = screen.getAllByRole("button", { name: "Vorschlag übernehmen" })[0]!;
    fireEvent.click(apply);
    // It changes a seed colour → ask first.
    const anyway = screen.queryByRole("button", { name: "Trotzdem übernehmen" });
    if (anyway) fireEvent.click(anyway);
    await screen.findByText(/Übernommen/);
  });
});
