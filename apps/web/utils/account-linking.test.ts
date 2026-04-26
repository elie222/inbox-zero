import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAccountLinkingUrl } from "./account-linking";

describe("getAccountLinkingUrl", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the OAuth URL on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        url: "https://accounts.google.com/o/oauth2/v2/auth",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAccountLinkingUrl("google")).resolves.toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/google/linking/auth-url", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("passes return target to the auth URL endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        url: "https://login.microsoftonline.com/oauth2/v2.0/authorize",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getAccountLinkingUrl("microsoft", {
      returnTo: "/organizations/invitations/invite_123/accept",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/outlook/linking/auth-url?returnTo=%2Forganizations%2Finvitations%2Finvite_123%2Faccept",
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
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
