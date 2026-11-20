import { readFileSync } from "node:fs";
import { join } from "node:path";

// Vitest turns CSS imports into empty strings, so the file is read from disk.
const css = readFileSync(join(__dirname, "tokens.css"), "utf8");

/** WCAG 2.2 AA: 4.5:1 for text, 3:1 for large text, UI parts (borders, focus ring) and chart lines. */
const TEXT = 4.5;
const UI = 3;

function tokens(side: 0 | 1): Map<string, string> {
  const found = new Map<string, string>();
  for (const [, name, light, dark] of css.matchAll(
    /--([\w-]+):\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/gi,
  )) {
    found.set(name!, (side === 0 ? light : dark)!.toLowerCase());
  }
  return found;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** [foreground, background, minimum] */
const PAIRS: [string, string, number][] = [
  ["text", "bg", TEXT],
  ["text", "surface", TEXT],
  ["text", "surface-2", TEXT],
  ["text", "accent-soft", TEXT],
  ["text", "danger-soft", TEXT],
  ["muted", "bg", TEXT],
  ["muted", "surface", TEXT],
  ["muted", "surface-2", TEXT],
  ["accent", "surface", TEXT],
  ["accent", "bg", TEXT],
  ["accent", "accent-soft", TEXT],
  ["on-accent", "accent", TEXT],
  ["on-accent", "accent-hover", TEXT],
  ["danger", "surface", TEXT],
  ["danger", "danger-soft", TEXT],
  ["good", "good-soft", TEXT],
  ["warn", "warn-soft", TEXT],
  ["border-strong", "surface", UI],
  ["accent", "surface-2", UI],
  ["chart-warm", "surface", UI],
];

describe.each([
  ["light", 0],
  ["dark", 1],
] as const)("%s theme", (_name, side) => {
  const palette = tokens(side);

  it.each(PAIRS)("%s on %s is readable", (fg, bg, minimum) => {
    const a = palette.get(fg);
    const b = palette.get(bg);
    expect([fg, a]).toEqual([fg, expect.stringMatching(/^#/)]);
    expect([bg, b]).toEqual([bg, expect.stringMatching(/^#/)]);
    expect(ratio(a!, b!)).toBeGreaterThanOrEqual(minimum);
  });
});

it("reads every colour token", () => {
  expect(tokens(0).size).toBeGreaterThanOrEqual(18);
});
