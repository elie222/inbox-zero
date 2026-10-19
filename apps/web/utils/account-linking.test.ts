import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redirectToSafeUrl } from "@/utils/redirect";
import { getAccountLinkingUrl, startAccountLinking } from "./account-linking";

vi.mock("@/utils/redirect", () => ({ redirectToSafeUrl: vi.fn() }));

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

describe("startAccountLinking", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://accounts.google.com/auth" }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hands linking to the desktop app instead of navigating", async () => {
    const startAccountLink = vi.fn().mockResolvedValue({});
    vi.stubGlobal("window", { inboxZeroDesktop: { startAccountLink } });

    await expect(
      startAccountLinking("microsoft", { reconnectEmailAccountId: "a-1" }),
    ).resolves.toEqual({ navigating: false });
    expect(startAccountLink).toHaveBeenCalledWith("microsoft", {
      reconnectEmailAccountId: "a-1",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(redirectToSafeUrl).not.toHaveBeenCalled();
  });

  it("surfaces a desktop start error", async () => {
    vi.stubGlobal("window", {
      inboxZeroDesktop: {
        startAccountLink: vi
          .fn()
          .mockResolvedValue({ error: "Account not found" }),
      },
    });

    await expect(startAccountLinking("google")).rejects.toThrow(
      "Account not found",
    );
  });

  it("keeps the browser flow for desktop builds without account linking", async () => {
    vi.stubGlobal("window", { inboxZeroDesktop: { startAuth: vi.fn() } });

    await expect(startAccountLinking("google")).resolves.toEqual({
      navigating: true,
    });
    expect(redirectToSafeUrl).toHaveBeenCalledWith(
      "https://accounts.google.com/auth",
      { allowExternal: true },
    );
  });
});
