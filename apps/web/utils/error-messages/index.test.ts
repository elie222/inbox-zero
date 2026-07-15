import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { sendActionRequiredEmail } from "@inboxzero/resend";
import {
  addUserErrorMessageWithNotification,
  clearAccountDisconnectedErrorIfResolved,
  clearWatchLapsedErrorIfResolved,
  ErrorType,
  getUserErrorMessages,
  watchLapsedErrorKey,
} from "@/utils/error-messages";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/prisma");
vi.mock("@inboxzero/resend", () => ({
  sendActionRequiredEmail: vi.fn(),
}));
vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: false,
    NEXT_PUBLIC_BASE_URL: "https://example.com",
    RESEND_FROM_EMAIL: "support@example.com",
  },
}));
vi.mock("@/utils/unsubscribe", () => ({
  createUnsubscribeToken: vi.fn(),
}));

describe("getUserErrorMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes legacy trial AI limit errors from generic user errors", async () => {
    prisma.user.findUnique.mockResolvedValue({
      errorMessages: {
        [ErrorType.TRIAL_AI_LIMIT_REACHED]: {
          message: "Trial limit reached",
          timestamp: "2026-05-08T18:01:24.429Z",
        },
      },
    } as any);

    const result = await getUserErrorMessages("user-1");

    expect(result).toBeNull();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { errorMessages: {} },
    });
  });

  it("keeps unrelated errors when removing a legacy trial AI limit error", async () => {
    const apiKeyError = {
      message: "Invalid API key",
      timestamp: "2026-05-08T18:01:24.429Z",
    };

    prisma.user.findUnique.mockResolvedValue({
      errorMessages: {
        [ErrorType.TRIAL_AI_LIMIT_REACHED]: {
          message: "Trial limit reached",
          timestamp: "2026-05-08T18:01:24.429Z",
        },
        [ErrorType.INVALID_AI_MODEL]: apiKeyError,
      },
    } as any);

    const result = await getUserErrorMessages("user-1");

    expect(result).toEqual({ [ErrorType.INVALID_AI_MODEL]: apiKeyError });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { errorMessages: { [ErrorType.INVALID_AI_MODEL]: apiKeyError } },
    });
  });

  it("returns durable user errors unchanged", async () => {
    const errorMessages = {
      [ErrorType.INVALID_AI_MODEL]: {
        message: "Invalid API key",
        timestamp: "2026-05-08T18:01:24.429Z",
      },
    };

    prisma.user.findUnique.mockResolvedValue({
      errorMessages,
    } as any);

    const result = await getUserErrorMessages("user-1");

    expect(result).toEqual(errorMessages);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("clearAccountDisconnectedErrorIfResolved", () => {
  const logger = createTestLogger();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the disconnect error while another account remains disconnected", async () => {
    prisma.emailAccount.count.mockResolvedValue(1);

    await clearAccountDisconnectedErrorIfResolved({
      userId: "user-1",
      logger,
    });

    expect(prisma.emailAccount.count).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        account: { disconnectedAt: { not: null } },
      },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("clears the disconnect error when no accounts remain disconnected", async () => {
    prisma.emailAccount.count.mockResolvedValue(0);
    prisma.user.findUnique.mockResolvedValue({
      errorMessages: {
        [ErrorType.ACCOUNT_DISCONNECTED]: {
          message: "Reconnect",
          timestamp: "2026-06-24T04:00:40.506Z",
        },
        [ErrorType.INVALID_AI_MODEL]: {
          message: "Invalid model",
          timestamp: "2026-06-24T04:00:40.506Z",
        },
      },
    } as any);

    await clearAccountDisconnectedErrorIfResolved({
      userId: "user-1",
      logger,
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        errorMessages: {
          [ErrorType.INVALID_AI_MODEL]: {
            message: "Invalid model",
            timestamp: "2026-06-24T04:00:40.506Z",
          },
        },
      },
    });
  });
});

