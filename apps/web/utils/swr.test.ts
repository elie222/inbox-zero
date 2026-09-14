import { describe, expect, it } from "vitest";
import { EMAIL_ACCOUNT_ID_REQUIRED_ERROR } from "@/utils/config";
import {
  getAccountScopedKey,
  getDevSWRErrorRetryMs,
  shouldResetSwrCacheForAccountId,
} from "./swr";

describe("getAccountScopedKey", () => {
  it("keeps an unscoped path when no account id argument is passed", () => {
    expect(getAccountScopedKey("/api/user/email-account")).toBe(
      "/api/user/email-account",
    );
  });

  it("does not fetch when the account id is missing", () => {
    expect(getAccountScopedKey("/api/user/email-account", null)).toBeNull();
    expect(getAccountScopedKey("/api/user/email-account", "")).toBeNull();
  });

  it("scopes the cache key to the account", () => {
    expect(getAccountScopedKey("/api/user/email-account", "account-1")).toEqual(
      ["/api/user/email-account", "account-1"],
    );
  });
});

describe("shouldResetSwrCacheForAccountId", () => {
  it("does not reset on the first account id", () => {
    expect(shouldResetSwrCacheForAccountId(null, "account-1")).toBe(false);
  });

  it("resets when an account id appears after an empty id", () => {
    expect(shouldResetSwrCacheForAccountId("", "account-1")).toBe(true);
  });

  it("resets when switching accounts", () => {
    expect(shouldResetSwrCacheForAccountId("account-1", "account-2")).toBe(
      true,
    );
  });

  it("does not reset for the same account or an empty next id", () => {
    expect(shouldResetSwrCacheForAccountId("account-1", "account-1")).toBe(
      false,
    );
    expect(shouldResetSwrCacheForAccountId("account-1", "")).toBe(false);
  });
});

describe("getDevSWRErrorRetryMs", () => {
  it("retries HMR 404s quickly", () => {
    expect(getDevSWRErrorRetryMs({ status: 404 }, 0)).toBe(500);
  });

  it("retries a missing account-id 403 until the header can be sent", () => {
    expect(
      getDevSWRErrorRetryMs(
        { status: 403, message: EMAIL_ACCOUNT_ID_REQUIRED_ERROR },
        0,
      ),
    ).toBe(500);
    expect(
      getDevSWRErrorRetryMs(
        { status: 403, message: EMAIL_ACCOUNT_ID_REQUIRED_ERROR },
        5,
      ),
    ).toBeNull();
  });

  it("does not retry other client errors", () => {
    expect(
      getDevSWRErrorRetryMs(
        { status: 403, message: "Insufficient permissions" },
        0,
      ),
    ).toBeNull();
    expect(getDevSWRErrorRetryMs({ status: 400 }, 0)).toBeNull();
  });

  it("backs off server errors", () => {
    expect(getDevSWRErrorRetryMs({ status: 500 }, 0)).toBe(5000);
    expect(getDevSWRErrorRetryMs({ status: 500 }, 1)).toBe(10_000);
  });
});
