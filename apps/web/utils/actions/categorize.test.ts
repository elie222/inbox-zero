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
    mockLoadEmails.mockResolvedValue({
      pages: 1,
      loadedAfterMessages: 0,
      loadedBeforeMessages: 0,
      hasMoreAfter: false,
      hasMoreBefore: false,
    });
  });

  it("loads more email history and only queues newly discovered senders", async () => {
    mockGetUncategorizedSenders
      .mockResolvedValueOnce({
        uncategorizedSenders: [{ email: "first@example.com", name: "First" }],
      })
      .mockResolvedValueOnce({
        uncategorizedSenders: [
          { email: "first@example.com", name: "First" },
          { email: "second@example.com", name: "Second" },
        ],
      });

    mockLoadEmails
      .mockResolvedValueOnce({
        pages: 1,
        loadedAfterMessages: 0,
        loadedBeforeMessages: 20,
        hasMoreAfter: false,
        hasMoreBefore: true,
      })
      .mockResolvedValueOnce({
        pages: 1,
        loadedAfterMessages: 0,
        loadedBeforeMessages: 0,
        hasMoreAfter: false,
        hasMoreBefore: false,
      });

    const result = await bulkCategorizeSendersAction("account-1");

    expect(mockLoadEmails).toHaveBeenCalledTimes(2);
    expect(mockPublishToAiCategorizeSendersQueue).toHaveBeenNthCalledWith(1, {
      emailAccountId: "account-1",
      senders: [{ email: "first@example.com", name: "First" }],
    });
    expect(mockPublishToAiCategorizeSendersQueue).toHaveBeenNthCalledWith(2, {
      emailAccountId: "account-1",
      senders: [{ email: "second@example.com", name: "Second" }],
    });
    expect(result?.data).toEqual({
      totalUncategorizedSenders: 2,
    });
  });

  it("loads more email history before categorizing when the first pass finds no senders", async () => {
    mockGetUncategorizedSenders
      .mockResolvedValueOnce({
        uncategorizedSenders: [],
      })
      .mockResolvedValueOnce({
        uncategorizedSenders: [{ email: "sender@example.com", name: "Sender" }],
      });

    mockLoadEmails
      .mockResolvedValueOnce({
        pages: 1,
        loadedAfterMessages: 20,
        loadedBeforeMessages: 0,
        hasMoreAfter: true,
        hasMoreBefore: false,
      })
      .mockResolvedValueOnce({
        pages: 1,
        loadedAfterMessages: 0,
        loadedBeforeMessages: 0,
        hasMoreAfter: false,
        hasMoreBefore: false,
      });

    const result = await bulkCategorizeSendersAction("account-1");

    expect(mockLoadEmails).toHaveBeenCalledWith(
      {
        emailAccountId: "account-1",
        emailProvider: expect.anything(),
        logger: expect.anything(),
      },
      { loadBefore: true, maxPages: 5 },
    );
    expect(mockPublishToAiCategorizeSendersQueue).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      senders: [{ email: "sender@example.com", name: "Sender" }],
    });
    expect(result?.data).toEqual({
      totalUncategorizedSenders: 1,
    });
  });

  it("returns zero when categorization exhausts the available email history", async () => {
    mockGetUncategorizedSenders.mockResolvedValue({
      uncategorizedSenders: [],
    });

    const result = await bulkCategorizeSendersAction("account-1");

    expect(mockLoadEmails).toHaveBeenCalledOnce();
    expect(mockPublishToAiCategorizeSendersQueue).not.toHaveBeenCalled();
    expect(result?.data).toEqual({
      totalUncategorizedSenders: 0,
    });
  });

  it("dedupes queued senders case-insensitively across sync passes", async () => {
    mockGetUncategorizedSenders
      .mockResolvedValueOnce({
        uncategorizedSenders: [{ email: "Sender@example.com", name: "Sender" }],
      })
      .mockResolvedValueOnce({
        uncategorizedSenders: [
          { email: " sender@example.com ", name: "Sender duplicate" },
          { email: "second@example.com", name: "Second" },
        ],
      });

    mockLoadEmails
      .mockResolvedValueOnce({
        pages: 1,
        loadedAfterMessages: 0,
        loadedBeforeMessages: 10,
        hasMoreAfter: false,
        hasMoreBefore: true,
      })
      .mockResolvedValueOnce({
        pages: 1,
        loadedAfterMessages: 0,
        loadedBeforeMessages: 0,
        hasMoreAfter: false,
        hasMoreBefore: false,
      });

    await bulkCategorizeSendersAction("account-1");

    expect(mockPublishToAiCategorizeSendersQueue).toHaveBeenNthCalledWith(1, {
      emailAccountId: "account-1",
      senders: [{ email: "Sender@example.com", name: "Sender" }],
    });
    expect(mockPublishToAiCategorizeSendersQueue).toHaveBeenNthCalledWith(2, {
      emailAccountId: "account-1",
      senders: [{ email: "second@example.com", name: "Second" }],
    });
  });
});
