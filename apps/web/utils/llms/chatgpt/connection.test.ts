import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { env } from "@/env";
import { sleep } from "@/utils/sleep";
import {
  disconnectChatGpt,
  getChatGptAccessToken,
  getChatGptStatus,
} from "./connection";
import {
  ChatGptTokenError,
  refreshChatGptToken,
  revokeChatGptRefreshToken,
} from "./oauth";
import { acquireOwnedLock } from "@/utils/redis/owned-lock";

vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({
  env: {
    CHATGPT_CLIENT_ID: undefined,
    CHATGPT_HOST_ID: undefined,
    CHATGPT_REFRESH_TOKEN: undefined,
  },
}));
vi.mock("@/utils/sleep", () => ({ sleep: vi.fn(async () => {}) }));
vi.mock("@/utils/redis/owned-lock", () => ({
  acquireOwnedLock: vi.fn(async () => "lock-token"),
  clearOwnedLock: vi.fn(async () => true),
}));
vi.mock("./oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./oauth")>()),
  refreshChatGptToken: vi.fn(),
  revokeChatGptRefreshToken: vi.fn(async () => true),
}));

const HOUR = 60 * 60 * 1000;

function connection(overrides: Record<string, unknown> = {}) {
  return {
    clientId: "oaiapp_1",
    accessToken: "access-1",
    refreshToken: "refresh-1",
    expiresAt: new Date(Date.now() + HOUR),
    ...overrides,
  } as never;
}

