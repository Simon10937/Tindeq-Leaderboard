import { describe, expect, it } from "vitest";
import { getPublicEnv } from "./env";

describe("getPublicEnv", () => {
  it("accepts a project URL and publishable key", () => {
    expect(
      getPublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      }),
    ).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
    });
  });

  it("fails clearly when public configuration is absent", () => {
    expect(() => getPublicEnv({})).toThrow("Invalid public Supabase configuration");
  });

  it("fails clearly when copied placeholder values are used outside local demo mode", () => {
    expect(() =>
      getPublicEnv({
        NEXT_PUBLIC_LOCAL_DEMO: "false",
        NEXT_PUBLIC_SUPABASE_URL: "https://your-project.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_replace_me",
      }),
    ).toThrow("must be real project values");
  });

  it("allows placeholder Supabase config in local demo mode", () => {
    expect(getPublicEnv({ NEXT_PUBLIC_LOCAL_DEMO: "true" })).toEqual({
      NEXT_PUBLIC_LOCAL_DEMO: "true",
      NEXT_PUBLIC_SUPABASE_URL: "https://local-demo.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_demo_key",
    });
  });

  it("does not treat a false local demo flag as local demo mode", () => {
    expect(() => getPublicEnv({ NEXT_PUBLIC_LOCAL_DEMO: "false" })).toThrow("Invalid public Supabase configuration");
  });
});
