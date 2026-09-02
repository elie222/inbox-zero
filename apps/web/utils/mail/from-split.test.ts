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

  it("uses the full address as the tab name", () => {
    expect(parseFromSplitInput("Support@Example.com")).toEqual({
      value: "support@example.com",
      name: "support@example.com",
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

  it("keeps addresses whose local part is from", () => {
    expect(parseFromSplitInput("from@example.com")).toEqual({
      value: "from@example.com",
      name: "from@example.com",
    });
  });

  it("rejects malformed addresses and domains", () => {
    expect(parseFromSplitInput("a..b@example.com")).toBeNull();
    expect(parseFromSplitInput("@a..b.com")).toBeNull();
    expect(parseFromSplitInput("unread")).toBeNull();
    expect(parseFromSplitInput("receipts label")).toBeNull();
    expect(
      parseFromSplitInput(
        'all emails from "user@example.com..evil" that are in the inbox',
      ),
    ).toBeNull();
  });

  it("keeps long filter names unique when truncated", () => {
    const longLocal = `${"a".repeat(50)}@example.com`;
    const longerLocal = `${"a".repeat(51)}@example.com`;
    const first = parseFromSplitInput(longLocal);
    const second = parseFromSplitInput(longerLocal);
    expect(first?.name).not.toEqual(second?.name);
    expect(first?.name.length).toBeLessThanOrEqual(60);
    expect(second?.name.length).toBeLessThanOrEqual(60);
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
