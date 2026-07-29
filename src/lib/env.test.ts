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
});
