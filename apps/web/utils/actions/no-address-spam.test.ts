import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockEmailAccountWithAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import {
  moveThreadsToJunkAction,
  restoreThreadsToInboxAction,
} from "@/utils/actions/no-address-spam";
import { MOVE_THREADS_ACTION_LIMIT } from "@/utils/actions/no-address-spam.validation";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const { mockMarkSpam, mockMarkNotSpam, mockUnarchiveThread, mockCreate } =
  vi.hoisted(() => ({
    mockMarkSpam: vi.fn(),
    mockMarkNotSpam: vi.fn(),
    mockUnarchiveThread: vi.fn(),
    mockCreate: vi.fn(),
  }));

vi.mock("@/env", () => ({ env: { NODE_ENV: "test" } }));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: (...args: unknown[]) => mockCreate(...args),
}));

describe("no-address spam actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue(
      getMockEmailAccountWithAccount({
        email: "owner@example.com",
        userId: "user-1",
        provider: "microsoft",
      }),
    );
    mockCreate.mockResolvedValue({
      markSpam: mockMarkSpam,
      markNotSpam: mockMarkNotSpam,
      unarchiveThread: mockUnarchiveThread,
    });
  });

  it("moves each thread to junk, one provider call per thread", async () => {
    const result = await moveThreadsToJunkAction("account-1", {
      threadIds: ["t1", "t2", "t3"],
    });

    expect(mockMarkSpam.mock.calls.map(([id]) => id).sort()).toEqual([
      "t1",
      "t2",
      "t3",
    ]);
    expect(result?.data).toEqual({
      succeededThreadIds: ["t1", "t2", "t3"],
      failedThreadIds: [],
    });
  });

  it("reports the threads that failed and only forgets the ones that moved", async () => {
    mockMarkSpam.mockImplementation(async (threadId: string) => {
      if (threadId === "t2") throw new Error("Graph rejected the move");
    });

    const result = await moveThreadsToJunkAction("account-1", {
      threadIds: ["t1", "t2"],
    });

    expect(result?.data).toEqual({
      succeededThreadIds: ["t1"],
      failedThreadIds: ["t2"],
    });
    expect(prisma.emailMessage.deleteMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-1",
        from: "",
        threadId: { in: ["t1"] },
      },
    });
  });

  it("rejects a batch over the limit before touching the mailbox", async () => {
    const result = await moveThreadsToJunkAction("account-1", {
      threadIds: Array.from(
        { length: MOVE_THREADS_ACTION_LIMIT + 1 },
        (_, index) => `t${index}`,
      ),
    });

    expect(result?.validationErrors).toBeDefined();
    expect(mockMarkSpam).not.toHaveBeenCalled();
  });

  it("undoes a junk move with markNotSpam and an archive with unarchiveThread", async () => {
    await restoreThreadsToInboxAction("account-1", {
      threadIds: ["t1"],
      from: "junk",
    });
    await restoreThreadsToInboxAction("account-1", {
      threadIds: ["t2"],
      from: "archive",
    });

    expect(mockMarkNotSpam).toHaveBeenCalledExactlyOnceWith("t1");
    expect(mockUnarchiveThread).toHaveBeenCalledExactlyOnceWith("t2");
  });
});
