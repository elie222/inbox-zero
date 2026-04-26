import { describe, it, expect } from "vitest";
import { isInternalPath, normalizeInternalPath } from "./path";

describe("isInternalPath", () => {
  it("should return true for valid internal paths", () => {
    expect(isInternalPath("/")).toBe(true);
    expect(isInternalPath("/dashboard")).toBe(true);
    expect(isInternalPath("/settings/profile")).toBe(true);
    expect(isInternalPath("/a")).toBe(true);
  });

  it("should return false for external URLs", () => {
    expect(isInternalPath("https://example.com")).toBe(false);
    expect(isInternalPath("http://example.com")).toBe(false);
    expect(isInternalPath("ftp://example.com")).toBe(false);
    expect(isInternalPath("javascript:alert(1)")).toBe(false);
  });

  it("should return false for protocol-relative URLs", () => {
    expect(isInternalPath("//example.com")).toBe(false);
    expect(isInternalPath("//")).toBe(false);
  });

  it("should return false for backslash bypass attempts", () => {
    expect(isInternalPath("/\\example.com")).toBe(false);
    expect(isInternalPath("/\\")).toBe(false);
  });

  it("should return false for control-character bypass attempts", () => {
    expect(isInternalPath("/\texample.com")).toBe(false);
    expect(isInternalPath("/\t/example.com")).toBe(false);
    expect(isInternalPath("/\n/example.com")).toBe(false);
  });

  it("should return false for empty, null, or undefined paths", () => {
    expect(isInternalPath("")).toBe(false);
    expect(isInternalPath(null)).toBe(false);
    expect(isInternalPath(undefined)).toBe(false);
  });

  it("should return false for paths not starting with a slash", () => {
    expect(isInternalPath("dashboard")).toBe(false);
    expect(isInternalPath("settings/profile")).toBe(false);
  });
});

describe("normalizeInternalPath", () => {
  it("returns a normalized internal path", () => {
    expect(normalizeInternalPath("/settings/profile?tab=rules#webhook")).toBe(
      "/settings/profile?tab=rules#webhook",
    );
  });

  it("returns null for paths that resolve off-site", () => {
    expect(normalizeInternalPath("/\\example.com")).toBeNull();
    expect(normalizeInternalPath("/\t/example.com")).toBeNull();
  });
});
