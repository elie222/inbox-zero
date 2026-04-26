import { describe, expect, it } from "vitest";
import {
  isAddressLikeEmailPattern,
  splitEmailPatterns,
} from "./email-from-pattern";

describe("splitEmailPatterns", () => {
  it("splits on pipe, comma, and OR", () => {
    expect(splitEmailPatterns("a@x.com|b@y.com")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
    expect(splitEmailPatterns("a@x.com, b@y.com")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
    expect(splitEmailPatterns("a@x.com OR b@y.com")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });
});

describe("isAddressLikeEmailPattern", () => {
  it("accepts emails and domain-shaped patterns", () => {
    expect(isAddressLikeEmailPattern("elie@example.com")).toBe(true);
    expect(isAddressLikeEmailPattern("@company.com")).toBe(true);
    expect(isAddressLikeEmailPattern("company.com")).toBe(true);
  });

  it("rejects display-name-only patterns", () => {
    expect(isAddressLikeEmailPattern("Elie")).toBe(false);
    expect(isAddressLikeEmailPattern("Team *")).toBe(false);
  });
});
