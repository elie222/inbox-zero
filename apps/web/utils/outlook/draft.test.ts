import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import type { OutlookClient } from "@/utils/outlook/client";
import { deleteDraft, getDraftReference } from "@/utils/outlook/draft";

const mocks = vi.hoisted(() => ({
  getFolderIds: vi.fn(),
}));

vi.mock("@/utils/microsoft/retry", () => ({
  withMicrosoftGraphRetry: (operation: () => Promise<unknown>) => operation(),
  withMicrosoftGraphWriteRetry: (operation: () => Promise<unknown>) =>
    operation(),
}));
vi.mock("@/utils/outlook/message", () => ({
  convertMessage: vi.fn(),
  getCategoryMap: vi.fn(),
  getFolderIds: mocks.getFolderIds,
}));

describe("outlook/draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFolderIds.mockResolvedValue({ drafts: "drafts" });
  });

  it("captures the current draft version", async () => {
    const client = createOutlookReadClient({
      id: "draft-1",
      parentFolderId: "drafts",
      "@odata.etag": 'W/"version-1"',
    });

    await expect(
      getDraftReference({
        client,
        messageId: "draft-1",
        logger: createTestLogger(),
      }),
    ).resolves.toEqual({ id: "draft-1", version: 'W/"version-1"' });
  });

  it("rejects a draft reference when the Drafts folder is unavailable", async () => {
    mocks.getFolderIds.mockResolvedValue({});
    const client = createOutlookReadClient({
      id: "draft-1",
      parentFolderId: "drafts",
      "@odata.etag": 'W/"version-1"',
    });

    await expect(
      getDraftReference({
        client,
        messageId: "draft-1",
        logger: createTestLogger(),
      }),
    ).resolves.toBeNull();
  });

  it("returns true when the draft is deleted", async () => {
    const deleteRequest = vi.fn().mockResolvedValue(undefined);
    const { client, header } = createOutlookClient(deleteRequest);

    await expect(
      deleteDraft({
        client,
        draftId: "draft-1",
        version: 'W/"version-1"',
        logger: createTestLogger(),
      }),
    ).resolves.toBe(true);
    expect(header).toHaveBeenCalledWith("If-Match", 'W/"version-1"');
  });

  it("returns false when the draft is sent before conditional deletion", async () => {
    const deleteRequest = vi.fn().mockRejectedValue({ statusCode: 412 });
    const { client } = createOutlookClient(deleteRequest);

    await expect(
      deleteDraft({
        client,
        draftId: "draft-1",
        version: 'W/"version-1"',
        logger: createTestLogger(),
      }),
    ).resolves.toBe(false);
  });

  it("returns false when the draft no longer exists", async () => {
    const deleteRequest = vi.fn().mockRejectedValue({ statusCode: 404 });
    const { client } = createOutlookClient(deleteRequest);

    await expect(
      deleteDraft({
        client,
        draftId: "draft-1",
        version: 'W/"version-1"',
        logger: createTestLogger(),
      }),
    ).resolves.toBe(false);
  });
});

function createOutlookClient(deleteRequest: () => Promise<unknown>) {
  const request = {
    delete: deleteRequest,
    header: vi.fn(),
  };
  request.header.mockReturnValue(request);

  const client = {
    getClient: () => ({
      api: vi.fn(() => request),
    }),
  } as unknown as OutlookClient;

  return { client, header: request.header };
}

function createOutlookReadClient(message: object) {
  return {
    getClient: () => ({
      api: vi.fn(() => ({ get: vi.fn().mockResolvedValue(message) })),
    }),
  } as unknown as OutlookClient;
}
