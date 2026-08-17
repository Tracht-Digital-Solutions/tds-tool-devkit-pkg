// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContrastChecker from "./ContrastChecker";

/**
 * The WCAG maths (hex parsing, relative luminance, contrast ratio) lives in
 * module-private helpers, so it is verified through the rendered ratio and the
 * pass/fail badges rather than by exporting internals just for tests.
 *
 * The reference ratios below are the WCAG 2.1 definitions, not values copied
 * from this implementation — black on white is exactly 21:1, and the AA/AAA
 * thresholds are 4.5 / 3 / 7 / 4.5. Testing the boundaries is the point: an
 * off-by-one in a `>=` silently mislabels borderline palettes as accessible.
 */

afterEach(cleanup);

/**
 * Each swatch renders two controls for the same label: a native colour picker
 * (`aria-label`) and the free-text hex field. Only the text field accepts the
 * malformed input these tests care about, so select it by type.
 */
const type = async (label: string, value: string) => {
  const user = userEvent.setup({ delay: null });
  const input = screen
    .getAllByLabelText(label)
    .find((el) => (el as HTMLInputElement).type !== "color") as HTMLInputElement;
  await user.clear(input);
  if (value) await user.type(input, value);
};

/** Set both colours and read back the rendered ratio string. */
async function ratioFor(fg: string, bg: string) {
  render(<ContrastChecker />);
  await type("Textfarbe", fg);
  await type("Hintergrund", bg);
  const node = screen.getByText(/ : 1$|^—$/);
  return node.textContent ?? "";
}

describe("contrast ratio", () => {
  it("renders a default ratio on mount", () => {
    render(<ContrastChecker />);
    // #1f2937 on #ffffff — the shipped default, a dark slate on white.
    expect(screen.getByText(/ : 1$/).textContent).toMatch(/^\d+\.\d{2} : 1$/);
  });

  it("computes black on white as exactly 21.00 : 1", async () => {
    expect(await ratioFor("#000000", "#ffffff")).toBe("21.00 : 1");
  });

  it("computes white on black as 21.00 : 1 too (order must not matter)", async () => {
    expect(await ratioFor("#ffffff", "#000000")).toBe("21.00 : 1");
  });

  it("computes identical colours as 1.00 : 1", async () => {
    expect(await ratioFor("#777777", "#777777")).toBe("1.00 : 1");
  });

  it("matches the WCAG reference value for mid grey on white", async () => {
    // #767676 on #ffffff is the canonical "smallest AA-passing grey" — 4.54:1.
    expect(await ratioFor("#767676", "#ffffff")).toBe("4.54 : 1");
  });

  it("expands 3-digit shorthand hex", async () => {
    // #fff must behave exactly like #ffffff.
    expect(await ratioFor("#000", "#fff")).toBe("21.00 : 1");
  });

  it("tolerates a missing leading # and stray whitespace", async () => {
    expect(await ratioFor("000000", " ffffff ")).toBe("21.00 : 1");
  });
});

describe("invalid input", () => {
  it("warns instead of rendering a ratio", async () => {
    render(<ContrastChecker />);
    await type("Textfarbe", "nichtvalide");

    expect(screen.getByText(/Bitte gültige Hex-Farben eingeben/)).toBeDefined();
    expect(screen.queryByText(/ : 1$/)).toBeNull();
  });

  it.each([["#12345"], ["#gggggg"], [""], ["#1234567"]])(
    "rejects %s as a colour",
    async (bad) => {
      render(<ContrastChecker />);
      await type("Hintergrund", bad);
      expect(screen.getByText(/Bitte gültige Hex-Farben eingeben/)).toBeDefined();
    },
  );
});

describe("WCAG pass badges", () => {
  const badgeText = (label: string) =>
    screen
      .getAllByText(new RegExp(`^${label.replace(/[()]/g, "\\$&")}:`))
      .map((el) => el.textContent)
      .join("");

  it("passes every level for black on white", async () => {
    await ratioFor("#000000", "#ffffff");
    for (const level of ["AA (Normal)", "AA (Groß)", "AAA (Normal)", "AAA (Groß)"]) {
      expect(badgeText(level), level).toContain("bestanden ✓");
      expect(badgeText(level), level).not.toContain("nicht bestanden");
    }
  });

  it("fails every level for identical colours", async () => {
    await ratioFor("#777777", "#777777");
    for (const level of ["AA (Normal)", "AA (Groß)", "AAA (Normal)", "AAA (Groß)"]) {
      expect(badgeText(level), level).toContain("nicht bestanden ✗");
    }
  });

  it("splits correctly just above the AA-normal threshold (4.5)", async () => {
    // 4.54:1 — passes AA normal and large, fails AAA normal (needs 7).
    await ratioFor("#767676", "#ffffff");
    expect(badgeText("AA (Normal)")).toContain("bestanden ✓");
    expect(badgeText("AA (Groß)")).toContain("bestanden ✓");
    expect(badgeText("AAA (Normal)")).toContain("nicht bestanden ✗");
    expect(badgeText("AAA (Groß)")).toContain("bestanden ✓");
  });

  it("splits correctly just below the AA-normal threshold", async () => {
    // #777777 on white is 4.48:1 — just under 4.5, so AA normal must fail.
    await ratioFor("#777777", "#ffffff");
    expect(badgeText("AA (Normal)")).toContain("nicht bestanden ✗");
    expect(badgeText("AA (Groß)")).toContain("bestanden ✓");
  });

  it("marks a mid-range pair AA-large only", async () => {
    // #949494 on white ≈ 3.0-3.1 : 1 — over the 3:1 large-text bar, under 4.5.
    await ratioFor("#949494", "#ffffff");
    expect(badgeText("AA (Groß)")).toContain("bestanden ✓");
    expect(badgeText("AA (Normal)")).toContain("nicht bestanden ✗");
    expect(badgeText("AAA (Normal)")).toContain("nicht bestanden ✗");
  });

  it("keeps the four badges labelled and distinct", () => {
    render(<ContrastChecker />);
    for (const level of ["AA (Normal)", "AA (Groß)", "AAA (Normal)", "AAA (Groß)"]) {
      expect(badgeText(level), level).toBeTruthy();
    }
  });
});

/**
 * The English branch. Every case above renders without props, so they are
 * also the regression test for the German default.
 *
 * The WCAG thresholds are NOT translated — the whole point of the tool is
 * that 4.5:1 is 4.5:1 in every language, so the last case pins that both
 * renderings judge the same colour pair identically.
 */
describe("in English", () => {
  it("translates the inputs and the verdicts", () => {
    render(<ContrastChecker lang="en" />);
    // Each colour has TWO controls sharing one label — the swatch and the
    // hex field — which is why the repo helper above selects by type.
    expect(screen.getAllByLabelText("Text colour").length).toBe(2);
    expect(screen.getAllByLabelText("Background").length).toBe(2);
    expect(screen.getAllByText(/passed ✓/).length).toBeGreaterThan(0);
    expect(screen.queryAllByLabelText("Textfarbe")).toHaveLength(0);
  });

  it("reports an unparseable colour in English", async () => {
    render(<ContrastChecker lang="en" />);
    await type("Text colour", "nonsense");
    expect(await screen.findByText(/valid hex colours/)).toBeDefined();
  });

  it("computes the same ratio in both languages", () => {
    const { unmount } = render(<ContrastChecker lang="en" />);
    const en = screen.getByText(/: 1$/).textContent;
    unmount();
    render(<ContrastChecker />);
    expect(screen.getByText(/: 1$/).textContent).toBe(en);
  });
});
