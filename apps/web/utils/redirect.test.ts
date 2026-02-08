import { describe, it, expect } from "vitest";
import { buildRedirectUrl } from "@/utils/redirect";

describe("buildRedirectUrl", () => {
  it("returns base path when no searchParams", () => {
    expect(buildRedirectUrl("/settings")).toBe("/settings");
  });

  it("returns base path when searchParams is undefined", () => {
    expect(buildRedirectUrl("/settings", undefined)).toBe("/settings");
  });

  it("returns base path when searchParams is empty", () => {
    expect(buildRedirectUrl("/settings", {})).toBe("/settings");
  });

  it("appends a single string param", () => {
    expect(buildRedirectUrl("/settings", { tab: "email" })).toBe(
      "/settings?tab=email",
    );
  });

  it("appends multiple params", () => {
    const result = buildRedirectUrl("/settings", {
      tab: "email",
      message: "slack_connected",
    });
    expect(result).toBe("/settings?tab=email&message=slack_connected");
  });

  it("skips undefined values", () => {
    expect(
      buildRedirectUrl("/settings", { tab: "email", foo: undefined }),
    ).toBe("/settings?tab=email");
  });

  it("handles array values", () => {
    const result = buildRedirectUrl("/settings", { tag: ["a", "b"] });
    expect(result).toBe("/settings?tag=a&tag=b");
  });

  it("returns base path when all values are undefined", () => {
    expect(
      buildRedirectUrl("/settings", { foo: undefined, bar: undefined }),
    ).toBe("/settings");
  });

  it("encodes special characters", () => {
    const result = buildRedirectUrl("/settings", { q: "hello world" });
    expect(result).toBe("/settings?q=hello+world");
  });
});
