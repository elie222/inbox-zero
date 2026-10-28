import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockEmailAccountWithAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import {
  bulkCategorizeSendersAction,
  createCategoryAction,
  upsertDefaultCategoriesAction,
} from "@/utils/actions/categorize";

vi.mock("@/utils/prisma");
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const {
  mockValidateUserAndAiAccess,
  mockCreateEmailProvider,
  mockStartBulkCategorization,
} = vi.hoisted(() => ({
  mockValidateUserAndAiAccess: vi.fn(),
  mockCreateEmailProvider: vi.fn(),
  mockStartBulkCategorization: vi.fn(),
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

vi.mock("@/utils/categorize/senders/start-bulk-categorization", () => ({
  startBulkCategorization: (
    ...args: Parameters<typeof mockStartBulkCategorization>
  ) => mockStartBulkCategorization(...args),
}));

describe("bulkCategorizeSendersAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockValidateUserAndAiAccess.mockResolvedValue({
      emailAccount: { id: "account-1" },
    });
    prisma.emailAccount.findUnique.mockResolvedValue(
      getMockEmailAccountWithAccount({
        id: "account-1",
        userId: "user-1",
        provider: "google",
      }) as never,
    );
    mockCreateEmailProvider.mockResolvedValue({ provider: "google" } as never);
    mockStartBulkCategorization.mockResolvedValue({
      started: true,
      alreadyRunning: false,
      totalQueuedSenders: 3,
      autoCategorizeSenders: true,
      progress: {
        status: "running",
        totalItems: 3,
        completedItems: 0,
        remainingItems: 3,
        message: "Categorizing senders: 0 of 3 completed.",
      },
    });
  });

  it("delegates to the shared start helper and returns the queued sender count", async () => {
    const result = await bulkCategorizeSendersAction("account-1");

    expect(mockValidateUserAndAiAccess).toHaveBeenCalledWith({
      emailAccountId: "account-1",
    });
    expect(mockCreateEmailProvider).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      provider: "google",
      logger: expect.anything(),
    });
    expect(mockStartBulkCategorization).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      emailProvider: { provider: "google" },
      logger: expect.anything(),
    });
    expect(result?.data).toEqual({
      totalUncategorizedSenders: 3,
    });
  });
});

describe("category actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue(
      getMockEmailAccountWithAccount({
        id: "account-1",
        userId: "user-1",
        provider: "google",
      }) as never,
    );
    prisma.category.create.mockResolvedValue({ id: "new-category" } as never);
    prisma.category.update.mockResolvedValue({ id: "category-1" } as never);
  });

  it("updates the existing category when editing it", async () => {
    const result = await createCategoryAction("account-1", {
      id: "category-1",
      name: "Newsletter",
      description: "Updated description",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: "category-1", emailAccountId: "account-1" },
      data: { name: "Newsletter", description: "Updated description" },
    });
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it("saves setup changes without recreating categories that already exist", async () => {
    const result = await upsertDefaultCategoriesAction("account-1", {
      categories: [
        { id: "category-1", name: "Newsletter", enabled: true },
        { name: "Receipt", enabled: true },
        { id: "category-3", name: "Marketing", enabled: false },
      ],
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.category.create).toHaveBeenCalledTimes(1);
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        emailAccountId: "account-1",
        name: "Receipt",
      }),
    });
    expect(prisma.category.update).not.toHaveBeenCalled();
    expect(prisma.category.delete).toHaveBeenCalledWith({
      where: { id: "category-3", emailAccountId: "account-1" },
    });
  });
});
