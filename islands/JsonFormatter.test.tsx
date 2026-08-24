// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JsonFormatter from "./JsonFormatter";

/**
 * The formatter's logic (parse → re-stringify at the chosen indent, and the
 * "position N" → line/column translation) is module-private, so it is driven
 * through the UI. What matters:
 *
 *  - round-tripping must not lose or reorder data,
 *  - the indent selector must actually change the output,
 *  - a syntax error must name a plausible line AND column, since that is the
 *    tool's whole reason to exist over `JSON.parse` in a console.
 */

afterEach(cleanup);

const user = () => userEvent.setup({ delay: null });

async function enter(json: string) {
  render(<JsonFormatter />);
  const area = screen.getByRole("textbox");
  await user().clear(area);
  if (json) await user().type(area, json.replace(/[{[]/g, "$&$&"));
  return area;
}

/** userEvent.type treats `{`/`[` as special; paste avoids the escaping dance. */
async function paste(json: string) {
  render(<JsonFormatter />);
  const area = screen.getByRole("textbox") as HTMLTextAreaElement;
  area.focus();
  await user().paste(json);
  return area;
}

const clickFormat = async () => user().click(screen.getByRole("button", { name: "Formatieren" }));
const clickMinify = async () => user().click(screen.getByRole("button", { name: "Minimieren" }));
const output = () => screen.getByText(/^[[{]/, { selector: "pre" }).textContent ?? "";

describe("formatting", () => {
  it("pretty-prints with a 2-space indent by default", async () => {
    await paste('{"a":1,"b":[2,3]}');
    await clickFormat();

    await waitFor(() => expect(screen.getByText("Gültiges JSON ✓")).toBeDefined());
    expect(output()).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
  });

  it("switches to a 4-space indent", async () => {
    await paste('{"a":1}');
    await user().selectOptions(screen.getByRole("combobox"), "4");
    await clickFormat();

    await waitFor(() => expect(output()).toBe('{\n    "a": 1\n}'));
  });

  it("emits compact output when the indent is 0", async () => {
    await paste('{"a":1,"b":2}');
    await user().selectOptions(screen.getByRole("combobox"), "0");
    await clickFormat();

    await waitFor(() => expect(output()).toBe('{"a":1,"b":2}'));
  });

  it("minifies regardless of the selected indent", async () => {
    await paste('{\n  "a": 1,\n  "b": [2, 3]\n}');
    await clickMinify();

    await waitFor(() => expect(output()).toBe('{"a":1,"b":[2,3]}'));
  });

  it("round-trips without losing data", async () => {
    const source = '{"n":null,"t":true,"f":false,"num":-1.5,"e":1e3,"s":"ä\\"quote","arr":[],"o":{}}';
    await paste(source);
    await clickMinify();

    await waitFor(() => expect(JSON.parse(output())).toEqual(JSON.parse(source)));
  });

  it("accepts a top-level array", async () => {
    await paste("[1,2,3]");
    await clickFormat();

    await waitFor(() => expect(output()).toBe("[\n  1,\n  2,\n  3\n]"));
  });

  it("preserves key order", async () => {
    await paste('{"z":1,"a":2,"m":3}');
    await clickMinify();

    await waitFor(() => expect(output()).toBe('{"z":1,"a":2,"m":3}'));
  });
});

describe("validation errors", () => {
  it("asks for input when the box is empty", async () => {
    render(<JsonFormatter />);
    await clickFormat();

    expect(await screen.findByText("Bitte JSON eingeben.")).toBeDefined();
  });

  it("treats whitespace-only input as empty", async () => {
    await paste("   \n  ");
    await clickFormat();

    expect(await screen.findByText("Bitte JSON eingeben.")).toBeDefined();
  });

  it("locates an error on a later line", async () => {
    // V8 ≥19 reports this shape WITHOUT any offset ("Unexpected token 'o',
    // ...\"…\" is not valid JSON"), so the position has to be recovered from
    // the quoted snippet. Before that fix this silently showed no line at all.
    await paste('{\n  "a": 1,\n  "b": oops\n}');
    await clickFormat();

    const err = await screen.findByText(/Zeile \d+, Spalte \d+/);
    expect(err.textContent).toMatch(/Zeile 3/);
  });

  it("reports a 1-based column within the offending line", async () => {
    await paste("[1, 2,]");
    await clickFormat();

    const err = await screen.findByText(/Zeile 1, Spalte \d+/);
    const col = Number(/Spalte (\d+)/.exec(err.textContent ?? "")![1]);
    expect(col).toBeGreaterThan(0);
    expect(col).toBeLessThanOrEqual("[1, 2,]".length + 1);
  });

  it("does not append a second location when the engine already gave one", async () => {
    // "{oops}" yields "... at position 1 (line 1 column 2)" on V8. The German
    // suffix must replace that, not stack on top of it.
    await paste("{oops}");
    await clickFormat();

    const err = await screen.findByText(/Zeile 1, Spalte 2/);
    expect(err.textContent).not.toMatch(/line \d+ column \d+/i);
    expect(err.textContent!.match(/Zeile/g)).toHaveLength(1);
  });

  it("still reports an error for input with no recoverable position", async () => {
    await paste("nope");
    await clickFormat();

    await waitFor(() => expect(screen.queryByText("Gültiges JSON ✓")).toBeNull());
    expect(screen.getByText(/./, { selector: ".status-pill--danger" })).toBeDefined();
  });

  it("clears a previous success when the next input is invalid", async () => {
    await paste('{"a":1}');
    await clickFormat();
    await waitFor(() => expect(screen.getByText("Gültiges JSON ✓")).toBeDefined());

    const area = screen.getByRole("textbox") as HTMLTextAreaElement;
    area.focus();
    await user().clear(area);
    await user().paste("{oops}");
    await clickFormat();

    await waitFor(() => expect(screen.queryByText("Gültiges JSON ✓")).toBeNull());
  });
});

describe("copy to clipboard", () => {
  // userEvent.setup() installs its own navigator.clipboard stub, so spy on that
  // rather than replacing navigator wholesale — the two would fight.
  it("copies the formatted output and confirms", async () => {
    const u = userEvent.setup({ delay: null });
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    render(<JsonFormatter />);
    (screen.getByRole("textbox") as HTMLTextAreaElement).focus();
    await u.paste('{"a":1}');
    await u.click(screen.getByRole("button", { name: "Formatieren" }));
    await waitFor(() => expect(screen.getByText("Gültiges JSON ✓")).toBeDefined());

    await u.click(screen.getByRole("button", { name: "Kopieren" }));

    expect(write).toHaveBeenCalledWith('{\n  "a": 1\n}');
    expect(await screen.findByRole("button", { name: "Kopiert ✓" })).toBeDefined();
  });

  it("stays quiet when the clipboard is denied", async () => {
    const u = userEvent.setup({ delay: null });
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));

    render(<JsonFormatter />);
    (screen.getByRole("textbox") as HTMLTextAreaElement).focus();
    await u.paste('{"a":1}');
    await u.click(screen.getByRole("button", { name: "Formatieren" }));
    await waitFor(() => expect(screen.getByText("Gültiges JSON ✓")).toBeDefined());

    await u.click(screen.getByRole("button", { name: "Kopieren" }));

    // No crash, and no false "Kopiert" confirmation.
    await waitFor(() => expect(screen.getByRole("button", { name: "Kopieren" })).toBeDefined());
  });
});

/**
 * The English branch. The cases above render without props and so double as
 * the regression test for the German default.
 *
 * The engine's own SyntaxError text stays untranslated — it is what a
 * developer will paste into a search engine — but the line/column suffix this
 * island appends follows the page language.
 */
describe("in English", () => {
  it("translates the actions", () => {
    render(<JsonFormatter lang="en" />);
    expect(screen.getByRole("button", { name: "Format" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Minify" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Formatieren" })).toBeNull();
  });

  it("asks for input in English", async () => {
    const u = userEvent.setup({ delay: null });
    render(<JsonFormatter lang="en" />);
    await u.click(screen.getByRole("button", { name: "Format" }));
    expect(await screen.findByText("Please enter some JSON.")).toBeDefined();
  });

  it("localises the line/column suffix", async () => {
    const u = userEvent.setup({ delay: null });
    render(<JsonFormatter lang="en" />);
    await u.type(screen.getByRole("textbox"), '{{"a": oops}');
    await u.click(screen.getByRole("button", { name: "Format" }));
    const msg = await screen.findByText(/line \d+, column \d+/);
    expect(msg).toBeDefined();
    expect(msg.textContent).not.toMatch(/Zeile/);
  });

  it("localises the suffix when V8 ALREADY reported a line and column", async () => {
    // `{a:1}` makes V8 emit "... at position 1 (line 1 column 2)", which takes
    // the one branch of `locate()` that does not need to compute a position —
    // and that branch interpolated German directly, so this exact case read
    // "Zeile 1, Spalte 2" on an English page. The test above cannot see it: its
    // input has no position at all and goes down the context-window branch.
    const u = userEvent.setup({ delay: null });
    render(<JsonFormatter lang="en" />);
    await u.type(screen.getByRole("textbox"), "{{a:1}");
    await u.click(screen.getByRole("button", { name: "Format" }));
    const msg = await screen.findByText(/line \d+, column \d+/);
    expect(msg.textContent).not.toMatch(/Zeile|Spalte/);
  });

  it("produces byte-identical output in both languages", async () => {
    const u = userEvent.setup({ delay: null });
    const { unmount } = render(<JsonFormatter lang="en" />);
    await u.type(screen.getByRole("textbox"), '{{"b":2,"a":1}');
    await u.click(screen.getByRole("button", { name: "Format" }));
    await waitFor(() => expect(output()).toContain("\"b\""));
    const en = output();
    unmount();

    render(<JsonFormatter />);
    await u.type(screen.getByRole("textbox"), '{{"b":2,"a":1}');
    await u.click(screen.getByRole("button", { name: "Formatieren" }));
    await waitFor(() => expect(output()).toContain("\"b\""));
    expect(output()).toBe(en);
  });
});
