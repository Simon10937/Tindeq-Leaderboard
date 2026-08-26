import { describe, expect, it } from "vitest";
import { countSessionsThisWeek, createDraftsFromCsvFiles, gripOptionsForMode, latestComparableChange, normalizeWeeklyTarget, resolveGripFilter, visibleSessionTags } from "./tracker-app";
import type { TrackerSession } from "@/features/tracker/types";

describe("createDraftsFromCsvFiles", () => {
  it("uses Tindeq info.csv as metadata for the data CSV", () => {
    const drafts = createDraftsFromCsvFiles([
      {
        filename: "repeaters.zip / info.csv",
        byteSize: 212,
        source: "date,tag,comment,unit,reps,work dur.,pause btw. reps,sets,pause btw. sets,type,mvc,Work Level (% of mvc),Rest level (% of mvc)\n2026-20-08 19:55:38,rehab half crimp 1.5kg,,SI,8,10,20,1,120,single,1.8000000,80,15\n",
      },
      {
        filename: "repeaters.zip / data_set_1.csv",
        byteSize: 567414,
        source: ",Overall Avg\nAvg,0.0\nPeak,0.0\n,\ntime,weight\n0.054067,0.009124040603637695\n0.065411,0.008312106132507324\n",
      },
    ], "file", 1);

    expect(drafts).toHaveLength(1);
    expect(drafts[0].filename).toBe("repeaters.zip / data_set_1.csv");
    expect(drafts[0].grip).toBe("rehab half crimp");
    expect(drafts[0].testedAt).toBe("2026-08-20T19:55");
    expect(drafts[0].parsed?.mode).toBe("repeater");
    expect(drafts[0].notes).toContain("Tindeq tag: rehab half crimp 1.5kg");
    expect(drafts[0].notes).toContain("8 reps");
  });

  it("requires an explicit grip choice for unknown Tindeq tags", () => {
    const drafts = createDraftsFromCsvFiles([
      {
        filename: "repeaters.zip / info.csv",
        byteSize: 212,
        source: "date,tag,comment,unit,reps,work dur.,pause btw. reps,sets,pause btw. sets,type,mvc,Work Level (% of mvc),Rest level (% of mvc)\n2026-20-08 19:55:38,mystery grip 3kg,,SI,8,10,20,1,120,single,1.8000000,80,15\n",
      },
      {
        filename: "repeaters.zip / data_set_1.csv",
        byteSize: 567414,
        source: ",Overall Avg\nAvg,0.0\nPeak,0.0\n,\ntime,weight\n0.054067,0.009124040603637695\n0.065411,0.008312106132507324\n",
      },
    ], "file", 1);

    expect(drafts[0].grip).toBe("");
    expect(drafts[0].notes).toContain("Tindeq tag: mystery grip 3kg");
  });

  it("uses peak-force CSV metadata when no info.csv is present", () => {
    const drafts = createDraftsFromCsvFiles([
      {
        filename: "peakforce-single.csv",
        byteSize: 256,
        source: "date,tag,comment,unit,type,max weight,body weight,moment arm length,force/BW,torque,torque/BW,%BW,norm force,norm force/BW,norm torque,norm torque/BW\n2026-29-07 09:31:55,max force test ,,SI,single,10.3841515,,,,,,,,,,\n",
      },
    ], "file", 1);

    expect(drafts).toHaveLength(1);
    expect(drafts[0].parsed?.mode).toBe("peak_force");
    expect(drafts[0].testedAt).toBe("2026-07-29T09:31");
    expect(drafts[0].notes).toContain("Tindeq tag: max force test");
    expect(drafts[0].parsed?.metrics.find((metric) => metric.key === "peakForceN")).toMatchObject({ available: true });
  });

  it("parses ambiguous Tindeq metadata dates as year-day-month", () => {
    const drafts = createDraftsFromCsvFiles([
      {
        filename: "peakforce-single.csv",
        byteSize: 256,
        source: "date,tag,comment,unit,type,max weight,body weight,moment arm length,force/BW,torque,torque/BW,%BW,norm force,norm force/BW,norm torque,norm torque/BW\n2026-05-07 09:31:55,max force test ,,SI,single,10.3841515,,,,,,,,,,\n",
      },
    ], "file", 1);

    expect(drafts[0].testedAt).toBe("2026-07-05T09:31");
  });
});

