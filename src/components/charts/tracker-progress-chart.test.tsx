import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrackerProgressChart } from "./tracker-progress-chart";
import type { ProgressPoint } from "@/features/tracker/types";

const points: ProgressPoint[] = [
  { sessionId: "1", mode: "endurance", grip: "20mm", testedAt: "2026-08-20T10:00:00.000Z", metricKey: "criticalForceN", label: "Critical force", value: 100, unit: "N" },
  { sessionId: "2", mode: "repeater", grip: "jug", testedAt: "2026-08-21T10:00:00.000Z", metricKey: "peakForceN", label: "Peak force", value: 150, unit: "N" },
];

describe("TrackerProgressChart", () => {
  it("renders a sparse chart with detail hidden behind a disclosure", () => {
    const markup = renderToStaticMarkup(<TrackerProgressChart points={points} />);

    expect(markup).toContain("Endurance - 20mm");
    expect(markup).toContain("Repeater - jug");
    expect(markup).toContain("class=\"chart-legend\"");
    expect(markup).toContain("<span>Unspecified max</span>");
    expect(markup).toContain("<details class=\"chart-details\"><summary>Show data</summary>");
    expect(markup).toContain("Progress data");
  });

  it("reports empty selected metric states", () => {
    const markup = renderToStaticMarkup(<TrackerProgressChart points={points} selectedMetric="repeaterAverageForceN" />);

    expect(markup).toContain("No progress metrics are available");
  });

  it("plots repeater average and peak force together when no metric filter is selected", () => {
    const markup = renderToStaticMarkup(<TrackerProgressChart points={[
      { sessionId: "1", mode: "repeater", grip: "half crimp", testedAt: "2026-08-20T10:00:00.000Z", metricKey: "repeaterAverageForceN", label: "Repeater average force", value: 120, unit: "N" },
      { sessionId: "1", mode: "repeater", grip: "half crimp", testedAt: "2026-08-20T10:00:00.000Z", metricKey: "peakForceN", label: "Peak force", value: 150, unit: "N" },
    ]} />);

    expect(markup).toContain("<span>Unspecified avg</span>");
    expect(markup).toContain("<span>Unspecified max</span>");
  });

  it("keeps peak-force points split by hand metadata", () => {
    const markup = renderToStaticMarkup(<TrackerProgressChart points={[
      { sessionId: "manual", mode: "peak_force", grip: "half crimp", hand: "left", testedAt: "2026-08-24T12:00:00.000Z", metricKey: "peakForceN", label: "Max force", value: 39.2266, unit: "N" },
      { sessionId: "upload", mode: "peak_force", grip: "half crimp", hand: "right", testedAt: "2026-08-26T11:42:00.000Z", metricKey: "peakForceN", label: "Max force", value: 48.249, unit: "N" },
    ]} />);

    expect(markup).toContain("<span>Left max</span>");
    expect(markup).toContain("<span>Right max</span>");
    expect(markup).toContain("color:#0f766e");
    expect(markup).toContain("color:#b45309");
    expect(markup).toContain("M ");
  });

  it("uses hand-only legend labels when one metric is selected", () => {
    const markup = renderToStaticMarkup(<TrackerProgressChart selectedMetric="peakForceN" points={[
      { sessionId: "manual", mode: "peak_force", grip: "half crimp", hand: "left", testedAt: "2026-08-24T12:00:00.000Z", metricKey: "peakForceN", label: "Max force", value: 39.2266, unit: "N" },
      { sessionId: "upload", mode: "peak_force", grip: "half crimp", hand: "right", testedAt: "2026-08-26T11:42:00.000Z", metricKey: "peakForceN", label: "Max force", value: 48.249, unit: "N" },
    ]} />);

    expect(markup).toContain("<span>Left</span>");
    expect(markup).toContain("<span>Right</span>");
    expect(markup).not.toContain("<span>Left max</span>");
  });

  it("renders kg labels, compact dates, and axis titles", () => {
    const markup = renderToStaticMarkup(<TrackerProgressChart points={points} />);

    expect(markup).toContain("Force (kg)");
    expect(markup).toContain("Date");
    expect(markup).toContain("20/8");
    expect(markup).toContain("10.2 kg");
    expect(markup).not.toContain("100 N");
  });
});
