/** Scaling for the small line charts drawn by the web (SVG) and mobile (react-native-svg) apps. */

export interface SeriesPoint {
  /** ISO date (YYYY-MM-DD). */
  day: string;
  value: number;
}

export interface ScaledPoint extends SeriesPoint {
  x: number;
  y: number;
}

export interface ScaledSeries {
  points: ScaledPoint[];
  /** SVG path through the points, or "" when there are none. */
  path: string;
  /** The value range drawn from the bottom to the top edge. */
  min: number;
  max: number;
}

const DAY_MS = 86_400_000;

/** Places a series in a width x height box: days spread left to right, values bottom to top,
 * with `minSpan` of headroom so a flat line is not drawn as a jagged one. */
export function scaleSeries(
  series: readonly SeriesPoint[],
  width: number,
  height: number,
  { padding = 8, minSpan = 1 }: { padding?: number; minSpan?: number } = {},
): ScaledSeries {
  if (series.length === 0) return { points: [], path: "", min: 0, max: 0 };
  const ordered = [...series].sort((a, b) => a.day.localeCompare(b.day));
  const time = (day: string) => Date.parse(`${day}T00:00:00Z`);
  const first = time(ordered[0]!.day);
  const days = Math.max(1, (time(ordered[ordered.length - 1]!.day) - first) / DAY_MS);
  const values = ordered.map((p) => p.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const extra = Math.max(0, minSpan - (high - low)) / 2;
  const min = low - extra;
  const max = high + extra;
  const span = max - min || 1;
  const points = ordered.map((p) => ({
    ...p,
    x: padding + (((time(p.day) - first) / DAY_MS) / days) * (width - 2 * padding),
    y: padding + ((max - p.value) / span) * (height - 2 * padding),
  }));
  const path = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return { points, path, min, max };
}
