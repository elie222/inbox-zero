import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import type { ThreadsQuery } from "@/utils/threads/validation";

const { createEmailProviderMock, saveLearnedPatternMock } = vi.hoisted(() => ({
  createEmailProviderMock: vi.fn(),
  saveLearnedPatternMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: createEmailProviderMock,
}));
vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPattern: saveLearnedPatternMock,
}));

import { markNotColdEmailAction } from "@/utils/actions/cold-email";

const SENDER = "cold@example.com";
const OTHER_SENDER = "other@example.com";
const COLD_LABEL_ID = "Label_cold";

describe("markNotColdEmailAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: { userId: "user-1", provider: "google" },
    } as any);
    prisma.rule.findUnique.mockResolvedValue({
      id: "cold-rule",
      enabled: true,
      instructions: null,
      groupId: null,
      actions: [{ type: "LABEL", label: "Cold Email", labelId: COLD_LABEL_ID }],
    } as any);
    saveLearnedPatternMock.mockResolvedValue(undefined);
  });

  it("removes the Cold Email label from archived threads beyond the first page", async () => {
    const mailbox = new FakeMailbox([
      ...makeThreads("inbox", 20, { inInbox: true, labels: [COLD_LABEL_ID] }),
      ...makeThreads("archived", 230, {
        inInbox: false,
        labels: [COLD_LABEL_ID],
      }),
      ...makeThreads("unlabeled", 5, { inInbox: false, labels: [] }),
      ...makeThreads("other-sender", 3, {
        inInbox: false,
        labels: [COLD_LABEL_ID],
        from: OTHER_SENDER,
      }),
    ]);
    createEmailProviderMock.mockResolvedValue(mailbox.provider);

    const result = await markNotColdEmailAction("account-1", {
      sender: SENDER,
    });

    expect(result?.serverError).toBeUndefined();
    expect(mailbox.threadIdsWithLabel(COLD_LABEL_ID)).toEqual([
      "other-sender-0",
      "other-sender-1",
      "other-sender-2",
    ]);
    expect(saveLearnedPatternMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: SENDER,
        ruleId: "cold-rule",
        exclude: true,
      }),
    );
  });

  it("stops at the cap for very large senders", async () => {
    const mailbox = new FakeMailbox(
      makeThreads("archived", 700, { inInbox: false, labels: [COLD_LABEL_ID] }),
    );
    createEmailProviderMock.mockResolvedValue(mailbox.provider);

    const result = await markNotColdEmailAction("account-1", {
      sender: SENDER,
    });

    expect(result?.serverError).toBeUndefined();
    expect(mailbox.threadIdsWithLabel(COLD_LABEL_ID)).toHaveLength(200);
  });

  it("keeps unlabeling remaining threads when one removal fails", async () => {
    const mailbox = new FakeMailbox(
      makeThreads("archived", 25, { inInbox: false, labels: [COLD_LABEL_ID] }),
      { failingThreadIds: ["archived-0"] },
    );
    createEmailProviderMock.mockResolvedValue(mailbox.provider);

    const result = await markNotColdEmailAction("account-1", {
      sender: SENDER,
    });

    expect(result?.serverError).toBeUndefined();
    expect(mailbox.threadIdsWithLabel(COLD_LABEL_ID)).toEqual(["archived-0"]);
  });

  it("skips cleanup when the rule's label no longer exists in the mailbox", async () => {
    const mailbox = new FakeMailbox(
      makeThreads("archived", 5, { inInbox: false, labels: [] }),
      { existingLabelIds: [] },
    );
    createEmailProviderMock.mockResolvedValue(mailbox.provider);

    const result = await markNotColdEmailAction("account-1", {
      sender: SENDER,
    });

    expect(result?.serverError).toBeUndefined();
    expect(mailbox.provider.getThreadsWithQuery).not.toHaveBeenCalled();
    expect(mailbox.provider.removeThreadLabels).not.toHaveBeenCalled();
    expect(saveLearnedPatternMock).toHaveBeenCalled();
  });
});

type FakeThread = {
  id: string;
  from: string;
  inInbox: boolean;
  labels: Set<string>;
};

class FakeMailbox {
  private readonly threads: FakeThread[];
  private readonly existingLabelIds: Set<string>;
  private readonly failingThreadIds: Set<string>;

  constructor(
    threads: FakeThread[],
    {
      existingLabelIds = [COLD_LABEL_ID],
      failingThreadIds = [],
    }: { existingLabelIds?: string[]; failingThreadIds?: string[] } = {},
  ) {
    this.threads = threads;
    this.existingLabelIds = new Set(existingLabelIds);
    this.failingThreadIds = new Set(failingThreadIds);
  }

  threadIdsWithLabel(labelId: string) {
    return this.threads
      .filter((thread) => thread.labels.has(labelId))
      .map((thread) => thread.id);
  }

  // Mirrors provider semantics: no type/label means inbox only on Gmail, and
  // Outlook drops a label filter it can't resolve.
  readonly provider = {
    getLabelById: vi.fn(async (labelId: string) =>
      this.existingLabelIds.has(labelId)
        ? { id: labelId, name: "Cold Email", type: "user" }
        : null,
    ),
    getThreadsWithQuery: vi.fn(
      async ({
        query,
        maxResults = 50,
        pageToken,
      }: {
        query?: ThreadsQuery;
        maxResults?: number;
        pageToken?: string;
      }) => {
        const labelId = query?.labelId;
        const matching = this.threads.filter((thread) => {
          if (query?.fromEmail && thread.from !== query.fromEmail) return false;
          if (labelId && this.existingLabelIds.has(labelId)) {
            return thread.labels.has(labelId);
          }
          if (labelId) return true;
          if (query?.type === "all") return true;
          return thread.inInbox;
        });
        const start = pageToken ? Number(pageToken) : 0;
        const end = start + maxResults;
        return {
          threads: matching
            .slice(start, end)
            .map((thread) => ({ id: thread.id, messages: [], snippet: "" })),
          nextPageToken: end < matching.length ? String(end) : undefined,
        };
      },
    ),
    removeThreadLabels: vi.fn(async (threadId: string, labelIds: string[]) => {
      if (this.failingThreadIds.has(threadId)) throw new Error("Rate limited");
      const thread = this.threads.find((t) => t.id === threadId);
      for (const labelId of labelIds) thread?.labels.delete(labelId);
    }),
  };
}

function makeThreads(
  prefix: string,
  count: number,
  {
    inInbox,
    labels,
    from = SENDER,
  }: { inInbox: boolean; labels: string[]; from?: string },
): FakeThread[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    from,
    inInbox,
    labels: new Set(labels),
  }));
}