describe("getChatGptAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.chatGptConnection.findUnique.mockReset();
    vi.mocked(acquireOwnedLock).mockResolvedValue("lock-token");
    vi.mocked(env).CHATGPT_CLIENT_ID = undefined;
    vi.mocked(env).CHATGPT_HOST_ID = undefined;
    vi.mocked(env).CHATGPT_REFRESH_TOKEN = undefined;
  });

  it("returns the stored token while it is fresh", async () => {
    prisma.chatGptConnection.findUnique.mockResolvedValue(connection());

    await expect(getChatGptAccessToken()).resolves.toBe("access-1");
    expect(refreshChatGptToken).not.toHaveBeenCalled();
  });

  it("refreshes near expiry and stores the rotated refresh token", async () => {
    prisma.chatGptConnection.findUnique.mockResolvedValue(
      connection({ expiresAt: new Date(Date.now() + 60_000) }),
    );
    vi.mocked(refreshChatGptToken).mockResolvedValue({
      access_token: "access-2",
      refresh_token: "refresh-2",
      expires_in: 3600,
    });

    await expect(getChatGptAccessToken()).resolves.toBe("access-2");
    expect(prisma.chatGptConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accessToken: "access-2",
          refreshToken: "refresh-2",
        }),
      }),
    );
  });

  it("refreshes once for concurrent requests", async () => {
    prisma.chatGptConnection.findUnique.mockResolvedValue(
      connection({ expiresAt: new Date(Date.now() - 1) }),
    );
    vi.mocked(refreshChatGptToken).mockResolvedValue({
      access_token: "access-2",
      refresh_token: "refresh-2",
      expires_in: 3600,
    });

    await Promise.all([getChatGptAccessToken(), getChatGptAccessToken()]);
    expect(refreshChatGptToken).toHaveBeenCalledTimes(1);
  });

  it("uses a token another process already rotated", async () => {
    prisma.chatGptConnection.findUnique
      .mockResolvedValueOnce(
        connection({ expiresAt: new Date(Date.now() - 1) }),
      )
      .mockResolvedValueOnce(
        connection({ expiresAt: new Date(Date.now() - 1) }),
      )
      .mockResolvedValueOnce(
        connection({
          accessToken: "access-other",
          refreshToken: "refresh-other",
        }),
      );
    vi.mocked(refreshChatGptToken).mockRejectedValue(
      new ChatGptTokenError(400, "invalid_grant"),
    );

    await expect(getChatGptAccessToken()).resolves.toBe("access-other");
    expect(prisma.chatGptConnection.updateMany).not.toHaveBeenCalled();
  });

  it("clears a revoked connection and asks for reconnection", async () => {
    prisma.chatGptConnection.findUnique.mockResolvedValue(
      connection({ expiresAt: new Date(Date.now() - 1) }),
    );
    vi.mocked(refreshChatGptToken).mockRejectedValue(
      new ChatGptTokenError(400, "invalid_grant"),
    );

    await expect(getChatGptAccessToken()).rejects.toThrow("reconnect");
    expect(prisma.chatGptConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { accessToken: null, refreshToken: null, expiresAt: null },
      }),
    );
  });

  it("uses a token renewed by whoever held the lock instead of refreshing again", async () => {
    prisma.chatGptConnection.findUnique
      .mockResolvedValueOnce(
        connection({ expiresAt: new Date(Date.now() - 1) }),
      )
      .mockResolvedValueOnce(connection({ accessToken: "access-renewed" }));

    await expect(getChatGptAccessToken()).resolves.toBe("access-renewed");
    expect(refreshChatGptToken).not.toHaveBeenCalled();
  });

  it("waits for another process's renewal rather than spending the same refresh token", async () => {
    const stale = () => connection({ expiresAt: new Date(Date.now() - 1) });
    // The other process still holds the lock on our first check and has
    // finished renewing by the second.
    vi.mocked(acquireOwnedLock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.chatGptConnection.findUnique
      .mockResolvedValueOnce(stale())
      .mockResolvedValueOnce(stale())
      .mockResolvedValueOnce(connection({ accessToken: "access-renewed" }));
    vi.mocked(refreshChatGptToken).mockRejectedValue(
      new ChatGptTokenError(400, "invalid_grant"),
    );

    await expect(getChatGptAccessToken()).resolves.toBe("access-renewed");
    expect(refreshChatGptToken).not.toHaveBeenCalled();
  });

  it.each([
    ["an outage", new ChatGptTokenError(503, undefined)],
    ["throttling", new ChatGptTokenError(429, "rate_limited")],
    ["a malformed request", new ChatGptTokenError(400, "invalid_request")],
  ])("keeps the connection after %s", async (_label, error) => {
    prisma.chatGptConnection.findUnique.mockResolvedValue(
      connection({ expiresAt: new Date(Date.now() - 1) }),
    );
    vi.mocked(refreshChatGptToken).mockRejectedValue(error);

    await expect(getChatGptAccessToken()).rejects.toThrow("Try again shortly");
    expect(prisma.chatGptConnection.updateMany).not.toHaveBeenCalled();
  });

  it("gives up rather than renewing alongside a process that holds the lock too long", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.mocked(sleep).mockImplementation(async (ms) => {
      vi.setSystemTime(Date.now() + ms);
    });
    vi.mocked(acquireOwnedLock).mockResolvedValue(null);
    prisma.chatGptConnection.findUnique.mockResolvedValue(
      connection({ expiresAt: new Date(Date.now() - 1) }),
    );

    try {
      await expect(getChatGptAccessToken()).rejects.toThrow(
        "Try again shortly",
      );
      expect(refreshChatGptToken).not.toHaveBeenCalled();
    } finally {
      vi.mocked(sleep).mockImplementation(async () => {});
      vi.useRealTimers();
    }
  });

  it("still renews when Redis is unreachable", async () => {
    vi.mocked(acquireOwnedLock).mockRejectedValueOnce(
      new Error("ECONNREFUSED"),
    );
    prisma.chatGptConnection.findUnique.mockResolvedValue(
      connection({ expiresAt: new Date(Date.now() - 1) }),
    );
    vi.mocked(refreshChatGptToken).mockResolvedValue({
      access_token: "access-2",
      refresh_token: "refresh-2",
      expires_in: 3600,
    });

    await expect(getChatGptAccessToken()).resolves.toBe("access-2");
  });

  it("explains when ChatGPT was never connected", async () => {
    prisma.chatGptConnection.findUnique.mockResolvedValue(null);

    await expect(getChatGptAccessToken()).rejects.toThrow("not connected");
  });
});

