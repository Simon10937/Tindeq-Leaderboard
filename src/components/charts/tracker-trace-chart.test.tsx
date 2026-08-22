import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrackerTraceChart } from "./tracker-trace-chart";
import type { TrackerSession } from "@/features/tracker/types";

const session: TrackerSession = {
  id: "1",
  mode: "endurance",
  parserVersion: "test",
  filename: "endurance.csv",
  sourceSummary: "Endurance",
  vendorMetadata: {},
  metrics: [],
  trace: { elapsedUs: [0, 1_000_000], forceN: [10, 20] },
  warnings: [],
  grip: "20mm",
  testedAt: "2026-08-20T10:00:00.000Z",
  createdAt: "2026-08-20T10:00:00.000Z",
};

describe("TrackerTraceChart", () => {
  it("renders force trace with accessible sample table", () => {
    const markup = renderToStaticMarkup(<TrackerTraceChart session={session} />);

    expect(markup).toContain("endurance.csv");
    expect(markup).toContain("Force samples");
    expect(markup).toContain("20.00");
  });
});
