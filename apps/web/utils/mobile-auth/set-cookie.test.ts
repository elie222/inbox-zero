import { describe, expect, it } from "vitest";
import {
  getOAuthStateCookieValue,
  getSetCookieValues,
  splitSetCookieHeader,
} from "./set-cookie";

describe("mobile auth set-cookie helpers", () => {
  it("splits combined Set-Cookie headers without breaking Expires dates", () => {
    expect(
      splitSetCookieHeader(
        "__Secure-better-auth.oauth_state=abc; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; HttpOnly, better-auth.session_token=def; Path=/",
      ),
    ).toEqual([
      "__Secure-better-auth.oauth_state=abc; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; HttpOnly",
      "better-auth.session_token=def; Path=/",
    ]);
  });

  it("reads the Better Auth OAuth state cookie from response headers", () => {
    const headers = new Headers();
    headers.append(
      "set-cookie",
      "__Secure-better-auth.oauth_state=encrypted-oauth-state; Path=/; HttpOnly; Secure; SameSite=Lax",
    );

    expect(getSetCookieValues(headers)).toEqual([
      "__Secure-better-auth.oauth_state=encrypted-oauth-state; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);
    expect(getOAuthStateCookieValue(headers)).toBe("encrypted-oauth-state");
  });

  it("falls back to the combined Set-Cookie header when getSetCookie is missing", () => {
    const headers = {
      get: (name: string) =>
        name === "set-cookie" ? "better-auth.oauth_state=abc; Path=/" : null,
    } as unknown as Headers;

    expect(getSetCookieValues(headers)).toEqual([
      "better-auth.oauth_state=abc; Path=/",
    ]);
  });
});
