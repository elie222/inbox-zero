import { describe, expect, it } from "vitest";
import { getAppErrorBoundaryLogContext } from "./app-error-boundary-log-context";

describe("getAppErrorBoundaryLogContext", () => {
  it("returns only allowlisted route context for client logs", () => {
    const context = getAppErrorBoundaryLogContext({
      error: {
        digest: "digest-123",
        message: "token=secret-value",
        name: "TypeError",
        stack: "stack with secret-value",
      },
      params: {
        emailAccountId: "account-123",
        ruleId: "rule-456",
      },
      pathname: "/mail",
      searchParams: new URLSearchParams(
        "token=secret-value&code=oauth-code&tab=history&ruleId=query-rule-id",
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
      },
      searchParamKeys: ["token", "code", "tab", "ruleId"],
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
