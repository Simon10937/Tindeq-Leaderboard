import type { ProgressEntry, TraceCurve } from "@/features/leaderboards/types";
import { CHART_DASHES as DASHES, CHART_HEIGHT as HEIGHT, CHART_PADDING as PAD, CHART_WIDTH as WIDTH, dashLabel, downsampleSeries, formatDate, scale } from "./chart-utils";

export function ForceCurveChart({ curves, entries }: { curves: readonly TraceCurve[]; entries: readonly ProgressEntry[] }) {
  const entryByAttempt = new Map(entries.map((entry) => [entry.attemptId, entry]));
  const visible = curves.filter((curve) => entryByAttempt.has(curve.attemptId) && curve.elapsedUs.length > 0)
    .map((curve) => ({ ...curve, ...downsampleSeries(curve.elapsedUs, curve.forceN) }));
  if (visible.length === 0) return <p role="status">No force trace is available for the matching results.</p>;

  let maxTime = 0;
  let minForce = Infinity;
  let maxForce = -Infinity;
  for (const curve of visible) {
    for (const elapsedUs of curve.elapsedUs) maxTime = Math.max(maxTime, elapsedUs);
    for (const forceN of curve.forceN) {
      minForce = Math.min(minForce, forceN);
      maxForce = Math.max(maxForce, forceN);
    }
  }
  const x = (elapsedUs: number) => scale(elapsedUs, 0, maxTime, PAD, WIDTH - PAD);
  const y = (forceN: number) => scale(forceN, minForce, maxForce, HEIGHT - PAD, PAD);

  return (
    <figure aria-labelledby="force-chart-title" style={{ margin: 0 }}>
      <figcaption id="force-chart-title"><strong>Normalized force curves (N)</strong></figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-describedby="force-chart-description" style={{ width: "100%", height: "auto", marginTop: 16 }}>
        <desc id="force-chart-description">Force against elapsed time. Series use different line patterns and every plotted value is available in the tables below.</desc>
        <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} stroke="currentColor" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={HEIGHT - PAD} stroke="currentColor" />
        {visible.map((curve, index) => {
          const entry = entryByAttempt.get(curve.attemptId)!;
          const path = curve.elapsedUs.map((elapsedUs, sampleIndex) => `${sampleIndex === 0 ? "M" : "L"} ${x(elapsedUs)} ${y(curve.forceN[sampleIndex])}`).join(" ");
          return <path key={curve.attemptId} d={path} fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray={DASHES[index % DASHES.length]} tabIndex={0} aria-label={`${entry.displayName}, ${formatDate(entry.authoritativeCapturedAt)}, ${dashLabel(index)}`} />;
        })}
      </svg>
      <ul aria-label="Force curve series key" style={{ display: "flex", flexWrap: "wrap", gap: 18, padding: 0, listStyle: "none" }}>
        {visible.map((curve, index) => { const entry = entryByAttempt.get(curve.attemptId)!; return <li key={curve.attemptId}><strong>{entry.displayName}</strong>, {formatDate(entry.authoritativeCapturedAt)} — {dashLabel(index)}</li>; })}
      </ul>
      <details>
        <summary>Show equivalent plotted force values</summary>
        {visible.map((curve) => {
          const entry = entryByAttempt.get(curve.attemptId)!;
          return <div key={curve.attemptId} style={{ overflowX: "auto", marginTop: 20 }}><table style={{ width: "100%", borderCollapse: "collapse" }}><caption style={{ textAlign: "left" }}>{entry.displayName}, {formatDate(entry.authoritativeCapturedAt)}</caption><thead><tr><th scope="col">Elapsed (s)</th><th scope="col">Force (N)</th></tr></thead><tbody>{curve.elapsedUs.map((elapsedUs, index) => <tr key={`${curve.attemptId}-${elapsedUs}`}><td>{(elapsedUs / 1_000_000).toFixed(6)}</td><td>{curve.forceN[index].toFixed(3)}</td></tr>)}</tbody></table></div>;
        })}
      </details>
    </figure>
  );
}
