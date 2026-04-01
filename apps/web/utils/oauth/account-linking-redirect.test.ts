import { describe, expect, it, vi } from "vitest";
import { createAccountLinkingRedirect } from "./account-linking-redirect";

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

describe("createAccountLinkingRedirect", () => {
  it("builds an accounts redirect and clears the linking cookie", () => {
    const response = createAccountLinkingRedirect({
      query: {
        error: "invalid_state",
        ignored: undefined,
      },
      stateCookieName: "linking_state",
    });

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/accounts?error=invalid_state",
    );
    expect(response.cookies.get("linking_state")?.value).toBe("");
    expect(response.headers.get("set-cookie")).toContain("linking_state=");
    expect(response.headers.get("set-cookie")).toContain("Expires=");
  });

  it("supports redirects without query params or cookie cleanup", () => {
    const response = createAccountLinkingRedirect();

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/accounts",
    );
    expect(response.cookies.getAll()).toEqual([]);
  });
});
