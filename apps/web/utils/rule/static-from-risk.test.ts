import { describe, expect, it } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import {
  getBlockedLowTrustStaticFromActionTypes,
  hasLowTrustStaticFromPattern,
} from "./static-from-risk";

describe("static from risk", () => {
  it("treats email and domain patterns as high trust", () => {
    expect(hasLowTrustStaticFromPattern("alerts@example.com")).toBe(false);
    expect(hasLowTrustStaticFromPattern("@example.com")).toBe(false);
    expect(hasLowTrustStaticFromPattern("example.com")).toBe(false);
    expect(
      hasLowTrustStaticFromPattern("@example.com or alerts@example.com"),
    ).toBe(false);
  });

  it("treats display names and wildcards as low trust", () => {
    expect(hasLowTrustStaticFromPattern("Team Billing")).toBe(true);
    expect(hasLowTrustStaticFromPattern("Team *")).toBe(true);
    expect(hasLowTrustStaticFromPattern("*")).toBe(true);
  });

  it("only blocks outbound actions for low-trust from patterns", () => {
    expect(
      getBlockedLowTrustStaticFromActionTypes("Team *", [
        ActionType.ARCHIVE,
        ActionType.FORWARD,
        ActionType.MARK_READ,
      ]),
    ).toEqual([ActionType.FORWARD]);

    expect(
      getBlockedLowTrustStaticFromActionTypes("@example.com", [
        ActionType.FORWARD,
        ActionType.REPLY,
      ]),
    ).toEqual([]);
  });
});
