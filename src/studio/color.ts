/**
 * Colour maths for the Designsystem-Studio.
 *
 * Parsing (hex, rgb, hsl, oklch, named), OKLCH conversion with gamut mapping,
 * WCAG 2.x contrast and the small set of derivations the generator needs.
 * Dependency-free on purpose: a pack's dependency lands in every consuming site.
 *
 * The WCAG sRGB linearisation keeps the `0.03928` threshold, the same constant
 * the pack's contrast checker uses, so both tools report the same ratio.
 */

export interface Rgba {
  /** 0–255 */
  r: number;
  g: number;
  b: number;
  /** 0–1 */
  a: number;
}

export interface Oklch {
  l: number;
  c: number;
  h: number;
  a: number;
}

const NAMED: Record<string, string> = Object.fromEntries(
  (
    "aliceblue:f0f8ff,antiquewhite:faebd7,aqua:00ffff,aquamarine:7fffd4,azure:f0ffff,beige:f5f5dc,bisque:ffe4c4,black:000000," +
    "blanchedalmond:ffebcd,blue:0000ff,blueviolet:8a2be2,brown:a52a2a,burlywood:deb887,cadetblue:5f9ea0,chartreuse:7fff00," +
    "chocolate:d2691e,coral:ff7f50,cornflowerblue:6495ed,cornsilk:fff8dc,crimson:dc143c,cyan:00ffff,darkblue:00008b," +
    "darkcyan:008b8b,darkgoldenrod:b8860b,darkgray:a9a9a9,darkgreen:006400,darkgrey:a9a9a9,darkkhaki:bdb76b," +
    "darkmagenta:8b008b,darkolivegreen:556b2f,darkorange:ff8c00,darkorchid:9932cc,darkred:8b0000,darksalmon:e9967a," +
    "darkseagreen:8fbc8f,darkslateblue:483d8b,darkslategray:2f4f4f,darkslategrey:2f4f4f,darkturquoise:00ced1," +
    "darkviolet:9400d3,deeppink:ff1493,deepskyblue:00bfff,dimgray:696969,dimgrey:696969,dodgerblue:1e90ff," +
    "firebrick:b22222,floralwhite:fffaf0,forestgreen:228b22,fuchsia:ff00ff,gainsboro:dcdcdc,ghostwhite:f8f8ff,gold:ffd700," +
    "goldenrod:daa520,gray:808080,green:008000,greenyellow:adff2f,grey:808080,honeydew:f0fff0,hotpink:ff69b4," +
    "indianred:cd5c5c,indigo:4b0082,ivory:fffff0,khaki:f0e68c,lavender:e6e6fa,lavenderblush:fff0f5,lawngreen:7cfc00," +
    "lemonchiffon:fffacd,lightblue:add8e6,lightcoral:f08080,lightcyan:e0ffff,lightgoldenrodyellow:fafad2,lightgray:d3d3d3," +
    "lightgreen:90ee90,lightgrey:d3d3d3,lightpink:ffb6c1,lightsalmon:ffa07a,lightseagreen:20b2aa,lightskyblue:87cefa," +
    "lightslategray:778899,lightslategrey:778899,lightsteelblue:b0c4de,lightyellow:ffffe0,lime:00ff00,limegreen:32cd32," +
    "linen:faf0e6,magenta:ff00ff,maroon:800000,mediumaquamarine:66cdaa,mediumblue:0000cd,mediumorchid:ba55d3," +
    "mediumpurple:9370db,mediumseagreen:3cb371,mediumslateblue:7b68ee,mediumspringgreen:00fa9a,mediumturquoise:48d1cc," +
    "mediumvioletred:c71585,midnightblue:191970,mintcream:f5fffa,mistyrose:ffe4e1,moccasin:ffe4b5,navajowhite:ffdead," +
    "navy:000080,oldlace:fdf5e6,olive:808000,olivedrab:6b8e23,orange:ffa500,orangered:ff4500,orchid:da70d6," +
    "palegoldenrod:eee8aa,palegreen:98fb98,paleturquoise:afeeee,palevioletred:db7093,papayawhip:ffefd5,peachpuff:ffdab9," +
    "peru:cd853f,pink:ffc0cb,plum:dda0dd,powderblue:b0e0e6,purple:800080,rebeccapurple:663399,red:ff0000," +
    "rosybrown:bc8f8f,royalblue:4169e1,saddlebrown:8b4513,salmon:fa8072,sandybrown:f4a460,seagreen:2e8b57," +
    "seashell:fff5ee,sienna:a0522d,silver:c0c0c0,skyblue:87ceeb,slateblue:6a5acd,slategray:708090,slategrey:708090," +
    "snow:fffafa,springgreen:00ff7f,steelblue:4682b4,tan:d2b48c,teal:008080,thistle:d8bfd8,tomato:ff6347," +
    "turquoise:40e0d0,violet:ee82ee,wheat:f5deb3,white:ffffff,whitesmoke:f5f5f5,yellow:ffff00,yellowgreen:9acd32"
  )
    .split(",")
    .map((pair) => pair.split(":") as [string, string]),
);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Splits a functional notation's arguments, accepting comma and space syntax. */
function args(inner: string): string[] {
  return inner
    .replace(/\s*\/\s*/g, " / ")
    .split(/[\s,]+/)
    .filter((part) => part.length > 0);
}

