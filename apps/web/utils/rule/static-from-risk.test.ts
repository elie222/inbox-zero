import { describe, expect, it } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import {
  getBlockedLowTrustStaticFromActionTypes,
  hasLowTrustStaticFromPattern,
} from "./static-from-risk";

describe("hasLowTrustStaticFromPattern", () => {
  it("is false for empty from", () => {
    expect(hasLowTrustStaticFromPattern(null)).toBe(false);
    expect(hasLowTrustStaticFromPattern("")).toBe(false);
  });

  it("is false when all OR segments are address-like", () => {
    expect(hasLowTrustStaticFromPattern("elie@x.com")).toBe(false);
    expect(hasLowTrustStaticFromPattern("a@x.com|b@y.com")).toBe(false);
  });

  it("is true when any segment is not address-like", () => {
    expect(hasLowTrustStaticFromPattern("Boss")).toBe(true);
    expect(hasLowTrustStaticFromPattern("Boss|boss@x.com")).toBe(true);
  });
});

describe("getBlockedLowTrustStaticFromActionTypes", () => {
  it("returns outbound types when from is low-trust", () => {
    expect(
      getBlockedLowTrustStaticFromActionTypes("Team *", [
        ActionType.FORWARD,
        ActionType.LABEL,
      ]),
    ).toEqual([ActionType.FORWARD]);
  });

  it("returns empty when from is high-trust", () => {
    expect(
      getBlockedLowTrustStaticFromActionTypes("team@x.com", [
        ActionType.FORWARD,
      ]),
    ).toEqual([]);
  });
});
