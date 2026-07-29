import type { ProgressEntry } from "@/features/leaderboards/types";
import { CHART_DASHES as DASHES, CHART_HEIGHT as HEIGHT, CHART_PADDING as PAD, CHART_WIDTH as WIDTH, dashLabel, formatDate, formatScore, scale, trustLabel } from "./chart-utils";

export function ProgressChart({ entries }: { entries: readonly ProgressEntry[] }) {
  if (entries.length === 0) return <p role="status">No progress results match these filters yet.</p>;

  const series = groupByMember(entries);
  const times = entries.map((entry) => Date.parse(entry.authoritativeCapturedAt));
  const scores = entries.map((entry) => entry.selectedScore);
  const timeMin = Math.min(...times);
  const timeMax = Math.max(...times);
  const scoreMin = Math.min(...scores);
  const scoreMax = Math.max(...scores);
  const x = (time: number) => scale(time, timeMin, timeMax, PAD, WIDTH - PAD);
  const y = (score: number) => scale(score, scoreMin, scoreMax, HEIGHT - PAD, PAD);
  const unit = entries[0].basis === "absolute" ? "N/s" : "%BW/s";

  return (
    <figure aria-labelledby="progress-chart-title" style={{ margin: 0 }}>
      <figcaption id="progress-chart-title"><strong>Progress over time ({unit})</strong></figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-describedby="progress-chart-description" style={{ width: "100%", height: "auto", marginTop: 16 }}>
        <desc id="progress-chart-description">Chronological RFD results. Every plotted value is repeated in the table below.</desc>
        <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} stroke="currentColor" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={HEIGHT - PAD} stroke="currentColor" />
        {series.map(({ ownerId, displayName, points }, index) => {
          const ordered = [...points].sort((a, b) => Date.parse(a.authoritativeCapturedAt) - Date.parse(b.authoritativeCapturedAt));
          const path = ordered.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${x(Date.parse(point.authoritativeCapturedAt))} ${y(point.selectedScore)}`).join(" ");
          return (
            <g key={ownerId}>
              <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={DASHES[index % DASHES.length]} aria-label={`${displayName}, ${dashLabel(index)}`} tabIndex={0} />
              {ordered.map((point) => (
                <circle key={point.attemptId} cx={x(Date.parse(point.authoritativeCapturedAt))} cy={y(point.selectedScore)} r="5" fill="var(--paper)" stroke="currentColor" strokeWidth="3" tabIndex={0} aria-label={`${displayName}, ${formatDate(point.authoritativeCapturedAt)}, ${formatScore(point.selectedScore)} ${unit}`}>
                  <title>{displayName}: {formatScore(point.selectedScore)} {unit} on {formatDate(point.authoritativeCapturedAt)}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <ul aria-label="Chart series key" style={{ display: "flex", flexWrap: "wrap", gap: 18, padding: 0, listStyle: "none" }}>
        {series.map((item, index) => <li key={item.ownerId}><strong>{item.displayName}</strong> — {dashLabel(index)}</li>)}
      </ul>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <caption style={{ textAlign: "left", paddingBlock: 12 }}>Tabular progress data</caption>
          <thead><tr><th scope="col">Climber</th><th scope="col">Date</th><th scope="col">Hand</th><th scope="col">Trust</th><th scope="col">Score ({unit})</th></tr></thead>
          <tbody>{entries.map((entry) => <tr key={entry.attemptId}><th scope="row">{entry.displayName}</th><td>{formatDate(entry.authoritativeCapturedAt)}</td><td>{entry.hand}</td><td>{trustLabel(entry.trustStatus)}</td><td>{formatScore(entry.selectedScore)}</td></tr>)}</tbody>
        </table>
      </div>
    </figure>
  );
}

function groupByMember(entries: readonly ProgressEntry[]) {
  const grouped = new Map<string, { ownerId: string; displayName: string; points: ProgressEntry[] }>();
  for (const entry of entries) {
    const item = grouped.get(entry.ownerId) ?? { ownerId: entry.ownerId, displayName: entry.displayName, points: [] };
    item.points.push(entry);
    grouped.set(entry.ownerId, item);
  }
  return [...grouped.values()];
}
