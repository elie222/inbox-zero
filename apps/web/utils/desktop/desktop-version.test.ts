import { describe, expect, it } from "vitest";
import {
  compareDesktopVersions,
  isPrereleaseDesktopVersion,
} from "./desktop-version";

describe("compareDesktopVersions", () => {
  it("orders numeric segments instead of string prefixes", () => {
    expect(compareDesktopVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareDesktopVersions("0.9.0", "0.10.0")).toBe(-1);
  });

  it("treats a stable release as newer than the same core prerelease", () => {
    expect(compareDesktopVersions("1.0.0-beta.1", "1.0.0")).toBe(-1);
    expect(compareDesktopVersions("1.0.0", "1.0.0-beta.1")).toBe(1);
    expect(isPrereleaseDesktopVersion("1.0.0-beta.1")).toBe(true);
  });
});