function num(token: string | undefined, percentOf = 1): number | null {
  if (token === undefined) return null;
  if (token === "none") return 0;
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|rad|turn|grad)?$/i.exec(token);
  if (!m) return null;
  const v = Number(m[1]);
  switch ((m[2] ?? "").toLowerCase()) {
    case "%":
      return (v / 100) * percentOf;
    case "rad":
      return (v * 180) / Math.PI;
    case "turn":
      return v * 360;
    case "grad":
      return v * 0.9;
    default:
      return v;
  }
}

/** Parses a CSS colour. Returns null for anything it cannot represent exactly. */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s === "") return null;
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMED[s]) return parseColor(`#${NAMED[s]}`);

  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) return null;
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a = "f"] = hex.split("") as [string, string, string, string?];
      return {
        r: parseInt(r + r, 16),
        g: parseInt(g + g, 16),
        b: parseInt(b + b, 16),
        a: parseInt(a + a, 16) / 255,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }

  const fn = /^([a-z]+)\((.*)\)$/.exec(s);
  if (!fn) return null;
  const name = fn[1];
  const parts = args(fn[2] ?? "");
  const slash = parts.indexOf("/");
  const alphaToken = slash >= 0 ? parts[slash + 1] : parts[3];
  const channels = slash >= 0 ? parts.slice(0, slash) : parts.slice(0, 3);
  if (channels.length !== 3) return null;
  const alpha = alphaToken === undefined ? 1 : num(alphaToken, 1);
  if (alpha === null) return null;

  if (name === "rgb" || name === "rgba") {
    const [r, g, b] = channels.map((c) => num(c, 255));
    if (r == null || g == null || b == null) return null;
    return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: clamp(alpha, 0, 1) };
  }
  if (name === "hsl" || name === "hsla") {
    const h = num(channels[0]);
    const sat = num(channels[1], 1);
    const light = num(channels[2], 1);
    if (h == null || sat == null || light == null) return null;
    // Bare numbers for s/l are percentages in the modern syntax.
    const sv = channels[1]?.endsWith("%") ? sat : sat / 100;
    const lv = channels[2]?.endsWith("%") ? light : light / 100;
    return { ...hslToRgb(h, clamp(sv, 0, 1), clamp(lv, 0, 1)), a: clamp(alpha, 0, 1) };
  }
  if (name === "oklch") {
    const l = num(channels[0], 1);
    const c = num(channels[1], 0.4);
    const h = num(channels[2]);
    if (l == null || c == null || h == null) return null;
    const lv = channels[0]?.endsWith("%") ? l : l > 1 ? l / 100 : l;
    return oklchToRgb({ l: lv, c: Math.max(0, c), h, a: clamp(alpha, 0, 1) });
  }
  return null;
}

export function isColor(input: string): boolean {
  return parseColor(input) !== null;
}

function hslToRgb(h: number, s: number, l: number): Omit<Rgba, "a"> {
  const hue = ((h % 360) + 360) % 360;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

export function rgbToHsl({ r, g, b }: Rgba): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h, s, l };
}

const hex2 = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");

export function toHex(c: Rgba): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return c.a >= 0.999 ? base : `${base}${hex2(c.a * 255)}`;
}

/** Normalises any parsable colour to lower-case hex; returns the input otherwise. */
export function normalizeColor(input: string): string {
  const c = parseColor(input);
  return c ? toHex(c) : input;
}

export type ColorFormat = "hex" | "rgb" | "hsl" | "oklch";

