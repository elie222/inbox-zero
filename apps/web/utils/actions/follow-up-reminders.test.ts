import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { updateFollowUpSettingsAction } from "@/utils/actions/follow-up-reminders";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const { envMock } = vi.hoisted(() => ({
  envMock: {
    NODE_ENV: "test",
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/app/api/follow-up-reminders/process", () => ({
  processAccountFollowUps: vi.fn(),
}));

describe("updateFollowUpSettingsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.NEXT_PUBLIC_AUTO_DRAFT_DISABLED = false;
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: {
        userId: "user-1",
        provider: "google",
      },
    } as any);
    prisma.emailAccount.update.mockResolvedValue({ id: "account-1" } as any);
  });

  it("persists follow-up auto-draft preference when drafting is enabled", async () => {
    await updateFollowUpSettingsAction("account-1", {
      followUpAwaitingReplyDays: 3,
      followUpNeedsReplyDays: 5,
      followUpAutoDraftEnabled: true,
    });

    expect(prisma.emailAccount.update).toHaveBeenCalledWith({
      where: { id: "account-1" },
      data: {
        followUpAwaitingReplyDays: 3,
        followUpNeedsReplyDays: 5,
        followUpAutoDraftEnabled: true,
      },
    });
  });

  it("preserves stored follow-up auto-draft preference when drafting is disabled", async () => {
    envMock.NEXT_PUBLIC_AUTO_DRAFT_DISABLED = true;

    await updateFollowUpSettingsAction("account-1", {
      followUpAwaitingReplyDays: 3,
      followUpNeedsReplyDays: 5,
      followUpAutoDraftEnabled: false,
    });

    expect(prisma.emailAccount.update).toHaveBeenCalledTimes(1);
    expect(prisma.emailAccount.update.mock.calls[0][0]).toEqual({
      where: { id: "account-1" },
      data: {
        followUpAwaitingReplyDays: 3,
        followUpNeedsReplyDays: 5,
      },
    });
  });

  it("persists follow-up auto-draft preference after drafting is re-enabled", async () => {
    envMock.NEXT_PUBLIC_AUTO_DRAFT_DISABLED = true;

    await updateFollowUpSettingsAction("account-1", {
      followUpAwaitingReplyDays: 3,
      followUpNeedsReplyDays: 5,
      followUpAutoDraftEnabled: false,
    });

    envMock.NEXT_PUBLIC_AUTO_DRAFT_DISABLED = false;

    await updateFollowUpSettingsAction("account-1", {
      followUpAwaitingReplyDays: 3,
      followUpNeedsReplyDays: 5,
      followUpAutoDraftEnabled: true,
    });

    expect(prisma.emailAccount.update).toHaveBeenCalledTimes(2);
    expect(prisma.emailAccount.update).toHaveBeenNthCalledWith(2, {
      where: { id: "account-1" },
      data: {
        followUpAwaitingReplyDays: 3,
        followUpNeedsReplyDays: 5,
        followUpAutoDraftEnabled: true,
      },
    });
  });
});
