import type { Client } from "@microsoft/microsoft-graph-client";
import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { unwatchOutlook } from "@/utils/outlook/watch";

describe("unwatchOutlook", () => {
  it("treats a subscription Graph no longer has as already removed", async () => {
    const client = createClientWithDelete(
      vi
        .fn()
        .mockRejectedValue(
          createGraphError(
            404,
            "ResourceNotFound",
            "The object was not found.",
          ),
        ),
    );

    await expect(
      unwatchOutlook(client, "subscription-1", createTestLogger()),
    ).resolves.toBeUndefined();
  });

  it("still throws other Graph errors", async () => {
    const error = createGraphError(403, "Forbidden", "Access denied.");
    const client = createClientWithDelete(vi.fn().mockRejectedValue(error));

    await expect(
      unwatchOutlook(client, "subscription-1", createTestLogger()),
    ).rejects.toBe(error);
  });
});

function createClientWithDelete(deleteFn: ReturnType<typeof vi.fn>) {
  return {
    api: vi.fn().mockReturnValue({ delete: deleteFn }),
  } as unknown as Client;
}

function createGraphError(statusCode: number, code: string, message: string) {
  return Object.assign(new Error(message), { statusCode, code });
}
