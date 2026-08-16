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

  it("does not treat SemVer build metadata as a prerelease", () => {
    expect(isPrereleaseDesktopVersion("1.0.0+build-1")).toBe(false);
    expect(compareDesktopVersions("1.0.0+build-1", "1.0.0")).toBe(0);
    expect(compareDesktopVersions("1.0.0+build-1", "0.9.0")).toBe(1);
  });

  it("orders prerelease identifiers with SemVer precedence", () => {
    expect(compareDesktopVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compareDesktopVersions("1.0.0-alpha.1", "1.0.0-alpha.beta")).toBe(
      -1,
    );
    expect(compareDesktopVersions("1.0.0-alpha.beta", "1.0.0-beta")).toBe(-1);
    expect(compareDesktopVersions("1.0.0-beta", "1.0.0-beta.2")).toBe(-1);
    expect(compareDesktopVersions("1.0.0-beta.2", "1.0.0-beta.11")).toBe(-1);
    expect(compareDesktopVersions("1.0.0-beta.11", "1.0.0-rc.1")).toBe(-1);
    expect(compareDesktopVersions("1.0.0-rc.1", "1.0.0")).toBe(-1);
  });
});
