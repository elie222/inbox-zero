import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import type { OutlookClient } from "@/utils/outlook/client";
import { deleteDraft } from "@/utils/outlook/draft";

vi.mock("@/utils/microsoft/retry", () => ({
  withMicrosoftGraphRetry: (operation: () => Promise<unknown>) => operation(),
  withMicrosoftGraphWriteRetry: (operation: () => Promise<unknown>) =>
    operation(),
}));

describe("outlook/draft", () => {
  it("returns true when the draft is deleted", async () => {
    const deleteRequest = vi.fn().mockResolvedValue(undefined);
    const client = createOutlookClient(deleteRequest);

    await expect(
      deleteDraft({
        client,
        draftId: "draft-1",
        logger: createTestLogger(),
      }),
    ).resolves.toBe(true);
  });

  it("returns false when the draft no longer exists", async () => {
    const deleteRequest = vi.fn().mockRejectedValue({ statusCode: 404 });
    const client = createOutlookClient(deleteRequest);

    await expect(
      deleteDraft({
        client,
        draftId: "draft-1",
        logger: createTestLogger(),
      }),
    ).resolves.toBe(false);
  });
});

function createOutlookClient(deleteRequest: () => Promise<unknown>) {
  return {
    getClient: () => ({
      api: vi.fn(() => ({ delete: deleteRequest })),
    }),
  } as unknown as OutlookClient;
}
