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
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("disables access, removes pending codes, and revokes only code-based sessions", async () => {
    await updateEmailOtpSetting({
      userId: "owner",
      sessionId: "session",
      enabled: false,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "owner" },
      data: { emailOtpEnabled: false },
    });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "owner", emailOtp: true },
    });
    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: "sign-in-otp-owner@example.com" },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
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
