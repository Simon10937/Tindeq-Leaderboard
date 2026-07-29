import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  requireAccount: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/groups/queries", () => ({ requireAccount: mocks.requireAccount }));

import { saveDashboardHome } from "./actions";

describe("saveDashboardHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAccount.mockResolvedValue({
      profile: { id: "user-1" },
      supabase: { from: mocks.from },
    });
  });

  it("persists a validated home with its comparison dimensions", async () => {
    arrangeQueries({ membership: { group_id: "group-1" }, protocol: { id: "protocol-1" } });
    const form = dashboardForm({ hand: "left", basis: "relative", view: "progress" });

    await expect(saveDashboardHome(form)).rejects.toThrow("REDIRECT:/dashboard?group=group-1&protocol=protocol-1&view=progress&hand=left&basis=relative&message=Home+view+saved.");
    expect(mocks.upsert).toHaveBeenCalledWith({
      user_id: "user-1",
      group_id: "group-1",
      protocol_version_id: "protocol-1",
      view: "progress",
      hand: "left",
      score_basis: "relative",
    });
  });

  it("does not persist when membership is missing", async () => {
    arrangeQueries({ membership: null, protocol: { id: "protocol-1" } });

    await expect(saveDashboardHome(dashboardForm())).rejects.toThrow("REDIRECT:/dashboard?message=Choose+a+group+you+belong+to.");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("reports validation query failures as save failures", async () => {
    arrangeQueries({ membership: null, protocol: null, membershipError: { message: "offline" } });

    await expect(saveDashboardHome(dashboardForm())).rejects.toThrow("REDIRECT:/dashboard?message=Unable+to+save+your+home.");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("uses safe defaults and reports persistence failures", async () => {
    arrangeQueries({ membership: { group_id: "group-1" }, protocol: { id: "protocol-1" }, upsertError: { message: "denied" } });
    const form = dashboardForm({ hand: "invalid", basis: "invalid", view: "invalid" });

    await expect(saveDashboardHome(form)).rejects.toThrow("message=Unable+to+save+your+home.");
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ view: "leaderboard", hand: "right", score_basis: "absolute" }));
  });
});

function dashboardForm(values: { hand?: string; basis?: string; view?: string } = {}) {
  const form = new FormData();
  form.set("groupId", "group-1");
  form.set("protocolId", "protocol-1");
  form.set("hand", values.hand ?? "right");
  form.set("basis", values.basis ?? "absolute");
  form.set("view", values.view ?? "leaderboard");
  return form;
}

function arrangeQueries(input: {
  membership: unknown;
  protocol: unknown;
  membershipError?: unknown;
  protocolError?: unknown;
  upsertError?: unknown;
}) {
  const membership = chain({ data: input.membership, error: input.membershipError ?? null });
  const protocol = chain({ data: input.protocol, error: input.protocolError ?? null });
  mocks.upsert.mockResolvedValue({ error: input.upsertError ?? null });
  mocks.from.mockImplementation((table: string) => {
    if (table === "group_memberships") return membership;
    if (table === "protocol_versions") return protocol;
    return { upsert: mocks.upsert };
  });
}

function chain(result: unknown) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "in"]) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => result);
  return query;
}