describe("ChatGPT sign-in from setup", () => {
  const SETUP_TOKEN = "refresh-from-setup";
  const SETUP_TOKEN_HASH = createHash("sha256")
    .update(SETUP_TOKEN)
    .digest("hex");

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.chatGptConnection.findUnique.mockReset();
    vi.mocked(acquireOwnedLock).mockResolvedValue("lock-token");
    vi.mocked(env).CHATGPT_CLIENT_ID = "oaiapp_setup";
    vi.mocked(env).CHATGPT_HOST_ID = "urn:uuid:setup-host";
    vi.mocked(env).CHATGPT_REFRESH_TOKEN = SETUP_TOKEN;
  });

  it("exchanges the setup refresh token once and stores the rotated credentials", async () => {
    prisma.chatGptConnection.findUnique.mockResolvedValue(null);
    vi.mocked(refreshChatGptToken).mockResolvedValue({
      access_token: "access-imported",
      refresh_token: "refresh-rotated",
      expires_in: 3600,
    });

    await expect(getChatGptAccessToken()).resolves.toBe("access-imported");
    expect(refreshChatGptToken).toHaveBeenCalledWith({
      clientId: "oaiapp_setup",
      refreshToken: SETUP_TOKEN,
    });
    expect(prisma.chatGptConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          hostId: "urn:uuid:setup-host",
          clientId: "oaiapp_setup",
          refreshToken: "refresh-rotated",
          importedTokenHash: SETUP_TOKEN_HASH,
        }),
      }),
    );
  });

  it("does not re-import a setup sign-in after it was imported or disconnected", async () => {
    prisma.chatGptConnection.findUnique
      .mockResolvedValueOnce({ importedTokenHash: SETUP_TOKEN_HASH } as never)
      .mockResolvedValueOnce(null);

    await expect(getChatGptAccessToken()).rejects.toThrow("not connected");
    expect(refreshChatGptToken).not.toHaveBeenCalled();
  });

  it("imports a newer sign-in from `inbox-zero chatgpt login`", async () => {
    prisma.chatGptConnection.findUnique.mockResolvedValue({
      importedTokenHash: "hash-of-an-older-sign-in",
    } as never);
    vi.mocked(refreshChatGptToken).mockResolvedValue({
      access_token: "access-new",
      refresh_token: "refresh-new",
      expires_in: 3600,
    });

    await expect(getChatGptAccessToken()).resolves.toBe("access-new");
  });

  it("uses the import another process completed while it waited", async () => {
    vi.mocked(acquireOwnedLock).mockResolvedValueOnce(null);
    prisma.chatGptConnection.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...(connection({ accessToken: "access-other" }) as object),
        importedTokenHash: SETUP_TOKEN_HASH,
      } as never);

    await expect(getChatGptAccessToken()).resolves.toBe("access-other");
    expect(refreshChatGptToken).not.toHaveBeenCalled();
  });

  it("explains how to reconnect when the setup sign-in was revoked", async () => {
    prisma.chatGptConnection.findUnique.mockResolvedValue(null);
    vi.mocked(refreshChatGptToken).mockRejectedValue(
      new ChatGptTokenError(400, "invalid_grant"),
    );

    await expect(getChatGptAccessToken()).rejects.toThrow(
      "inbox-zero chatgpt login",
    );
    expect(prisma.chatGptConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          importedTokenHash: SETUP_TOKEN_HASH,
        }),
      }),
    );
  });

  it("keeps a setup sign-in disconnected when it is disconnected before first use", async () => {
    prisma.chatGptConnection.findUnique.mockResolvedValue(null);

    await disconnectChatGpt();

    expect(revokeChatGptRefreshToken).toHaveBeenCalledWith({
      clientId: "oaiapp_setup",
      refreshToken: SETUP_TOKEN,
    });
    expect(prisma.chatGptConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          importedTokenHash: SETUP_TOKEN_HASH,
        }),
        update: expect.objectContaining({
          importedTokenHash: SETUP_TOKEN_HASH,
        }),
      }),
    );
  });

  it("reports a pending setup sign-in as connected", async () => {
    prisma.chatGptConnection.findUnique.mockResolvedValue(null);

    await expect(getChatGptStatus()).resolves.toMatchObject({
      connected: true,
    });
  });
});
