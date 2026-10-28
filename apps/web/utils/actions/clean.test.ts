import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockEmailAccountWithAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { cleanInboxAction } from "@/utils/actions/clean";
import { CleanAction } from "@/generated/prisma/enums";
import { bulkPublishToQstash } from "@/utils/upstash";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const { pendingWork, mockGetThreadsWithQuery } = vi.hoisted(() => ({
  pendingWork: [] as Promise<unknown>[],
  mockGetThreadsWithQuery: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => Promise<unknown>) => {
    pendingWork.push(callback());
  },
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(async () => ({
    getOrCreateInboxZeroLabel: vi.fn(async (key: string) => ({
      id: `label-${key}`,
    })),
    getThreadsWithQuery: mockGetThreadsWithQuery,
  })),
}));
vi.mock("@/utils/assess", () => ({
  getUnhandledCount: vi.fn(async () => ({ type: "inbox" })),
}));
vi.mock("@/utils/user/get", () => ({
  getUserPremium: vi.fn(async () => ({ id: "premium-1" })),
}));
vi.mock("@/utils/premium", () => ({
  isActivePremium: vi.fn(() => true),
}));
vi.mock("@/utils/upstash", () => ({
  bulkPublishToQstash: vi.fn(),
}));

describe("cleanInboxAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingWork.length = 0;

    prisma.emailAccount.findUnique.mockResolvedValue(
      getMockEmailAccountWithAccount({
        id: "account-1",
        userId: "user-1",
        provider: "google",
      }) as never,
    );
    prisma.cleanupJob.create.mockResolvedValue({ id: "job-1" } as never);
  });

  it("fetches each page of the inbox once instead of refetching the first page", async () => {
    mockGetThreadsWithQuery
      .mockResolvedValueOnce({
        threads: [{ id: "thread-1" }],
        nextPageToken: "page-2",
      })
      .mockResolvedValueOnce({ threads: [{ id: "thread-2" }] });

    const result = await cleanInboxAction("account-1", {
      action: CleanAction.ARCHIVE,
      daysOld: 0,
      instructions: "",
      skips: {
        reply: true,
        starred: true,
        calendar: true,
        receipt: false,
        attachment: false,
        conversation: false,
      },
    });
    await Promise.all(pendingWork);

    expect(result?.serverError).toBeUndefined();
    expect(mockGetThreadsWithQuery).toHaveBeenCalledTimes(2);
    expect(mockGetThreadsWithQuery.mock.calls[0][0].pageToken).toBeUndefined();
    expect(mockGetThreadsWithQuery.mock.calls[1][0].pageToken).toBe("page-2");

    const publishedThreadIds = vi
      .mocked(bulkPublishToQstash)
      .mock.calls.flatMap(([{ items }]) =>
        items.map((item) => (item.body as { threadId: string }).threadId),
      );
    expect(publishedThreadIds).toEqual(["thread-1", "thread-2"]);
  });
});
