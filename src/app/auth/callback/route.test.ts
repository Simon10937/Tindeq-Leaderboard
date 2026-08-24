import { describe, expect, it } from "vitest";
import { resolveAuthRedirectPath } from "./route";

describe("resolveAuthRedirectPath", () => {
  it("allows tracker tabs", () => {
    expect(resolveAuthRedirectPath("/progress")).toBe("/progress");
    expect(resolveAuthRedirectPath("/import")).toBe("/import");
    expect(resolveAuthRedirectPath("/history")).toBe("/history");
  });

  it("falls back for missing or unsafe destinations", () => {
    expect(resolveAuthRedirectPath(null)).toBe("/progress");
    expect(resolveAuthRedirectPath("https://example.com")).toBe("/progress");
    expect(resolveAuthRedirectPath("//example.com")).toBe("/progress");
    expect(resolveAuthRedirectPath("/dashboard")).toBe("/progress");
  });
});
