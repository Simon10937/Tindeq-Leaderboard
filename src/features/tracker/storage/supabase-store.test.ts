import { describe, expect, it } from "vitest";
import { trackerSessionToSupabaseRow } from "./supabase-store";
import type { TrackerSession } from "@/features/tracker/types";

describe("trackerSessionToSupabaseRow", () => {
  it("stores the full tracker session with owner and query columns", () => {
    const session: TrackerSession = {
      id: "session-1",
      mode: "repeater",
      parserVersion: "test",
      filename: "repeaters.csv",
      sourceSummary: "Repeater",
      vendorMetadata: {},
      metrics: [{ key: "peakForceN", label: "Peak force", value: 120, unit: "N", available: true }],
      trace: { elapsedUs: [0], forceN: [120] },
      warnings: [],
      grip: "half crimp",
      testedAt: "2026-08-22T10:00:00.000Z",
      createdAt: "2026-08-22T10:01:00.000Z",
    };

    expect(trackerSessionToSupabaseRow(session, "user-1")).toMatchObject({
      id: "session-1",
      user_id: "user-1",
      session,
      mode: "repeater",
      grip: "half crimp",
      tested_at: "2026-08-22T10:00:00.000Z",
    });
  });
});