export function formatColor(c: Rgba, format: ColorFormat): string {
  const a = Math.round(c.a * 1000) / 1000;
  const alpha = a < 1 ? ` / ${a}` : "";
  switch (format) {
    case "rgb":
      return `rgb(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)}${alpha})`;
    case "hsl": {
      const { h, s, l } = rgbToHsl(c);
      return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%${alpha})`;
    }
    case "oklch": {
      const o = rgbToOklch(c);
      return `oklch(${(o.l * 100).toFixed(1)}% ${o.c.toFixed(3)} ${o.h.toFixed(1)}${alpha})`;
    }
    default:
      return toHex(c);
  }
}

// --- OKLab / OKLCH (Björn Ottosson's reference matrices) ----------------------

const toLinear = (v: number) => {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255;

export function rgbToOklch(c: Rgba): Oklch {
  const r = toLinear(c.r);
  const g = toLinear(c.g);
  const b = toLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c: C < 1e-4 ? 0 : C, h: C < 1e-4 ? 0 : h, a: c.a };
}

function oklchToLinear({ l: L, c: C, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const A = C * Math.cos(hr);
  const B = C * Math.sin(hr);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: [number, number, number]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH → sRGB, reducing chroma (hue and lightness kept) until it fits. */
export function oklchToRgb(o: Oklch): Rgba {
  const L = clamp(o.l, 0, 1);
  let lin = oklchToLinear({ ...o, l: L });
  if (!inGamut(lin)) {
    let lo = 0;
    let hi = o.c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ ...o, l: L, c: mid }))) lo = mid;
      else hi = mid;
    }
    lin = oklchToLinear({ ...o, l: L, c: lo });
  }
  const [r, g, b] = lin.map((v) => clamp(fromLinear(clamp(v, 0, 1)), 0, 255)) as [number, number, number];
  return { r, g, b, a: o.a };
}

export function oklch(l: number, c: number, h: number, a = 1): string {
  return toHex(oklchToRgb({ l, c, h, a }));
}

// --- WCAG -----------------------------------------------------------------

const wcagChannel = (v: number) => {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};

export function luminance(c: Rgba): number {
  return 0.2126 * wcagChannel(c.r) + 0.7152 * wcagChannel(c.g) + 0.0722 * wcagChannel(c.b);
}

/** Paints a translucent colour over an opaque backdrop. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

/**
 * WCAG contrast ratio of two CSS colours. A translucent foreground is painted
 * over the background first; a translucent background over white. Returns
 * null when either side is not a plain colour (a gradient, a var()).
 */
export function contrast(fg: string, bg: string): number | null {
  const b0 = parseColor(bg);
  const f0 = parseColor(fg);
  if (!b0 || !f0) return null;
  const b = b0.a < 1 ? composite(b0, { r: 255, g: 255, b: 255, a: 1 }) : b0;
  const f = f0.a < 1 ? composite(f0, b) : f0;
  const l1 = luminance(f);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** The darker/lighter of two text colours that reads best on `bg`. */
export function readableOn(bg: string, dark = "#111111", light = "#ffffff"): string {
  const d = contrast(dark, bg) ?? 0;
  const l = contrast(light, bg) ?? 0;
  return l >= d ? light : dark;
}

/**
 * Moves `fg` along OKLCH lightness (hue and chroma kept as far as the gamut
 * allows) until it reaches `target` against `bg`. Picks the direction that
 * needs the smaller step; returns `fg` unchanged when it already passes.
 */
export function ensureContrast(fg: string, bg: string, target: number): string {
  const current = contrast(fg, bg);
  const f = parseColor(fg);
  if (current === null || !f) return fg;
  if (current >= target) return toHex({ ...f, a: 1 });
  const o = rgbToOklch({ ...f, a: 1 });
  const tryDir = (dir: 1 | -1): string | null => {
    for (let step = 1; step <= 100; step++) {
      const l = o.l + dir * step * 0.01;
      if (l < 0 || l > 1) break;
      const candidate = oklch(l, o.c, o.h);
      if ((contrast(candidate, bg) ?? 0) >= target) return candidate;
    }
    return null;
  };
  const down = tryDir(-1);
  const up = tryDir(1);
  if (down && up) {
    const dl = Math.abs(rgbToOklch(parseColor(down)!).l - o.l);
    const ul = Math.abs(rgbToOklch(parseColor(up)!).l - o.l);
    return dl <= ul ? down : up;
  }
  return down ?? up ?? readableOn(bg, "#000000", "#ffffff");
}

/** Shifts lightness in OKLCH (positive = lighter). */
export function shiftLightness(color: string, delta: number): string {
  const c = parseColor(color);
  if (!c) return color;
  const o = rgbToOklch(c);
  return oklch(clamp(o.l + delta, 0, 1), o.c, o.h, c.a);
}

export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  return c ? toHex({ ...c, a: clamp(alpha, 0, 1) }) : color;
}

/** The OKLCH description of a CSS colour, or a neutral fallback. */
export function describe(color: string): Oklch {
  const c = parseColor(color);
  return c ? rgbToOklch(c) : { l: 0.5, c: 0, h: 0, a: 1 };
}

export const HARMONIES = ["analogous", "complementary", "triadic", "split", "monochrome"] as const;
export type Harmony = (typeof HARMONIES)[number];

/** Secondary and accent hue offsets per harmony rule. */
export function harmonyOffsets(harmony: Harmony): [number, number] {
  switch (harmony) {
    case "complementary":
      return [180, 30];
    case "triadic":
      return [120, 240];
    case "split":
      return [150, 210];
    case "monochrome":
      return [0, 0];
    default:
      return [-30, 30];
  }
}

/** A 50–950 tonal scale around a colour, evenly spaced in OKLCH lightness. */
export function tonalScale(color: string): Record<string, string> {
  const o = describe(color);
  const steps: Array<[string, number]> = [
    ["50", 0.97],
    ["100", 0.93],
    ["200", 0.86],
    ["300", 0.77],
    ["400", 0.67],
    ["500", 0.58],
    ["600", 0.5],
    ["700", 0.42],
    ["800", 0.34],
    ["900", 0.26],
    ["950", 0.19],
  ];
  const out: Record<string, string> = {};
  for (const [name, l] of steps) {
    // Chroma tapers at the ends of the scale, where sRGB has none to give.
    const taper = 1 - Math.abs(l - 0.6) * 0.9;
    out[name] = oklch(l, o.c * Math.max(0.15, taper), o.h);
  }
  return out;
}
