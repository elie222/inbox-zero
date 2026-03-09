import type { OutlookCategory } from "@microsoft/microsoft-graph-types";
import { describe, expect, it, vi } from "vitest";
import type { OutlookClient } from "@/utils/outlook/client";
import { createScopedLogger } from "@/utils/logger";
import { createLabel, getLabel, getOrCreateLabels } from "./label";

describe("createLabel", () => {
  it("sanitizes comma-containing category names before Graph API call", async () => {
    const post = vi.fn().mockResolvedValue({
      id: "cat-1",
      displayName: "Notification property update",
      color: "preset1",
    } satisfies OutlookCategory);
    const api = vi.fn().mockReturnValue({ post });
    const client = createMockOutlookClient(api);

    const created = await createLabel({
      client,
      name: "Notification, property update",
      logger: createScopedLogger("outlook-label-test"),
    });

    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Notification property update",
      }),
    );
    expect(created.displayName).toBe("Notification property update");
    expect(client.invalidateCategoryMapCache).toHaveBeenCalledTimes(1);
  });
});

describe("getLabel", () => {
  it("matches existing category names using sanitized normalization", async () => {
    const api = vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({
        value: [
          {
            id: "cat-2",
            displayName: "System Notification Property Update",
          },
        ],
      }),
    });
    const client = createMockOutlookClient(api);

    const label = await getLabel({
      client,
      name: "system notification, property update",
    });

    expect(label?.id).toBe("cat-2");
  });
});

describe("getOrCreateLabels", () => {
  it("rejects raw input names that normalize to the same Outlook key", async () => {
    const api = vi.fn();
    const client = createMockOutlookClient(api);

    await expect(
      getOrCreateLabels({
        client,
        names: ["Finance, Updates", "Finance Updates"],
        logger: createScopedLogger("outlook-label-test"),
      }),
    ).rejects.toThrow("normalize to the same value");

    expect(api).not.toHaveBeenCalled();
  });

  it("throws when multiple existing categories share the same normalized key", async () => {
    const get = vi.fn().mockResolvedValue({
      value: [
        { id: "cat-1", displayName: "Finance-Updates" },
        { id: "cat-2", displayName: "Finance Updates" },
      ] satisfies OutlookCategory[],
    });
    const post = vi.fn();
    const api = vi.fn().mockReturnValue({ get, post });
    const client = createMockOutlookClient(api);

    await expect(
      getOrCreateLabels({
        client,
        names: ["Finance Updates"],
        logger: createScopedLogger("outlook-label-test"),
      }),
    ).rejects.toThrow("Ambiguous Outlook category match");

    expect(post).not.toHaveBeenCalled();
  });
});

function createMockOutlookClient(api: ReturnType<typeof vi.fn>) {
  return {
    getClient: vi.fn().mockReturnValue({ api }),
    invalidateCategoryMapCache: vi.fn(),
  } as unknown as OutlookClient & {
    invalidateCategoryMapCache: ReturnType<typeof vi.fn>;
  };
}
