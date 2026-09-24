import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { handleBatchRequest } from "./handle-batch";
import type { RequestWithLogger } from "@/utils/middleware";

vi.mock("@/utils/prisma");

const {
  mockCategorizeWithAi,
  mockGetCategories,
  mockUpdateSenderCategory,
  mockValidateUserAndAiAccess,
  mockCreateEmailProvider,
  mockSaveCategorizationProgress,
} = vi.hoisted(() => ({
  mockCategorizeWithAi: vi.fn(),
  mockGetCategories: vi.fn(),
  mockUpdateSenderCategory: vi.fn(),
  mockValidateUserAndAiAccess: vi.fn(),
  mockCreateEmailProvider: vi.fn(),
  mockSaveCategorizationProgress: vi.fn(),
}));

vi.mock("@/utils/categorize/senders/categorize", () => ({
  categorizeWithAi: (...args: Parameters<typeof mockCategorizeWithAi>) =>
    mockCategorizeWithAi(...args),
  getCategories: (...args: Parameters<typeof mockGetCategories>) =>
    mockGetCategories(...args),
  updateSenderCategory: (
    ...args: Parameters<typeof mockUpdateSenderCategory>
  ) => mockUpdateSenderCategory(...args),
}));

vi.mock("@/utils/user/validate", () => ({
  validateUserAndAiAccess: (
    ...args: Parameters<typeof mockValidateUserAndAiAccess>
  ) => mockValidateUserAndAiAccess(...args),
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: (...args: Parameters<typeof mockCreateEmailProvider>) =>
    mockCreateEmailProvider(...args),
}));

vi.mock("@/utils/redis/categorization-progress", () => ({
  saveCategorizationProgress: (
    ...args: Parameters<typeof mockSaveCategorizationProgress>
  ) => mockSaveCategorizationProgress(...args),
}));

function createRequest(body: unknown) {
  return {
    json: async () => body,
    logger: createTestLogger(),
  } as unknown as RequestWithLogger;
}

describe("handleBatchRequest", () => {
  const senders = [
    { email: "a@example.com", name: "A" },
    { email: "b@example.com", name: "B" },
    { email: "c@example.com", name: "C" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockValidateUserAndAiAccess.mockResolvedValue({
      emailAccount: { id: "account-1", email: "user@example.com" },
    });
    mockGetCategories.mockResolvedValue({
      categories: [{ id: "cat-1", name: "Marketing" }],
    });
    prisma.emailAccount.findUnique.mockResolvedValue({
      account: { provider: "google" },
    } as never);
    mockCreateEmailProvider.mockResolvedValue({
      getThreadsFromSenderWithSubject: vi.fn().mockResolvedValue([]),
    });
    mockCategorizeWithAi.mockResolvedValue(
      senders.map((sender) => ({
        sender: sender.email,
        category: "Marketing",
      })),
    );
    mockUpdateSenderCategory.mockResolvedValue({ newsletter: {} });
    mockSaveCategorizationProgress.mockResolvedValue(undefined);
  });

  it("saves every sender and records progress", async () => {
    const response = await handleBatchRequest(
      createRequest({ emailAccountId: "account-1", senders }),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateSenderCategory).toHaveBeenCalledTimes(3);
    expect(mockSaveCategorizationProgress).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      incrementCompleted: 3,
    });
  });

  it("continues past a sender whose save fails and still records progress", async () => {
    mockUpdateSenderCategory.mockImplementation(({ sender }) => {
      if (sender === "b@example.com") {
        throw new Error("Invalid sender email address");
      }
      return Promise.resolve({ newsletter: {} });
    });

    const response = await handleBatchRequest(
      createRequest({ emailAccountId: "account-1", senders }),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateSenderCategory).toHaveBeenCalledTimes(3);
    expect(mockUpdateSenderCategory).toHaveBeenCalledWith(
      expect.objectContaining({ sender: "c@example.com" }),
    );
    expect(mockSaveCategorizationProgress).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      incrementCompleted: 3,
    });
  });
});
