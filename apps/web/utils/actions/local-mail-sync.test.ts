import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { auth } from "@/utils/auth";
import { createEmailProvider } from "@/utils/email/provider";
import { LocalMailSyncPausedError } from "@/utils/email/local-mail-sync-budget";
import { ProviderRateLimitModeError } from "@/utils/email/rate-limit-mode-error";
import { localMailSyncAction } from "./local-mail-sync";
import { localMailSyncBody } from "./local-mail-sync.validation";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider");
vi.mock("@/utils/redis", () => ({ redis: {} }));
vi.mock("@/utils/auth", () => ({ auth: vi.fn() }));
const syncLocalMail = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth).mockResolvedValue({
    user: { id: "user-1", email: "user@example.com" },
  } as never);
  prisma.emailAccount.findUnique.mockResolvedValue({
    email: "user@example.com",
    account: { userId: "user-1", provider: "google" },
  } as never);
  vi.mocked(createEmailProvider).mockResolvedValue({ syncLocalMail } as never);
  syncLocalMail.mockResolvedValue({
    status: "ok",
    phase: "capabilities",
    result: {
      strategy: "account-history",
      excludedFolderIds: [],
      maxHydrationMessages: 25,
    },
  });
});
describe("local mail server action authorization", () => {
  it("uses only authenticated account context and strips client identity fields", async () => {
    const result = await localMailSyncAction("account-1", {
      phase: "capabilities",
      emailAccountId: "another-account",
      provider: "microsoft",
      folderIds: { drafts: "spoofed" },
    } as never);
    expect(result?.serverError).toBeUndefined();
    expect(createEmailProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        provider: "google",
      }),
    );
    expect(syncLocalMail).toHaveBeenCalledWith(
      { phase: "capabilities" },
      { emailAccountId: "account-1" },
    );
  });
  it("rejects an unauthenticated caller before provider creation", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const result = await localMailSyncAction("account-1", {
      phase: "capabilities",
    });
    expect(result?.serverError).toBe("Unauthorized");
    expect(createEmailProvider).not.toHaveBeenCalled();
  });
  it("rejects another user's account before provider creation", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: { userId: "user-2", provider: "google" },
    } as never);
    const result = await localMailSyncAction("account-2", {
      phase: "capabilities",
    });
    expect(result?.serverError).toBe("Unauthorized");
    expect(createEmailProvider).not.toHaveBeenCalled();
  });
  it("returns durable scheduling pauses for local admission and existing provider cooldown", async () => {
    syncLocalMail.mockRejectedValueOnce(new LocalMailSyncPausedError(45_000));
    expect(
      (await localMailSyncAction("account-1", { phase: "capabilities" }))?.data,
    ).toEqual({ status: "paused", retryAfterMs: 45_000 });
    vi.mocked(createEmailProvider).mockRejectedValueOnce(
      new ProviderRateLimitModeError({
        provider: "google",
        retryAt: new Date(Date.now() + 120_000),
      }),
    );
    const result = await localMailSyncAction("account-1", {
      phase: "capabilities",
    });
    expect(result?.data).toMatchObject({
      status: "paused",
      retryAfterMs: expect.any(Number),
    });
    if (result?.data?.status === "paused")
      expect(result.data.retryAfterMs).toBeGreaterThan(110_000);
  });
  it("preserves Graph Retry-After headers in the scheduling response", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: { userId: "user-1", provider: "microsoft" },
    } as never);
    syncLocalMail.mockRejectedValueOnce({
      statusCode: 429,
      headers: new Headers({ "Retry-After": "90" }),
    });
    expect(
      (await localMailSyncAction("account-1", { phase: "capabilities" }))?.data,
    ).toEqual({ status: "paused", retryAfterMs: 90_000 });
  });
  it("preserves explicit resets without converting them into successful coverage", async () => {
    syncLocalMail.mockResolvedValueOnce({
      status: "reset-required",
      phase: "history-changes",
    });
    expect(
      (
        await localMailSyncAction("account-1", {
          phase: "history-changes",
          after: 0,
          cursor: "opaque",
          limit: 10,
        })
      )?.data,
    ).toEqual({ status: "reset-required", phase: "history-changes" });
  });
});
describe("local mail request bounds", () => {
  it.each([
    { phase: "history-backfill", after: 5, before: 5, limit: 10 },
    { phase: "history-backfill", after: 0, before: 100, limit: 101 },
    {
      phase: "history-changes",
      after: 0,
      cursor: "x".repeat(32_769),
      limit: 1,
    },
    {
      phase: "history-hydrate",
      after: 0,
      messageIds: Array.from({ length: 26 }, (_, index) => String(index)),
      stream: "backfill",
    },
    {
      phase: "folder-backfill",
      after: 0,
      before: Number.POSITIVE_INFINITY,
      folderId: "folder",
      limit: 10,
    },
  ])("rejects invalid bounded work: %j", (input) => {
    expect(localMailSyncBody.safeParse(input).success).toBe(false);
  });
  it("supports imported mail predating the Unix epoch", () => {
    expect(
      localMailSyncBody.safeParse({
        phase: "history-backfill",
        after: -86_400_000,
        before: 0,
        limit: 10,
      }).success,
    ).toBe(true);
  });
});
