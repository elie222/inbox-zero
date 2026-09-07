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
