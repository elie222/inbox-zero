import { describe, expect, it } from "vitest";
import {
  ownedLastEmailAccountId,
  parseLastEmailAccountCookieValue,
} from "./cookies";

describe("ownedLastEmailAccountId", () => {
  it("keeps the last account when it is still owned", () => {
    expect(
      ownedLastEmailAccountId("account-1", ["account-2", "account-1"]),
    ).toBe("account-1");
  });

  it("drops a last account that is no longer owned", () => {
    expect(ownedLastEmailAccountId("deleted", ["account-2"])).toBeNull();
    expect(ownedLastEmailAccountId(null, ["account-2"])).toBeNull();
  });
});

describe("parseLastEmailAccountCookieValue", () => {
  it("rejects a cookie minted for a different user", () => {
    expect(
      parseLastEmailAccountCookieValue({
        userId: "user-1",
        cookieValue: JSON.stringify({
          userId: "user-2",
          emailAccountId: "account-1",
        }),
      }),
    ).toBeNull();
  });
});
