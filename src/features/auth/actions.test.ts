import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
  redirect: vi.fn(),
  select: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
    from: mocks.from,
  })),
}));

vi.mock("@/lib/server-env", () => ({
  getServerEnv: vi.fn(),
}));

import { signIn } from "./actions";

describe("signIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "signed-in-user" } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({ data: { status: "active" }, error: null });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ select: mocks.select });
  });

  it("checks only the authenticated profile when group peers are visible", async () => {
    const form = new FormData();
    form.set("email", "simon@example.com");
    form.set("password", "correct horse battery staple");

    await expect(signIn(form)).rejects.toThrow("NEXT_REDIRECT:/dashboard");

    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(mocks.eq).toHaveBeenCalledWith("id", "signed-in-user");
    expect(mocks.maybeSingle).toHaveBeenCalledOnce();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
