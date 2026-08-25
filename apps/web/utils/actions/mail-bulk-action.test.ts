import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockEmailAccountWithAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import {
  bulkArchiveAction,
  bulkArchiveThreadsAction,
} from "@/utils/actions/mail-bulk-action";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const {
  envMock,
  mockBulkArchiveFromSenders,
  mockBulkArchiveThreads,
  mockCreateEmailProvider,
} = vi.hoisted(() => ({
  envMock: {
    NODE_ENV: "test",
  },
  mockBulkArchiveFromSenders: vi.fn(),
  mockBulkArchiveThreads: vi.fn(),
  mockCreateEmailProvider: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: (...args: Parameters<typeof mockCreateEmailProvider>) =>
    mockCreateEmailProvider(...args),
}));

describe("bulkArchiveAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue(
      getMockEmailAccountWithAccount({
        email: "owner@example.com",
        userId: "user-1",
        provider: "google",
      }),
    );
    mockCreateEmailProvider.mockResolvedValue({
      bulkArchiveFromSenders: mockBulkArchiveFromSenders,
      bulkArchiveThreads: mockBulkArchiveThreads,
    });
  });

  it("archives Gmail senders directly with the provider", async () => {
    const result = await bulkArchiveAction("account-1", {
      froms: ["first@example.com", "second@example.com"],
    });

    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toBeUndefined();
    expect(mockCreateEmailProvider).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      provider: "google",
      logger: expect.anything(),
    });
    expect(mockBulkArchiveFromSenders).toHaveBeenCalledWith(
      ["first@example.com", "second@example.com"],
      "owner@example.com",
      "account-1",
    );
  });

  it("archives Outlook senders directly with the provider", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(
      getMockEmailAccountWithAccount({
        email: "owner@example.com",
        userId: "user-1",
        provider: "microsoft",
      }),
    );

    const result = await bulkArchiveAction("account-1", {
      froms: ["sender@example.com"],
    });

    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toBeUndefined();
    expect(mockCreateEmailProvider).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      provider: "microsoft",
      logger: expect.anything(),
    });
    expect(mockBulkArchiveFromSenders).toHaveBeenCalledWith(
      ["sender@example.com"],
      "owner@example.com",
      "account-1",
    );
  });

  it("returns exact thread results from one provider bulk archive", async () => {
    mockBulkArchiveThreads.mockResolvedValue({
      succeededThreadIds: ["thread-1"],
      failedThreadIds: ["thread-2"],
    });

    const result = await bulkArchiveThreadsAction("account-1", {
      threads: [
        { threadId: "thread-1", messageIds: ["message-1", "message-2"] },
        { threadId: "thread-2", messageIds: ["message-3"] },
      ],
    });

    expect(result?.serverError).toBeUndefined();
    expect(mockBulkArchiveThreads).toHaveBeenCalledOnce();
    expect(mockBulkArchiveThreads).toHaveBeenCalledWith(
      [
        { threadId: "thread-1", messageIds: ["message-1", "message-2"] },
        { threadId: "thread-2", messageIds: ["message-3"] },
      ],
      "owner@example.com",
    );
    expect(result?.data).toEqual({
      succeededThreadIds: ["thread-1"],
      failedThreadIds: ["thread-2"],
    });
  });
});
