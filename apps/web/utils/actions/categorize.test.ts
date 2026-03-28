import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockEmailAccountWithAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { bulkCategorizeSendersAction } from "@/utils/actions/categorize";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const {
  mockValidateUserAndAiAccess,
  mockDeleteEmptyCategorizeSendersQueues,
  mockPublishToAiCategorizeSendersQueue,
  mockSaveCategorizationTotalItems,
  mockGetUncategorizedSenders,
  mockLoadEmails,
  mockCreateEmailProvider,
} = vi.hoisted(() => ({
  mockValidateUserAndAiAccess: vi.fn(),
  mockDeleteEmptyCategorizeSendersQueues: vi.fn(),
  mockPublishToAiCategorizeSendersQueue: vi.fn(),
  mockSaveCategorizationTotalItems: vi.fn(),
  mockGetUncategorizedSenders: vi.fn(),
  mockLoadEmails: vi.fn(),
  mockCreateEmailProvider: vi.fn(),
}));

vi.mock("@/utils/user/validate", () => ({
  validateUserAndAiAccess: (
    ...args: Parameters<typeof mockValidateUserAndAiAccess>
  ) => mockValidateUserAndAiAccess(...args),
}));

vi.mock("@/utils/upstash/categorize-senders", () => ({
  deleteEmptyCategorizeSendersQueues: (
    ...args: Parameters<typeof mockDeleteEmptyCategorizeSendersQueues>
  ) => mockDeleteEmptyCategorizeSendersQueues(...args),
  publishToAiCategorizeSendersQueue: (
    ...args: Parameters<typeof mockPublishToAiCategorizeSendersQueue>
  ) => mockPublishToAiCategorizeSendersQueue(...args),
}));

vi.mock("@/utils/redis/categorization-progress", () => ({
  saveCategorizationTotalItems: (
    ...args: Parameters<typeof mockSaveCategorizationTotalItems>
  ) => mockSaveCategorizationTotalItems(...args),
}));

vi.mock(
  "@/app/api/user/categorize/senders/uncategorized/get-uncategorized-senders",
  () => ({
    getUncategorizedSenders: (
      ...args: Parameters<typeof mockGetUncategorizedSenders>
    ) => mockGetUncategorizedSenders(...args),
  }),
);

vi.mock("@/utils/actions/stats", () => ({
  loadEmails: (...args: Parameters<typeof mockLoadEmails>) =>
    mockLoadEmails(...args),
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: (...args: Parameters<typeof mockCreateEmailProvider>) =>
    mockCreateEmailProvider(...args),
}));

describe("bulkCategorizeSendersAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockValidateUserAndAiAccess.mockResolvedValue({
      emailAccount: { id: "account-1" },
    });

    prisma.category.createMany.mockResolvedValue({ count: 0 } as never);
    prisma.emailAccount.update.mockResolvedValue({ id: "account-1" } as never);
    prisma.emailAccount.findUnique.mockResolvedValue(
      getMockEmailAccountWithAccount({
        id: "account-1",
        userId: "user-1",
        provider: "google",
      }) as never,
    );

    mockDeleteEmptyCategorizeSendersQueues.mockResolvedValue(undefined);
    mockSaveCategorizationTotalItems.mockResolvedValue(undefined);
    mockPublishToAiCategorizeSendersQueue.mockResolvedValue(undefined);
    mockCreateEmailProvider.mockResolvedValue({} as never);
    mockLoadEmails.mockResolvedValue({ pages: 1 });
  });

  it("bootstraps recent emails before categorizing when no local messages exist", async () => {
    prisma.emailMessage.findFirst
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ id: "message-1" } as never);

    mockGetUncategorizedSenders.mockResolvedValueOnce({
      uncategorizedSenders: [{ email: "sender@example.com", name: "Sender" }],
    });

    const result = await bulkCategorizeSendersAction("account-1");

    expect(mockLoadEmails).toHaveBeenCalledWith(
      {
        emailAccountId: "account-1",
        emailProvider: expect.anything(),
        logger: expect.anything(),
      },
      { loadBefore: false, maxPages: 5 },
    );
    expect(mockPublishToAiCategorizeSendersQueue).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      senders: [{ email: "sender@example.com", name: "Sender" }],
    });
    expect(result?.data).toEqual({
      totalUncategorizedSenders: 1,
      hasSyncedMessages: true,
    });
  });

  it("returns no-synced-messages when bootstrap sync still finds nothing", async () => {
    prisma.emailMessage.findFirst
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(null as never);

    mockGetUncategorizedSenders.mockResolvedValueOnce({
      uncategorizedSenders: [],
    });

    const result = await bulkCategorizeSendersAction("account-1");

    expect(mockLoadEmails).toHaveBeenCalledOnce();
    expect(mockPublishToAiCategorizeSendersQueue).not.toHaveBeenCalled();
    expect(result?.data).toEqual({
      totalUncategorizedSenders: 0,
      hasSyncedMessages: false,
    });
  });
});