describe("countSessionsThisWeek", () => {
  it("counts saved sessions in the current Monday-based week", () => {
    const baseSession: TrackerSession = {
      id: "base",
      mode: "repeater",
      parserVersion: "test",
      filename: "test.csv",
      sourceSummary: "Repeater",
      vendorMetadata: {},
      metrics: [],
      trace: { elapsedUs: [], forceN: [] },
      warnings: [],
      grip: "20mm edge",
      testedAt: "2026-08-17T10:00",
      createdAt: "2026-08-17T10:00",
    };

    expect(countSessionsThisWeek([
      baseSession,
      { ...baseSession, id: "same-week", testedAt: "2026-08-23T18:00" },
      { ...baseSession, id: "previous-week", testedAt: "2026-08-16T18:00" },
      { ...baseSession, id: "next-week", testedAt: "2026-08-24T08:00" },
    ], new Date("2026-08-22T12:00:00"))).toBe(2);
  });
});

describe("normalizeWeeklyTarget", () => {
  it("keeps weekly targets within the supported one to fourteen session range", () => {
    expect(normalizeWeeklyTarget(0)).toBe(1);
    expect(normalizeWeeklyTarget(-2)).toBe(1);
    expect(normalizeWeeklyTarget(3.6)).toBe(4);
    expect(normalizeWeeklyTarget(999)).toBe(14);
    expect(normalizeWeeklyTarget(Number.NaN)).toBeUndefined();
  });
});

describe("visibleSessionTags", () => {
  it("hides tags that duplicate the primary grip chip", () => {
    const session: TrackerSession = {
      id: "manual",
      mode: "peak_force",
      parserVersion: "test",
      filename: "manual.csv",
      sourceSummary: "Manual peak force",
      vendorMetadata: {},
      metrics: [],
      trace: { elapsedUs: [], forceN: [] },
      warnings: [],
      grip: "half crimp",
      tags: ["half crimp", "right"],
      testedAt: "2026-08-24T12:00:00.000Z",
      createdAt: "2026-08-24T12:00:00.000Z",
    };

    expect(visibleSessionTags(session)).toEqual(["right"]);
  });
});

describe("gripOptionsForMode", () => {
  const baseSession: TrackerSession = {
    id: "base",
    mode: "peak_force",
    parserVersion: "test",
    filename: "test.csv",
    sourceSummary: "Peak force",
    vendorMetadata: {},
    metrics: [],
    trace: { elapsedUs: [], forceN: [] },
    warnings: [],
    grip: "single finger",
    testedAt: "2026-08-24T12:00:00.000Z",
    createdAt: "2026-08-24T12:00:00.000Z",
  };

  it("returns only concrete grip choices for the selected mode", () => {
    expect(gripOptionsForMode([
      { ...baseSession, id: "single", grip: "single finger" },
      { ...baseSession, id: "half", grip: "half crimp" },
      { ...baseSession, id: "repeater", mode: "repeater", grip: "20mm edge" },
    ], "peak_force")).toEqual(["half crimp", "single finger"]);
  });

  it("defaults stale or empty grip selections to the leftmost grip chip", () => {
    const options = ["half crimp", "single finger"];

    expect(resolveGripFilter("", options)).toBe("half crimp");
    expect(resolveGripFilter("all", options)).toBe("half crimp");
    expect(resolveGripFilter("single finger", options)).toBe("single finger");
  });
});

describe("latestComparableChange", () => {
  it("compares peak-force points across hand metadata for the same grip", () => {
    const change = latestComparableChange([
      { sessionId: "manual", mode: "peak_force", grip: "half crimp", testedAt: "2026-08-24T12:00:00.000Z", metricKey: "peakForceN", label: "Max force", value: 39.2266, unit: "N" },
      { sessionId: "upload", mode: "peak_force", grip: "half crimp", hand: "right", testedAt: "2026-08-26T11:42:00.000Z", metricKey: "peakForceN", label: "Max force", value: 48.249, unit: "N" },
    ]);

    expect(change?.previous.sessionId).toBe("manual");
    expect(change?.delta).toBeCloseTo(9.0224);
  });

  it("keeps hand-specific comparisons for repeater and endurance points", () => {
    const change = latestComparableChange([
      { sessionId: "left", mode: "repeater", grip: "half crimp", hand: "left", testedAt: "2026-08-24T12:00:00.000Z", metricKey: "peakForceN", label: "Max force", value: 39.2266, unit: "N" },
      { sessionId: "right", mode: "repeater", grip: "half crimp", hand: "right", testedAt: "2026-08-26T11:42:00.000Z", metricKey: "peakForceN", label: "Max force", value: 48.249, unit: "N" },
    ]);

    expect(change).toBeUndefined();
  });
});
