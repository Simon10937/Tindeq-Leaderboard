import type { ProgressPoint, TrackerMetricKey, TrackerMode } from "@/features/tracker/types";
import { CHART_DASHES as DASHES, dashLabel, forceNToKgf, formatCompactDate, formatMetricValue, formatProgressMetricLabel, formatScore, scale } from "./chart-utils";

const WIDTH = 760;
const HEIGHT = 420;

type Props = Readonly<{
  points: readonly ProgressPoint[];
  selectedMetric?: TrackerMetricKey;
  referenceLines?: readonly ProgressReferenceLine[];
}>;
export type ProgressReferenceLine = Readonly<{
  key: string;
  label: string;
  value: number;
  unit: "N";
  metricKey: TrackerMetricKey;
  color: string;
  dash?: string;
}>;
type ProgressSeries = {
  key: string;
  label: string;
  fullLabel: string;
  points: ProgressPoint[];
  color: string;
  dash: string;
  styleLabel: string;
};

export function TrackerProgressChart({ points, selectedMetric, referenceLines = [] }: Props) {
  const visible = selectedMetric ? points.filter((point) => point.metricKey === selectedMetric) : points;
  if (visible.length === 0) return <p role="status">No progress metrics are available for these filters yet.</p>;

  const series = groupProgressSeries(visible, selectedMetric === undefined);
  const visibleReferenceLines = referenceLines.filter((line) => !selectedMetric || line.metricKey === selectedMetric);
  const times = visible.map((point) => Date.parse(point.testedAt));
  const values = [...visible.map(displayValue), ...visibleReferenceLines.map(displayReferenceLineValue)];
  const timeMin = Math.min(...times);
  const timeMax = Math.max(...times);
  const valueMin = Math.min(...values);
  const valueMax = Math.max(...values);
  const chartPad = { left: 34, right: 22, top: 28, bottom: 34 };
  const x = (time: number) => scale(time, timeMin, timeMax, chartPad.left, WIDTH - chartPad.right);
  const y = (value: number) => scale(value, valueMin, valueMax, HEIGHT - chartPad.bottom, chartPad.top);
  const dateTicks = compactDateTicks(visible);
  const valueTicks = compactValueTicks(valueMin, valueMax);

  return (
    <figure className="tracker-chart" aria-labelledby="progress-chart-title">
      <figcaption id="progress-chart-title">Progress over time</figcaption>
      <ul className="chart-legend" aria-label="Visible progress chart series">
        {series.map((item) => (
          <li key={item.key}>
            <svg aria-hidden="true" focusable="false" viewBox="0 0 34 8" style={{ color: item.color }}>
              <path d="M2 4H32" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" strokeDasharray={item.dash} />
            </svg>
            <span>{item.label}</span>
          </li>
        ))}
        {visibleReferenceLines.map((line) => (
          <li key={line.key}>
            <svg aria-hidden="true" focusable="false" viewBox="0 0 34 8" style={{ color: line.color }}>
              <path d="M2 4H32" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" strokeDasharray={line.dash} />
            </svg>
            <span>{line.label}</span>
          </li>
        ))}
      </ul>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="progress-chart-title" aria-describedby="progress-chart-description">
        <desc id="progress-chart-description">Progress force values in kilograms over time. The same values are listed in the table after the chart.</desc>
        <line x1={chartPad.left} y1={HEIGHT - chartPad.bottom} x2={WIDTH - chartPad.right} y2={HEIGHT - chartPad.bottom} stroke="currentColor" />
        <line x1={chartPad.left} y1={chartPad.top} x2={chartPad.left} y2={HEIGHT - chartPad.bottom} stroke="currentColor" />
        <text className="axis-label" x={chartPad.left} y={16}>Force (kg)</text>
        <text className="axis-label" x={WIDTH - chartPad.right} y={HEIGHT - 6} textAnchor="end">Date</text>
        {valueTicks.map((tick) => (
          <g key={`value-${tick}`}>
            <line x1={chartPad.left - 4} y1={y(tick)} x2={chartPad.left} y2={y(tick)} stroke="currentColor" />
            <text className="axis-tick" x={chartPad.left - 7} y={y(tick) + 4} textAnchor="end">{formatScore(tick)}</text>
          </g>
        ))}
        {dateTicks.map((point) => (
          <g key={`date-${point.testedAt}`}>
            <line x1={x(Date.parse(point.testedAt))} y1={HEIGHT - chartPad.bottom} x2={x(Date.parse(point.testedAt))} y2={HEIGHT - chartPad.bottom + 4} stroke="currentColor" />
            <text className="axis-tick" x={x(Date.parse(point.testedAt))} y={HEIGHT - chartPad.bottom + 17} textAnchor="middle">{formatCompactDate(point.testedAt)}</text>
          </g>
        ))}
        {series.map((item) => {
          const ordered = [...item.points].sort((a, b) => Date.parse(a.testedAt) - Date.parse(b.testedAt));
          const path = ordered.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${x(Date.parse(point.testedAt))} ${y(displayValue(point))}`).join(" ");
          return (
            <g key={item.key}>
              <path d={path} fill="none" stroke={item.color} strokeWidth="3" strokeDasharray={item.dash} />
              {ordered.map((point) => (
                <circle key={`${point.sessionId}-${point.metricKey}`} cx={x(Date.parse(point.testedAt))} cy={y(displayValue(point))} r="3.25" style={{ stroke: item.color }}>
                  <title>{`${item.fullLabel}: ${formatMetricValue(point)} on ${formatCompactDate(point.testedAt)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {visibleReferenceLines.map((line) => (
          <line
            key={line.key}
            x1={chartPad.left}
            y1={y(displayReferenceLineValue(line))}
            x2={WIDTH - chartPad.right}
            y2={y(displayReferenceLineValue(line))}
            stroke={line.color}
            strokeWidth="2.5"
            strokeDasharray={line.dash}
            strokeLinecap="round"
          >
            <title>{`${line.label}: ${formatMetricValue(line)}`}</title>
          </line>
        ))}
      </svg>
      <details className="chart-details">
        <summary>Show data</summary>
        <ul className="chart-key" aria-label="Progress chart series">
          {series.map((item) => <li key={item.key}><strong>{item.fullLabel}</strong> - {item.styleLabel}</li>)}
          {visibleReferenceLines.map((line) => <li key={line.key}><strong>{line.label}</strong> - {formatMetricValue(line)} reference line</li>)}
        </ul>
        <div className="table-scroll">
          <table>
            <caption>Progress data</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">Test</th><th scope="col">Grip</th><th scope="col">Metric</th><th scope="col">Value</th></tr></thead>
            <tbody>
              {visible.map((point) => (
                <tr key={`${point.sessionId}-${point.metricKey}`}>
                  <td>{formatCompactDate(point.testedAt)}</td>
                  <td>{modeLabel(point.mode)}</td>
                  <td>{point.hand ? `${point.grip} (${point.hand})` : point.grip}</td>
                  <td>{chartMetricLabel(point)}</td>
                  <td>{formatMetricValue(point)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function groupProgressSeries(points: readonly ProgressPoint[], includeMetricInLegend: boolean) {
  const grouped = new Map<string, ProgressSeries>();
  for (const point of points) {
    const handKey = point.hand ?? "both";
    const key = [point.mode, point.grip, handKey, point.metricKey].join(":");
    const style = seriesStyle(point);
    const fullLabel = `${modeLabel(point.mode)} - ${point.grip} - ${handLabel(point.hand)} - ${chartMetricLabel(point)}`;
    const label = includeMetricInLegend ? `${handLabel(point.hand)} ${shortMetricLabel(point)}` : handLabel(point.hand);
    const item = grouped.get(key) ?? { key, label, fullLabel, points: [], ...style };
    item.points.push(point);
    grouped.set(key, item);
  }
  return [...grouped.values()];
}

function seriesStyle(point: ProgressPoint) {
  const metricDashIndex = metricDashIndexForPoint(point);
  return {
    color: handColor(point.hand),
    dash: DASHES[metricDashIndex % DASHES.length] ?? "",
    styleLabel: `${handLabel(point.hand)} color, ${dashLabel(metricDashIndex)}`,
  };
}

function metricDashIndexForPoint(point: ProgressPoint) {
  if (point.metricKey === "peakForceN") return 0;
  if (point.metricKey.endsWith("AverageForceN")) return 1;
  return 2;
}

function handColor(hand?: ProgressPoint["hand"]) {
  if (hand === "left") return "#0f766e";
  if (hand === "right") return "#b45309";
  return "#334155";
}

function handLabel(hand?: ProgressPoint["hand"]) {
  if (hand === "left") return "Left";
  if (hand === "right") return "Right";
  if (hand === "both") return "Both";
  return "Unspecified";
}

function shortMetricLabel(point: ProgressPoint) {
  if (point.metricKey === "peakForceN") return "max";
  if (point.metricKey.endsWith("AverageForceN")) return "avg";
  if (point.metricKey === "criticalForceN") return "critical";
  return "metric";
}

function displayValue(point: ProgressPoint) {
  if (point.unit === "N" || point.metricKey.endsWith("ForceN")) return forceNToKgf(point.value);
  return point.value;
}

function displayReferenceLineValue(line: ProgressReferenceLine) {
  if (line.unit === "N" || line.metricKey.endsWith("ForceN")) return forceNToKgf(line.value);
  return line.value;
}

function compactDateTicks(points: readonly ProgressPoint[]) {
  const ordered = [...points].sort((a, b) => Date.parse(a.testedAt) - Date.parse(b.testedAt));
  const uniqueByDay = ordered.filter((point, index) =>
    index === 0 || formatCompactDate(point.testedAt) !== formatCompactDate(ordered[index - 1].testedAt));
  if (uniqueByDay.length <= 3) return uniqueByDay;
  return [uniqueByDay[0], uniqueByDay[Math.floor(uniqueByDay.length / 2)], uniqueByDay[uniqueByDay.length - 1]];
}

function compactValueTicks(min: number, max: number) {
  if (min === max) return [min];
  return [min, (min + max) / 2, max];
}

function modeLabel(mode: TrackerMode) {
  if (mode === "endurance") return "Endurance";
  if (mode === "repeater") return "Repeater";
  if (mode === "peak_force") return "Peak force";
  return "Trace only";
}

function chartMetricLabel(point: ProgressPoint) {
  if (point.metricKey === "peakForceN") return "Max force";
  return formatProgressMetricLabel(point);
}
