import { describe, expect, it, vi } from "vitest";
import { fetchThreadsPage } from "@/utils/threads/fetch-page";

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
      query: { labelId: "required-label", anyLabelIds },
      emailProvider: emailProvider as never,
      maxResults: 50,
      messageFormat: "metadata",
    });

    expect(result.threads).toEqual([]);
  });
});
