import { scaleSeries, type SeriesPoint } from "@buddy/shared";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import { colors, font, space } from "../theme";

const WIDTH = 320;
const HEIGHT = 150;
const PAD = 30;
const DAY_MS = 86_400_000;

export const TONE = { accent: colors.primary, warm: "#c2410c", muted: "#9ca3af" } as const;

export interface Series {
  name: string;
  points: readonly SeriesPoint[];
  tone: keyof typeof TONE;
}

function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function Axes({ days, top, bottom, unit }: { days: readonly [string, string]; top: number; bottom?: number; unit: string }) {
  const precise = bottom !== undefined && top - bottom < 5;
  const value = (v: number) => `${precise ? v.toFixed(1) : Math.round(v)} ${unit}`.trim();
  return (
    <>
      <SvgText x={2} y={PAD + 4} fontSize={10} fill={colors.muted}>
        {value(top)}
      </SvgText>
      {bottom !== undefined && (
        <SvgText x={2} y={HEIGHT - PAD + 4} fontSize={10} fill={colors.muted}>
          {value(bottom)}
        </SvgText>
      )}
      <SvgText x={PAD} y={HEIGHT - 6} fontSize={10} fill={colors.muted}>
        {shortDay(days[0])}
      </SvgText>
      <SvgText x={WIDTH - PAD} y={HEIGHT - 6} fontSize={10} fill={colors.muted} textAnchor="end">
        {shortDay(days[1])}
      </SvgText>
    </>
  );
}

/** Lines over a shared day range; `label` says in words what the chart shows. */
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
    <View style={styles.figure}>
      <Svg
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
      >
        <Axes days={days} top={max} bottom={min} unit={unit} />
        {scaled.map((s) => (
          <Path key={s.name} d={s.path} stroke={TONE[s.tone]} strokeWidth={2} fill="none" />
        ))}
        {scaled.map((s) =>
          s.points.length <= 60
            ? s.points.map((p) => <Circle key={`${s.name}${p.day}`} cx={p.x} cy={p.y} r={2.5} fill={TONE[s.tone]} />)
            : null,
        )}
      </Svg>
      {series.length > 1 && (
        <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {series.map((s) => (
            <Text key={s.name} style={styles.legendText}>
              <Text style={{ color: TONE[s.tone] }}>―</Text> {s.name}
            </Text>
          ))}
        </View>
      )}
    </View>
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
  const top = Math.max(1, target ?? 0, ...points.map((p) => p.value));
  const options = { padding: PAD, days, values: [0, top] as const };
  const scaled = scaleSeries(points, WIDTH, HEIGHT, options);
  const totalDays = Math.max(1, (Date.parse(days[1]) - Date.parse(days[0])) / DAY_MS + 1);
  const barWidth = Math.max(1.5, ((WIDTH - 2 * PAD) / totalDays) * 0.7);
  const base = HEIGHT - PAD;
  const targetY = target === null ? null : scaleSeries([{ day: days[0], value: target }], WIDTH, HEIGHT, options).points[0]!.y;
  return (
    <Svg
      width="100%"
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <Axes days={days} top={top} unit={unit} />
      {scaled.points.map((p) => (
        <Rect key={p.day} x={p.x - barWidth / 2} y={p.y} width={barWidth} height={base - p.y} fill={TONE.accent} />
      ))}
      {targetY !== null && (
        <Line x1={PAD} x2={WIDTH - PAD} y1={targetY} y2={targetY} stroke={TONE.warm} strokeWidth={1.5} strokeDasharray="4 3" />
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  figure: { gap: space.xs },
  legend: { flexDirection: "row", gap: space.lg },
  legendText: { fontSize: font.small, fontWeight: "600", color: colors.text },
});
