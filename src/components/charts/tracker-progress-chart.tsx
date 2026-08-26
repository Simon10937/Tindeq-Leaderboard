import type { ProgressPoint, TrackerMetricKey, TrackerMode } from "@/features/tracker/types";
import { CHART_DASHES as DASHES, dashLabel, forceNToKgf, formatCompactDate, formatMetricValue, formatProgressMetricLabel, formatScore, scale } from "./chart-utils";

const WIDTH = 760;
const HEIGHT = 420;

type Props = Readonly<{
  points: readonly ProgressPoint[];
  selectedMetric?: TrackerMetricKey;
}>;

export function TrackerProgressChart({ points, selectedMetric }: Props) {
  const visible = selectedMetric ? points.filter((point) => point.metricKey === selectedMetric) : points;
  if (visible.length === 0) return <p role="status">No progress metrics are available for these filters yet.</p>;

  const series = groupProgressSeries(visible);
  const times = visible.map((point) => Date.parse(point.testedAt));
  const values = visible.map(displayValue);
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
        {series.map((item, index) => (
          <li key={item.key}>
            <svg aria-hidden="true" focusable="false" viewBox="0 0 34 8">
              <path d="M2 4H32" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" strokeDasharray={DASHES[index % DASHES.length]} />
            </svg>
            <span>{chartLegendLabel(item.points[0])}</span>
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
        {series.map((item, index) => {
          const ordered = [...item.points].sort((a, b) => Date.parse(a.testedAt) - Date.parse(b.testedAt));
          const path = ordered.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${x(Date.parse(point.testedAt))} ${y(displayValue(point))}`).join(" ");
          return (
            <g key={item.key}>
              <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={DASHES[index % DASHES.length]} />
              {ordered.map((point) => (
                <circle key={`${point.sessionId}-${point.metricKey}`} cx={x(Date.parse(point.testedAt))} cy={y(displayValue(point))} r="5">
                  <title>{`${item.label}: ${formatMetricValue(point)} on ${formatCompactDate(point.testedAt)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <details className="chart-details">
        <summary>Show data</summary>
        <ul className="chart-key" aria-label="Progress chart series">
          {series.map((item, index) => <li key={item.key}><strong>{item.label}</strong> - {dashLabel(index)}</li>)}
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

function groupProgressSeries(points: readonly ProgressPoint[]) {
  const grouped = new Map<string, { key: string; label: string; points: ProgressPoint[] }>();
  for (const point of points) {
    const key = [point.mode, point.grip, point.hand ?? "any", point.metricKey].join(":");
    const label = `${modeLabel(point.mode)} - ${point.grip}${point.hand ? ` - ${point.hand}` : ""} - ${chartMetricLabel(point)}`;
    const item = grouped.get(key) ?? { key, label, points: [] };
    item.points.push(point);
    grouped.set(key, item);
  }
  return [...grouped.values()];
}

function displayValue(point: ProgressPoint) {
  if (point.unit === "N" || point.metricKey.endsWith("ForceN")) return forceNToKgf(point.value);
  return point.value;
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

function chartLegendLabel(point: ProgressPoint) {
  if (point.metricKey === "peakForceN") return "Max force";
  if (point.metricKey.endsWith("AverageForceN")) return "Average force";
  return chartMetricLabel(point);
}
