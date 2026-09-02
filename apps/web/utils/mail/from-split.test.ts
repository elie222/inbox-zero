import { describe, expect, it } from "vitest";
import {
  getFromFilterDomain,
  isFromDomainFilter,
  parseFromSplitInput,
} from "@/utils/mail/from-split";

describe("parseFromSplitInput", () => {
  it("parses a bare domain into an inbox from-filter", () => {
    expect(parseFromSplitInput("@getinboxzero.on.crisp.email")).toEqual({
      value: "@getinboxzero.on.crisp.email",
      name: "getinboxzero.on.crisp.email",
    });
  });

  it("parses a bare email address", () => {
    expect(parseFromSplitInput("Support@Example.com")).toEqual({
      value: "support@example.com",
      name: "support",
    });
  });

  it("parses from: prefixes and inbox phrasing", () => {
    expect(
      parseFromSplitInput("from:@getinboxzero.on.crisp.email in inbox"),
    ).toEqual({
      value: "@getinboxzero.on.crisp.email",
      name: "getinboxzero.on.crisp.email",
    });
    expect(
      parseFromSplitInput(
        'all emails from "@getinboxzero.on.crisp.email" that are in the inbox',
      ),
    ).toEqual({
      value: "@getinboxzero.on.crisp.email",
      name: "getinboxzero.on.crisp.email",
    });
  });

  it("returns null for unrelated descriptions", () => {
    expect(parseFromSplitInput("unread")).toBeNull();
    expect(parseFromSplitInput("receipts label")).toBeNull();
  });
});

describe("from domain helpers", () => {
  it("detects domain filters", () => {
    expect(isFromDomainFilter("@example.com")).toBe(true);
    expect(isFromDomainFilter("user@example.com")).toBe(false);
    expect(getFromFilterDomain("@Example.COM")).toBe("example.com");
    expect(getFromFilterDomain("user@example.com")).toBeNull();
  });
});
