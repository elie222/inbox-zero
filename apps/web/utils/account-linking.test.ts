import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAccountLinkingUrl } from "./account-linking";

describe("getAccountLinkingUrl", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the OAuth URL on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          url: "https://accounts.google.com/o/oauth2/v2/auth",
        }),
      }),
    );

    await expect(getAccountLinkingUrl("google")).resolves.toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
  });

  it("returns the redirect URL when the server asks the client to log out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ redirectTo: "/logout" }),
      }),
    );

    await expect(getAccountLinkingUrl("google")).resolves.toBe("/logout");
  });
});
