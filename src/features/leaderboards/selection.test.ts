import { describe, expect, it } from "vitest";

import { selectLeaderboard, selectProgressEntries } from "./selection";
import type { LeaderboardEntry } from "./types";

const rows: LeaderboardEntry[] = [
  entry("alice-jan", "alice", "Alice", "2026-01-10T10:00:00Z", 100, 120),
  entry("alice-feb", "alice", "Alice", "2026-02-01T10:00:00Z", 110, null),
  entry("alice-mar", "alice", "Alice", "2026-03-01T10:00:00Z", 105, 130),
  entry("bob-jan", "bob", "Bob", "2026-01-15T10:00:00Z", 110, 115),
  entry("cara-jan", "cara", "Cara", "2026-01-20T10:00:00Z", 90, 130),
];

describe("selectLeaderboard", () => {
  it("selects absolute and relative winners independently and shares tie ranks", () => {
    const absolute = selectLeaderboard(rows, { basis: "absolute", window: { kind: "all_time" } });
    const relative = selectLeaderboard(rows, { basis: "relative", window: { kind: "all_time" } });

    expect(absolute.map(({ attemptId, rank }) => [attemptId, rank])).toEqual([
      ["bob-jan", 1],
      ["alice-feb", 1],
      ["cara-jan", 3],
    ]);
    expect(relative.map(({ attemptId, rank }) => [attemptId, rank])).toEqual([
      ["cara-jan", 1],
      ["alice-mar", 1],
      ["bob-jan", 3],
    ]);
  });

  it("uses each member's most recent eligible result for latest", () => {
    const latest = selectLeaderboard(rows, { basis: "absolute", window: { kind: "latest" } });
    expect(latest.find((row) => row.ownerId === "alice")?.attemptId).toBe("alice-mar");
  });

  it("filters date windows and trust before selecting winners", () => {
    const verifiedRows = rows.map((row, index) => ({
      ...row,
      trustStatus: index === 0 ? ("admin_verified" as const) : row.trustStatus,
    }));
    const selected = selectLeaderboard(verifiedRows, {
      basis: "absolute",
      trust: "admin_verified",
      window: { kind: "custom", from: "2026-01-01", to: "2026-01-31" },
    });
    expect(selected.map((row) => row.attemptId)).toEqual(["alice-jan"]);
  });

  it("supports rolling 30 and 90 day windows", () => {
    const now = new Date("2026-03-15T12:00:00Z");
    const thirtyDays = selectLeaderboard(rows, { basis: "absolute", window: { kind: "days", days: 30 }, now });
    const ninetyDays = selectLeaderboard(rows, { basis: "absolute", window: { kind: "days", days: 90 }, now });
    expect(thirtyDays.map((row) => row.attemptId)).toEqual(["alice-mar"]);
    expect(ninetyDays).toHaveLength(3);
  });

  it("keeps protocol version and hand comparisons separate", () => {
    const mixed = [
      ...rows,
      { ...rows[0], attemptId: "other-hand", hand: "left" as const, absoluteScore: 999 },
      { ...rows[0], attemptId: "other-protocol", protocolVersionId: "protocol-2", absoluteScore: 999 },
    ];
    const selected = selectLeaderboard(mixed, {
      basis: "absolute",
      hand: "right",
      protocolVersionId: "protocol-1",
      window: { kind: "all_time" },
    });
    expect(selected.some((row) => row.attemptId === "other-hand" || row.attemptId === "other-protocol")).toBe(false);
  });

  it("omits null relative scores", () => {
    const onlyMissing = [entry("missing", "alice", "Alice", "2026-01-10T10:00:00Z", 100, null)];
    expect(selectLeaderboard(onlyMissing, { basis: "relative", window: { kind: "all_time" } })).toEqual([]);
  });
});

describe("selectProgressEntries", () => {
  it("returns eligible history in chronological order", () => {
    const progress = selectProgressEntries(rows, {
      basis: "absolute",
      window: { kind: "all_time" },
    });
    expect(progress.map((row) => row.attemptId)).toEqual([
      "alice-jan",
      "bob-jan",
      "cara-jan",
      "alice-feb",
      "alice-mar",
    ]);
  });
});

function entry(
  attemptId: string,
  ownerId: string,
  displayName: string,
  authoritativeCapturedAt: string,
  absoluteScore: number,
  relativeScore: number | null,
): LeaderboardEntry {
  return {
    sessionId: `session-${attemptId}`,
    groupId: "group-1",
    ownerId,
    displayName,
    protocolVersionId: "protocol-1",
    protocolName: "RFD",
    assessmentType: "rfd",
    hand: "right",
    attemptId,
    metricRunId: `metric-${attemptId}`,
    absoluteScore,
    relativeScore,
    authoritativeCapturedAt,
    trustStatus: "self_attested",
    publishedAt: authoritativeCapturedAt,
  };
}
