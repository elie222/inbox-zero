import { describe, expect, it } from "vitest";
import { getMcpOAuthRateLimitPath } from "./rate-limit";

describe("MCP OAuth rate limit paths", () => {
  it.each([
    ["/api/auth/oauth2/register", "register"],
    ["/api/auth/oauth2/token", "token"],
    ["/api/auth/oauth2/authorize", "authorize"],
    ["/api/auth/sign-in/social", null],
    ["/mcp", null],
  ] as const)("maps %s", (pathname, kind) => {
    expect(getMcpOAuthRateLimitPath(pathname)).toBe(kind);
  });
});
