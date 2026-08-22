import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrackerProgressChart } from "./tracker-progress-chart";
import type { ProgressPoint } from "@/features/tracker/types";

const points: ProgressPoint[] = [
  { sessionId: "1", mode: "endurance", grip: "20mm", testedAt: "2026-08-20T10:00:00.000Z", metricKey: "criticalForceN", label: "Critical force", value: 100, unit: "N" },
  { sessionId: "2", mode: "repeater", grip: "jug", testedAt: "2026-08-21T10:00:00.000Z", metricKey: "peakForceN", label: "Peak force", value: 150, unit: "N" },
];

describe("TrackerProgressChart", () => {
  it("renders distinct test and grip series with a data table", () => {
    const markup = renderToStaticMarkup(<TrackerProgressChart points={points} />);

    expect(markup).toContain("Endurance - 20mm");
    expect(markup).toContain("Repeater - jug");
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

    expect(markup).toContain("Repeater - half crimp - Estimated avg repeater force");
    expect(markup).toContain("Repeater - half crimp - Peak force");
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
