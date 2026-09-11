import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/prisma";
import { getWebhookEmailAccount } from "@/utils/webhook/validate-webhook-account";
import { createManagedOutlookSubscription } from "@/utils/outlook/subscription-manager";
import { backfillRecentOutlookMessages } from "@/utils/outlook/backfill-recent-messages";
import { processOutlookLifecycleNotification } from "@/app/api/outlook/webhook/process-lifecycle";

vi.mock("@/utils/prisma", () => ({
  default: {
    emailMessage: {
      findFirst: vi.fn(),
    },
    emailAccount: {
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("@/utils/webhook/validate-webhook-account", () => ({
  getWebhookEmailAccount: vi.fn(),
}));
vi.mock("@/utils/outlook/subscription-manager", () => ({
  createManagedOutlookSubscription: vi.fn(),
}));
vi.mock("@/utils/outlook/backfill-recent-messages", () => ({
  backfillRecentOutlookMessages: vi.fn(),
}));

describe("processOutlookLifecycleNotification", () => {
  const logger = createTestLogger();

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T11:30:00.000Z"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reconciles recent messages when Microsoft reports missed notifications", async () => {
    vi.mocked(getWebhookEmailAccount).mockResolvedValue({
      id: "email-account-id",
      email: "user@example.com",
      watchEmailsSubscriptionId: "current-subscription-id",
    } as any);
    vi.mocked(prisma.emailMessage.findFirst).mockResolvedValue({
      date: new Date("2026-04-16T11:00:00.000Z"),
    } as any);

    await processOutlookLifecycleNotification({
      notification: {
        subscriptionId: "current-subscription-id",
        lifecycleEvent: "missed",
      } as any,
      logger,
    });

    expect(backfillRecentOutlookMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-id",
        emailAddress: "user@example.com",
        subscriptionId: "current-subscription-id",
        after: new Date("2026-04-16T10:00:00.000Z"),
        maxMessages: 100,
      }),
    );
    expect(createManagedOutlookSubscription).not.toHaveBeenCalled();
  });

  it("force refreshes the subscription when reauthorization is required", async () => {
    vi.mocked(getWebhookEmailAccount).mockResolvedValue({
      id: "email-account-id",
      email: "user@example.com",
      watchEmailsSubscriptionId: "current-subscription-id",
    } as any);

    await processOutlookLifecycleNotification({
      notification: {
        subscriptionId: "current-subscription-id",
        lifecycleEvent: "reauthorizationRequired",
      } as any,
      logger,
    });

    expect(createManagedOutlookSubscription).toHaveBeenCalledWith({
      emailAccountId: "email-account-id",
      logger: expect.anything(),
      forceRefresh: true,
    });
    expect(backfillRecentOutlookMessages).not.toHaveBeenCalled();
  });

  it("recreates the subscription and backfills after subscriptionRemoved", async () => {
    vi.mocked(getWebhookEmailAccount).mockResolvedValue({
      id: "email-account-id",
      email: "user@example.com",
      watchEmailsSubscriptionId: "stale-subscription-id",
    } as any);
    vi.mocked(prisma.emailMessage.findFirst).mockResolvedValue({
      date: new Date("2026-04-16T11:00:00.000Z"),
    } as any);
    vi.mocked(createManagedOutlookSubscription).mockResolvedValue({
      subscriptionId: "refreshed-subscription-id",
      expirationDate: new Date("2026-04-17T00:00:00.000Z"),
    } as any);

    await processOutlookLifecycleNotification({
      notification: {
        subscriptionId: "stale-subscription-id",
        lifecycleEvent: "subscriptionRemoved",
      } as any,
      logger,
    });

    expect(createManagedOutlookSubscription).toHaveBeenCalledWith({
      emailAccountId: "email-account-id",
      logger: expect.anything(),
      forceRefresh: true,
    });
    expect(backfillRecentOutlookMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-id",
        emailAddress: "user@example.com",
        subscriptionId: "refreshed-subscription-id",
        after: new Date("2026-04-16T10:00:00.000Z"),
        maxMessages: 100,
      }),
    );
  });

  it("does not call subscription or backfill helpers for unknown lifecycle events", async () => {
    vi.mocked(getWebhookEmailAccount).mockResolvedValue({
      id: "email-account-id",
      email: "user@example.com",
      watchEmailsSubscriptionId: "current-subscription-id",
    } as any);

    await processOutlookLifecycleNotification({
      notification: {
        subscriptionId: "current-subscription-id",
        lifecycleEvent: "unknownFutureEvent",
      } as any,
      logger,
    });

    expect(createManagedOutlookSubscription).not.toHaveBeenCalled();
    expect(backfillRecentOutlookMessages).not.toHaveBeenCalled();
  });
});
