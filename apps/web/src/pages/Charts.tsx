import { scaleSeries, type SeriesPoint } from "@buddy/shared";

const WIDTH = 640;
const HEIGHT = 180;
const PAD = 40;

export interface Series {
  name: string;
  points: readonly SeriesPoint[];
  /** CSS class for the colour (see styles.css). */
  tone: "accent" | "warm" | "muted";
}

function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Lines over a shared day range, with the value range and the first and last day written on the axes. */
export function LineChart({
  label,
  days,
  series,
  unit,
  values,
}: {
  label: string;
  days: readonly [string, string];
  series: readonly Series[];
  unit: string;
  values?: readonly [number, number];
}) {
  const all = series.flatMap((s) => s.points.map((p) => p.value));
  if (all.length === 0) return null;
  const range = values ?? ([Math.min(...all), Math.max(...all)] as const);
  const options = { padding: PAD, days, values: range, minSpan: 1 };
  const scaled = series.map((s) => ({ ...s, ...scaleSeries(s.points, WIDTH, HEIGHT, options) }));
  const { min, max } = scaled[0]!;
  return (
    <figure className="chart-figure">
      <svg className="chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
        <text x={2} y={PAD + 4} className="axis">{`${Math.round(max)} ${unit}`.trim()}</text>
        <text x={2} y={HEIGHT - PAD + 4} className="axis">{`${Math.round(min)} ${unit}`.trim()}</text>
        <text x={PAD} y={HEIGHT - 6} className="axis">
          {shortDay(days[0])}
        </text>
        <text x={WIDTH - PAD} y={HEIGHT - 6} className="axis" textAnchor="end">
          {shortDay(days[1])}
        </text>
        {scaled.map((s) => (
          <g key={s.name} className={`tone-${s.tone}`}>
            <path d={s.path} />
            {s.points.length <= 60 && s.points.map((p) => <circle key={p.day} cx={p.x} cy={p.y} r={2.5} />)}
          </g>
        ))}
      </svg>
      {series.length > 1 && (
        <figcaption className="legend">
          {series.map((s) => (
            <span key={s.name} className={`tone-${s.tone}`}>
              {s.name}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

/** One bar per day over a day range, with an optional target line. */
export function BarChart({
  label,
  days,
  points,
  target,
  unit,
}: {
  label: string;
  days: readonly [string, string];
  points: readonly SeriesPoint[];
  target: number | null;
  unit: string;
}) {
  if (points.length === 0) return null;
  const top = Math.max(target ?? 0, ...points.map((p) => p.value));
  const options = { padding: PAD, days, values: [0, top] as const };
  const scaled = scaleSeries(points, WIDTH, HEIGHT, options);
  const totalDays = Math.max(1, (Date.parse(days[1]) - Date.parse(days[0])) / 86_400_000 + 1);
  const barWidth = Math.max(1.5, ((WIDTH - 2 * PAD) / totalDays) * 0.7);
  const base = HEIGHT - PAD;
  const targetY =
    target === null
      ? null
      : scaleSeries([{ day: days[0], value: target }], WIDTH, HEIGHT, options).points[0]!.y;
  return (
    <svg className="chart bars" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
      <text x={2} y={PAD + 4} className="axis">{`${Math.round(top)} ${unit}`.trim()}</text>
      <text x={PAD} y={HEIGHT - 6} className="axis">
        {shortDay(days[0])}
      </text>
      <text x={WIDTH - PAD} y={HEIGHT - 6} className="axis" textAnchor="end">
        {shortDay(days[1])}
      </text>
      {scaled.points.map((p) => (
        <rect key={p.day} x={p.x - barWidth / 2} y={p.y} width={barWidth} height={base - p.y} />
      ))}
      {targetY !== null && <line className="target" x1={PAD} x2={WIDTH - PAD} y1={targetY} y2={targetY} />}
    </svg>
  );
}
