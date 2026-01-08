import { describe, it, expect } from "vitest";
import { isInternalPath } from "./path";

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
