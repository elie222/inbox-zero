import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockEmailAccountWithAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { bulkArchiveAction } from "@/utils/actions/mail-bulk-action";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const { envMock, mockEnqueueBulkArchiveSenderJobs, mockCreateEmailProvider } =
  vi.hoisted(() => ({
    envMock: {
      NODE_ENV: "test",
    },
    mockEnqueueBulkArchiveSenderJobs: vi.fn(),
    mockCreateEmailProvider: vi.fn(),
  }));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/email/bulk-archive-queue", () => ({
  enqueueBulkArchiveSenderJobs: (
    ...args: Parameters<typeof mockEnqueueBulkArchiveSenderJobs>
  ) => mockEnqueueBulkArchiveSenderJobs(...args),
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
    mockEnqueueBulkArchiveSenderJobs.mockResolvedValue(2);
  });

  it("queues Gmail sender archives through the backend queue", async () => {
    const result = await bulkArchiveAction("account-1", {
      froms: ["first@example.com", "second@example.com"],
    });

    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toEqual({
      mode: "queued",
      queuedSenders: 2,
    });
    expect(mockEnqueueBulkArchiveSenderJobs).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      ownerEmail: "owner@example.com",
      provider: "google",
      froms: ["first@example.com", "second@example.com"],
      logger: expect.anything(),
    });
    expect(mockCreateEmailProvider).not.toHaveBeenCalled();
  });

  it("queues Outlook sender archives through the backend queue", async () => {
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
    expect(result?.data).toEqual({
      mode: "queued",
      queuedSenders: 2,
    });
    expect(mockEnqueueBulkArchiveSenderJobs).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      ownerEmail: "owner@example.com",
      provider: "microsoft",
      froms: ["sender@example.com"],
      logger: expect.anything(),
    });
    expect(mockCreateEmailProvider).not.toHaveBeenCalled();
  });
});
