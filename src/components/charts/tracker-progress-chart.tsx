import type { ProgressPoint, TrackerMetricKey, TrackerMode } from "@/features/tracker/types";
import { CHART_DASHES as DASHES, CHART_HEIGHT as HEIGHT, CHART_PADDING as PAD, CHART_WIDTH as WIDTH, dashLabel, forceNToKgf, formatCompactDate, formatMetricValue, formatProgressMetricLabel, formatScore, scale } from "./chart-utils";

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
  const x = (time: number) => scale(time, timeMin, timeMax, PAD, WIDTH - PAD);
  const y = (value: number) => scale(value, valueMin, valueMax, HEIGHT - PAD, PAD);
  const dateTicks = compactDateTicks(visible);
  const valueTicks = compactValueTicks(valueMin, valueMax);

  return (
    <figure className="tracker-chart" aria-labelledby="progress-chart-title">
      <figcaption id="progress-chart-title">Progress over time</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="progress-chart-title" aria-describedby="progress-chart-description">
        <desc id="progress-chart-description">Progress force values in kilograms over time. The same values are listed in the table after the chart.</desc>
        <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} stroke="currentColor" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={HEIGHT - PAD} stroke="currentColor" />
        <text className="axis-label" x={PAD} y={18}>Force (kg)</text>
        <text className="axis-label" x={WIDTH - PAD} y={HEIGHT - 8} textAnchor="end">Date</text>
        {valueTicks.map((tick) => (
          <g key={`value-${tick}`}>
            <line x1={PAD - 4} y1={y(tick)} x2={PAD} y2={y(tick)} stroke="currentColor" />
            <text className="axis-tick" x={PAD - 8} y={y(tick) + 4} textAnchor="end">{formatScore(tick)}</text>
          </g>
        ))}
        {dateTicks.map((point) => (
          <g key={`date-${point.testedAt}`}>
            <line x1={x(Date.parse(point.testedAt))} y1={HEIGHT - PAD} x2={x(Date.parse(point.testedAt))} y2={HEIGHT - PAD + 4} stroke="currentColor" />
            <text className="axis-tick" x={x(Date.parse(point.testedAt))} y={HEIGHT - PAD + 18} textAnchor="middle">{formatCompactDate(point.testedAt)}</text>
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
                <td>{formatProgressMetricLabel(point)}</td>
                <td>{formatMetricValue(point)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function groupProgressSeries(points: readonly ProgressPoint[]) {
  const grouped = new Map<string, { key: string; label: string; points: ProgressPoint[] }>();
  for (const point of points) {
    const key = [point.mode, point.grip, point.hand ?? "any", point.metricKey].join(":");
    const label = `${modeLabel(point.mode)} - ${point.grip}${point.hand ? ` - ${point.hand}` : ""} - ${formatProgressMetricLabel(point)}`;
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
  return "Trace only";
}
