import { describe, expect, it } from "vitest";
import {
  EMAIL_ACCOUNT_HEADER,
  emailAccountIdFromMailApiPath,
  mailApiHeaders,
} from "./request";

describe("desktop mail API request headers", () => {
  it("reads the account id from a mail API path", () => {
    expect(
      emailAccountIdFromMailApiPath(
        "/api/mail/v1/accounts/acc-1/capabilities?requestId=r1",
      ),
    ).toBe("acc-1");
    expect(
      emailAccountIdFromMailApiPath("/api/mail/v1/accounts/acc%2Fslash/scopes"),
    ).toBe("acc/slash");
    expect(
      emailAccountIdFromMailApiPath("/api/user/email-accounts"),
    ).toBeNull();
  });

  it("sends X-Email-Account-ID when the path names an account", () => {
    expect(
      mailApiHeaders("/api/mail/v1/accounts/acc-1/operations/op-1", true),
    ).toEqual({
      accept: "application/json",
      [EMAIL_ACCOUNT_HEADER]: "acc-1",
      "content-type": "application/json",
    });
    expect(mailApiHeaders("/health", false)).toEqual({
      accept: "application/json",
    });
  });
});
