import type { TrackerSession } from "@/features/tracker/types";
import { CHART_HEIGHT as HEIGHT, CHART_PADDING as PAD, CHART_WIDTH as WIDTH, downsampleSeries, formatDate, scale } from "./chart-utils";

export function TrackerTraceChart({ session }: { session: TrackerSession }) {
  const trace = downsampleSeries(session.trace.elapsedUs, session.trace.forceN);
  if (trace.elapsedUs.length === 0) return <p role="status">No force trace is available for this CSV.</p>;

  const maxTime = Math.max(...trace.elapsedUs);
  const minForce = Math.min(...trace.forceN);
  const maxForce = Math.max(...trace.forceN);
  const x = (elapsedUs: number) => scale(elapsedUs, 0, maxTime, PAD, WIDTH - PAD);
  const y = (forceN: number) => scale(forceN, minForce, maxForce, HEIGHT - PAD, PAD);
  const path = trace.elapsedUs.map((elapsedUs, index) => `${index === 0 ? "M" : "L"} ${x(elapsedUs)} ${y(trace.forceN[index])}`).join(" ");

  return (
    <figure className="tracker-chart" aria-labelledby={`trace-chart-${session.id}`}>
      <figcaption id={`trace-chart-${session.id}`}>{session.filename} - {formatDate(session.testedAt)}</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Force trace for ${session.filename}`}>
        <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} stroke="currentColor" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={HEIGHT - PAD} stroke="currentColor" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" />
      </svg>
      <details>
        <summary>Show plotted force values</summary>
        <div className="table-scroll">
          <table>
            <caption>Force samples</caption>
            <thead><tr><th scope="col">Elapsed (s)</th><th scope="col">Force (N)</th></tr></thead>
            <tbody>
              {trace.elapsedUs.map((elapsedUs, index) => (
                <tr key={`${session.id}-${elapsedUs}`}>
                  <td>{(elapsedUs / 1_000_000).toFixed(3)}</td>
                  <td>{trace.forceN[index].toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
