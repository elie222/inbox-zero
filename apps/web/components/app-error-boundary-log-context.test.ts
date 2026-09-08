import { describe, expect, it } from "vitest";
import { getAppErrorBoundaryLogContext } from "./app-error-boundary-log-context";

describe("getAppErrorBoundaryLogContext", () => {
  it("returns only allowlisted route context for client logs", () => {
    const context = getAppErrorBoundaryLogContext({
      error: Object.assign(new Error("token=secret-value"), {
        digest: "digest-123",
        name: "TypeError",
        stack: "stack with secret-value",
      }),
      params: {
        emailAccountId: "account-123",
        ruleId: "rule-456",
      },
      pathname: "/mail",
      searchParams: new URLSearchParams(
        "token=secret-value&code=oauth-code&tab=history&ruleId=query-rule-id&thread-id=thread-123&thread-account-id=account-789&q=private-search",
      ),
    });

    expect(context).toEqual({
      digest: "digest-123",
      emailAccountId: "account-123",
      errorName: "TypeError",
      pathname: "/mail",
      ruleId: "rule-456",
      safeSearchParams: {
        ruleId: "query-rule-id",
        tab: "history",
        "thread-id": "thread-123",
        "thread-account-id": "account-789",
      },
      searchParamKeys: [
        "token",
        "code",
        "tab",
        "ruleId",
        "thread-id",
        "thread-account-id",
        "q",
      ],
    });
    expect(context).not.toHaveProperty("errorMessage");
    expect(context).not.toHaveProperty("errorStack");
    expect(context).not.toHaveProperty("search");
  });

  it("omits unsupported route params and empty search state", () => {
    const context = getAppErrorBoundaryLogContext({
      error: {
        name: "Error",
      },
      params: {
        emailAccountId: ["account-123", "account-456"],
        ruleId: "",
      },
      pathname: "/mail",
      searchParams: new URLSearchParams(),
    });

    expect(context).toEqual({
      errorName: "Error",
      pathname: "/mail",
    });
  });
});
