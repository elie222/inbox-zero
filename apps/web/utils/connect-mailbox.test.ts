import { describe, expect, it } from "vitest";
import { getConnectMailboxNextPath } from "./connect-mailbox";

describe("getConnectMailboxNextPath", () => {
  it("returns a safe internal next path", () => {
    expect(getConnectMailboxNextPath("/setup?source=checkout")).toBe(
      "/setup?source=checkout",
    );
  });

  it("falls back when next points back to connect mailbox", () => {
    expect(
      getConnectMailboxNextPath("/connect-mailbox?next=%2Fsetup#section"),
    ).toBe("/welcome-redirect");
  });

  it("falls back for invalid paths", () => {
    expect(getConnectMailboxNextPath("https://example.com/setup")).toBe(
      "/welcome-redirect",
    );
  });
});
