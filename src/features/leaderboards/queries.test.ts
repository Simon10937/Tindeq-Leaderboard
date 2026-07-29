import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  order: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));

import { getLeaderboard } from "./queries";

describe("getLeaderboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const result = {
      data: [{
        session_id: "session-1",
        group_id: "group-1",
        owner_id: "climber-1",
        display_name: "Ava Chen",
        protocol_version_id: "protocol-1",
        protocol_name: "20 mm Half Crimp RFD",
        assessment_type: "rfd",
        hand: "right",
        attempt_id: "attempt-1",
        metric_run_id: "metric-1",
        absolute_score: 1310,
        relative_score: 209.6,
        authoritative_captured_at: "2026-07-19T17:00:00.000Z",
        trust_status: "admin_verified",
        published_at: "2026-07-19T17:10:00.000Z",
      }],
      error: null,
    };
    mocks.order.mockResolvedValue(result);
    mocks.lte.mockReturnValue({ order: mocks.order });
    mocks.gte.mockReturnValue({ lte: mocks.lte, order: mocks.order });
    mocks.eq.mockReturnValue({ gte: mocks.gte, lte: mocks.lte, order: mocks.order });
    mocks.rpc.mockReturnValue({ eq: mocks.eq, gte: mocks.gte, lte: mocks.lte, order: mocks.order });
  });

  it("loads sanitized peer scores through the authorized leaderboard RPC", async () => {
    const rows = await getLeaderboard({
      groupId: "group-1",
      protocolVersionId: "protocol-1",
      filters: { basis: "absolute", hand: "right", trust: "all", window: { kind: "all_time" } },
    });

    expect(mocks.rpc).toHaveBeenCalledWith("list_leaderboard_entries", {
      target_group: "group-1",
      target_protocol_version: "protocol-1",
      target_hand: "right",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ displayName: "Ava Chen", selectedScore: 1310, rank: 1 });
  });
});