describe("clearWatchLapsedErrorIfResolved", () => {
  const logger = createTestLogger();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears only the recovered account's lapse entry, leaving other accounts' entries intact", async () => {
    prisma.user.findUnique.mockResolvedValue({
      errorMessages: {
        [watchLapsedErrorKey("email-account-1")]: {
          message: "Automation stopped for account 1",
          timestamp: "2026-07-01T04:00:40.506Z",
          emailSentAt: "2026-07-01T04:00:40.506Z",
        },
        [watchLapsedErrorKey("email-account-2")]: {
          message: "Automation stopped for account 2",
          timestamp: "2026-07-01T04:00:40.506Z",
          emailSentAt: "2026-07-01T04:00:40.506Z",
        },
        [ErrorType.INVALID_AI_MODEL]: {
          message: "Invalid model",
          timestamp: "2026-06-24T04:00:40.506Z",
        },
      },
    } as any);

    await clearWatchLapsedErrorIfResolved({
      userId: "user-1",
      emailAccountId: "email-account-1",
      logger,
    });

    expect(prisma.emailAccount.count).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        errorMessages: {
          [watchLapsedErrorKey("email-account-2")]: {
            message: "Automation stopped for account 2",
            timestamp: "2026-07-01T04:00:40.506Z",
            emailSentAt: "2026-07-01T04:00:40.506Z",
          },
          [ErrorType.INVALID_AI_MODEL]: {
            message: "Invalid model",
            timestamp: "2026-06-24T04:00:40.506Z",
          },
        },
      },
    });
  });
});

describe("addUserErrorMessageWithNotification", () => {
  const logger = createTestLogger();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the notification email on the first occurrence and records emailSentAt", async () => {
    prisma.user.findUnique.mockResolvedValue({ errorMessages: {} } as any);

    await addUserErrorMessageWithNotification({
      userId: "user-1",
      userEmail: "user@example.com",
      emailAccountId: "email-account-1",
      errorType: ErrorType.EMAIL_WATCH_LAPSED,
      errorMessage: "Automation stopped",
      logger,
    });

    expect(sendActionRequiredEmail).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        errorMessages: {
          [ErrorType.EMAIL_WATCH_LAPSED]: expect.objectContaining({
            message: "Automation stopped",
            emailSentAt: expect.any(String),
          }),
        },
      },
    });
  });

  it("skips the write entirely once already notified with the same message", async () => {
    prisma.user.findUnique.mockResolvedValue({
      errorMessages: {
        [ErrorType.EMAIL_WATCH_LAPSED]: {
          message: "Automation stopped",
          timestamp: "2026-07-01T04:00:40.506Z",
          emailSentAt: "2026-07-01T04:00:40.506Z",
        },
      },
    } as any);

    await addUserErrorMessageWithNotification({
      userId: "user-1",
      userEmail: "user@example.com",
      emailAccountId: "email-account-1",
      errorType: ErrorType.EMAIL_WATCH_LAPSED,
      errorMessage: "Automation stopped",
      logger,
    });

    expect(sendActionRequiredEmail).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("updates the stored message without re-sending when the message text changes", async () => {
    prisma.user.findUnique.mockResolvedValue({
      errorMessages: {
        [ErrorType.EMAIL_WATCH_LAPSED]: {
          message: "Automation stopped",
          timestamp: "2026-07-01T04:00:40.506Z",
          emailSentAt: "2026-07-01T04:00:40.506Z",
        },
      },
    } as any);

    await addUserErrorMessageWithNotification({
      userId: "user-1",
      userEmail: "user@example.com",
      emailAccountId: "email-account-1",
      errorType: ErrorType.EMAIL_WATCH_LAPSED,
      errorMessage: "Automation stopped again",
      logger,
    });

    expect(sendActionRequiredEmail).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        errorMessages: {
          [ErrorType.EMAIL_WATCH_LAPSED]: expect.objectContaining({
            message: "Automation stopped again",
            emailSentAt: "2026-07-01T04:00:40.506Z",
          }),
        },
      },
    });
  });

  it("stores and dedupes per storageKey when accounts lapse independently", async () => {
    prisma.user.findUnique.mockResolvedValue({
      errorMessages: {
        [watchLapsedErrorKey("email-account-1")]: {
          message: "Automation stopped for account 1",
          timestamp: "2026-07-01T04:00:40.506Z",
          emailSentAt: "2026-07-01T04:00:40.506Z",
        },
      },
    } as any);

    await addUserErrorMessageWithNotification({
      userId: "user-1",
      userEmail: "user@example.com",
      emailAccountId: "email-account-2",
      errorType: ErrorType.EMAIL_WATCH_LAPSED,
      storageKey: watchLapsedErrorKey("email-account-2"),
      errorMessage: "Automation stopped for account 2",
      logger,
    });

    expect(sendActionRequiredEmail).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        errorMessages: {
          [watchLapsedErrorKey("email-account-1")]: {
            message: "Automation stopped for account 1",
            timestamp: "2026-07-01T04:00:40.506Z",
            emailSentAt: "2026-07-01T04:00:40.506Z",
          },
          [watchLapsedErrorKey("email-account-2")]: expect.objectContaining({
            message: "Automation stopped for account 2",
            emailSentAt: expect.any(String),
          }),
        },
      },
    });
  });
});
