import { describe, it, expect } from "vitest";
import { secureCompare, secureCompareBuffers } from "./crypto-compare";

describe("secureCompare", () => {
  it("returns true for equal strings", () => {
    expect(secureCompare("s3cr3t-token", "s3cr3t-token")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(secureCompare("aaaaaa", "aaaaab")).toBe(false);
  });

  it("returns false for strings of different length", () => {
    expect(secureCompare("short", "longer-secret")).toBe(false);
  });

  it("returns false when either value is null or undefined", () => {
    expect(secureCompare(null, "x")).toBe(false);
    expect(secureCompare("x", undefined)).toBe(false);
    expect(secureCompare(undefined, null)).toBe(false);
  });

  it("compares buffers without throwing on length mismatch", () => {
    expect(secureCompareBuffers(Buffer.from("abc"), Buffer.from("abc"))).toBe(
      true,
    );
    expect(secureCompareBuffers(Buffer.from("abc"), Buffer.from("abcd"))).toBe(
      false,
    );
  });
});
