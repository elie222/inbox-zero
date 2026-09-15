import { describe, expect, it, vi } from "vitest";
import { fetchThreadsPage } from "@/utils/threads/fetch-page";

vi.mock("@/utils/redis/thread-page-buffer", () => ({
  createPageBuffer: vi.fn(() => undefined),
}));

describe("fetchThreadsPage", () => {
  it.each([
    { anyLabelIds: ["label-a"] },
    { anyLabelIds: ["label-a", "label-b"] },
  ])("preserves a required singular label when matching any of $anyLabelIds", async ({
    anyLabelIds,
  }) => {
    const emailProvider = {
      getThreadsWithQuery: vi.fn(async ({ query }) => ({
        threads: query.labelIds.includes("required-label")
          ? []
          : [{ id: "outside-required-label", messages: [] }],
      })),
    };

    const result = await fetchThreadsPage({
      emailAccountId: "account-1",
      query: { labelId: "required-label", anyLabelIds },
      emailProvider: emailProvider as never,
      maxResults: 50,
      messageFormat: "metadata",
    });

    expect(result.threads).toEqual([]);
    const queriedLabels = emailProvider.getThreadsWithQuery.mock.calls.map(
      ([{ query }]) => query.labelIds,
    );
    expect(queriedLabels).toHaveLength(anyLabelIds.length);
    expect(queriedLabels).toEqual(
      expect.arrayContaining(
        anyLabelIds.map((labelId) => ["required-label", labelId]),
      ),
    );
  });
});

describe("match-any pagination", () => {
  it("keeps overflow and deduplicates threads across condition pages", async () => {
    const thread = (id: string, date: number) => ({
      id,
      messages: [{ internalDate: String(date) }],
    });
    const emailProvider = {
      getThreadsWithQuery: vi.fn(async ({ query }) => ({
        threads: query.fromEmail
          ? [thread("newest", 4000), thread("shared", 3000)]
          : [thread("shared", 3000), thread("oldest", 1000)],
      })),
    };
    const load = (pageToken?: string) =>
      fetchThreadsPage({
        emailAccountId: "account-1",
        query: {
          labelId: "INBOX",
          anyOf: [{ fromEmail: "sender@example.com" }, { labelId: "STARRED" }],
        },
        emailProvider: emailProvider as never,
        maxResults: 2,
        pageToken,
        messageFormat: "metadata",
      });
    const first = await load();
    expect(first.threads.map(({ id }) => id)).toEqual(["newest", "shared"]);
    expect(first.nextPageToken).toBeTruthy();
    const second = await load(first.nextPageToken);
    expect(second.threads.map(({ id }) => id)).toEqual(["oldest"]);
    expect(second.nextPageToken).toBeUndefined();
    expect(
      emailProvider.getThreadsWithQuery.mock.calls.some(
        ([{ query }]) =>
          query.labelIds?.includes("STARRED") &&
          query.labelIds.includes("INBOX"),
      ),
    ).toBe(true);
  });
});

describe("Other pagination", () => {
  const excludeSplits = [
    {
      matchAll: true,
      filters: [{ kind: "LABEL" as const, value: "newsletter" }],
    },
  ];
  const thread = (id: string, labels: string[]) => ({
    id,
    messages: [{ labelIds: ["INBOX", ...labels] }],
  });

  it("fills pages past excluded conversations without losing the continuation", async () => {
    const emailProvider = {
      name: "google",
      getThreadsWithQuery: vi
        .fn()
        .mockResolvedValueOnce({
          threads: [thread("excluded", ["newsletter"])],
          nextPageToken: "second",
        })
        .mockResolvedValueOnce({
          threads: [thread("kept", [])],
          nextPageToken: "third",
        }),
    };
    const result = await fetchThreadsPage({
      query: { type: "inbox", excludeSplits },
      emailProvider: emailProvider as never,
      emailAccountId: "account",
      maxResults: 1,
      messageFormat: "metadata",
    });
    expect(result.threads.map(({ id }) => id)).toEqual(["kept"]);
    expect(result.nextPageToken).toBe("third");
    expect(
      emailProvider.getThreadsWithQuery.mock.calls.at(1)?.at(0)?.pageToken,
    ).toBe("second");
  });

  it("bounds empty scans and preserves the next page for sparse inboxes", async () => {
    let page = 0;
    const emailProvider = {
      name: "google",
      getThreadsWithQuery: vi.fn(async () => {
        page += 1;
        return {
          threads: [thread("excluded", ["newsletter"])],
          nextPageToken: String(page),
        };
      }),
    };
    const result = await fetchThreadsPage({
      query: { type: "inbox", excludeSplits },
      emailProvider: emailProvider as never,
      emailAccountId: "account",
      maxResults: 1,
      messageFormat: "metadata",
    });
    expect(result.threads).toEqual([]);
    expect(result.nextPageToken).toBe("5");
    expect(emailProvider.getThreadsWithQuery).toHaveBeenCalledTimes(5);
  });
});
