import { beforeEach, describe, expect, it, vi } from "vitest";
import { isTransactionalEmailConfigured } from "@inboxzero/transactional-email/src/delivery";
import { updateEmailOtpSetting } from "@/utils/auth/email-otp-setting";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@inboxzero/transactional-email/src/delivery", () => ({
  isTransactionalEmailConfigured: vi.fn(() => true),
}));

describe("email code access setting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTransactionalEmailConfigured).mockReturnValue(true);
    prisma.session.findFirst.mockResolvedValue({ emailOtp: false } as never);
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      email: "owner@example.com",
    } as never);
  });

  it.each([
    true,
    false,
  ])("does not let code-based sessions set access to %s", async (enabled) => {
    prisma.session.findFirst.mockResolvedValue({ emailOtp: true } as never);
    await expect(
      updateEmailOtpSetting({ userId: "owner", sessionId: "session", enabled }),
    ).rejects.toThrow("connected provider");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects an expired or missing session", async () => {
    prisma.session.findFirst.mockResolvedValue(null);
    await expect(
      updateEmailOtpSetting({
        userId: "owner",
        sessionId: "session",
        enabled: true,
      }),
    ).rejects.toThrow("connected provider");
    expect(prisma.session.findFirst).toHaveBeenCalledWith({
      where: {
        id: "session",
        userId: "owner",
        expires: { gt: expect.any(Date) },
      },
      select: { emailOtp: true },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("disables access, removes pending codes, and revokes only code-based sessions", async () => {
    prisma.user.update.mockResolvedValue({ id: "updated-user" } as never);
    prisma.verificationToken.deleteMany.mockResolvedValue({ count: 1 });
    prisma.session.deleteMany.mockResolvedValue({ count: 2 });
    await updateEmailOtpSetting({
      userId: "owner",
      sessionId: "session",
      enabled: false,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "owner" },
      data: { emailOtpEnabled: false, emailOtpVersion: { increment: 1 } },
    });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "owner", emailOtp: true },
    });
    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: "sign-in-otp-owner@example.com" },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      prisma.user.update.mock.results[0].value,
      prisma.verificationToken.deleteMany.mock.results[0].value,
      prisma.session.deleteMany.mock.results[0].value,
    ]);
  });

  it("normalizes the account email and pending-code identifier together", async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      email: " Owner@Example.com ",
    } as never);
    await updateEmailOtpSetting({
      userId: "owner",
      sessionId: "session",
      enabled: true,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "owner" },
      data: {
        emailOtpEnabled: true,
        emailOtpVersion: { increment: 1 },
        email: "owner@example.com",
      },
    });
    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: "sign-in-otp-owner@example.com" },
    });
  });

  it("requires email delivery to enable access but still allows disabling", async () => {
    vi.mocked(isTransactionalEmailConfigured).mockReturnValue(false);
    await expect(
      updateEmailOtpSetting({
        userId: "owner",
        sessionId: "session",
        enabled: true,
      }),
    ).rejects.toThrow("not configured");
    expect(prisma.user.update).not.toHaveBeenCalled();
    await expect(
      updateEmailOtpSetting({
        userId: "owner",
        sessionId: "session",
        enabled: false,
      }),
    ).resolves.toEqual({ enabled: false });
  });
});
