import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import type { OutlookClient } from "@/utils/outlook/client";
import {
  deleteDraft,
  getDraft,
  getDraftReference,
} from "@/utils/outlook/draft";
import {
  convertMessage,
  getCategoryMap,
  MESSAGE_EXPAND_ATTACHMENTS,
} from "@/utils/outlook/message";

const mocks = vi.hoisted(() => ({
  getFolderIds: vi.fn(),
}));

vi.mock("@/utils/outlook/retry", () => ({
  withMicrosoftGraphRetry: (operation: () => Promise<unknown>) => operation(),
  withMicrosoftGraphWriteRetry: (operation: () => Promise<unknown>) =>
    operation(),
}));
vi.mock("@/utils/outlook/message", () => ({
  convertMessage: vi.fn(),
  getCategoryMap: vi.fn(),
  getFolderIds: mocks.getFolderIds,
  MESSAGE_EXPAND_ATTACHMENTS:
    "attachments($select=id,name,contentType,size,isInline,microsoft.graph.fileAttachment/contentId)",
}));

describe("outlook/draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFolderIds.mockResolvedValue({ drafts: "drafts" });
  });

  it("fetches attachment descriptors when reading a complete draft", async () => {
    const attachment = {
      id: "file",
      name: "report.pdf",
      size: 123,
      isInline: false,
    };
    let expanded = false;
    const request = {
      expand: vi.fn(),
      get: vi.fn(async () => ({
        id: "draft-1",
        parentFolderId: "drafts",
        attachments: expanded ? [attachment] : undefined,
      })),
    };
    request.expand.mockImplementation(() => {
      expanded = true;
      return request;
    });
    const client = {
      getClient: () => ({ api: () => request }),
    } as unknown as OutlookClient;
    vi.mocked(getCategoryMap).mockResolvedValue(new Map());
    await getDraft({
      client,
      draftId: "draft-1",
      logger: createTestLogger(),
      includeAttachments: true,
    });
    expect(request.expand).toHaveBeenCalledWith(MESSAGE_EXPAND_ATTACHMENTS);
    expect(convertMessage).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [attachment] }),
      { drafts: "drafts" },
      expect.any(Map),
    );
  });

  it("does not fetch attachments for default save and discard identity checks", async () => {
    const request = {
      expand: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        id: "draft-1",
        parentFolderId: "drafts",
      }),
    };
    const client = {
      getClient: () => ({ api: () => request }),
    } as unknown as OutlookClient;
    vi.mocked(getCategoryMap).mockResolvedValue(new Map());
    await getDraft({ client, draftId: "draft-1", logger: createTestLogger() });
    expect(request.expand).not.toHaveBeenCalled();
    expect(convertMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "draft-1" }),
      { drafts: "drafts" },
      expect.any(Map),
    );
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

  it("uses changeKey when Graph omits @odata.etag", async () => {
    const client = createOutlookReadClient({
      id: "draft-1",
      parentFolderId: "drafts",
      changeKey: "version-from-change-key",
    });

    await expect(
      getDraftReference({
        client,
        messageId: "draft-1",
        logger: createTestLogger(),
      }),
    ).resolves.toEqual({
      id: "draft-1",
      version: 'W/"version-from-change-key"',
    });
  });

  it("uses an unconditional version when Graph omits etag and changeKey", async () => {
    const client = createOutlookReadClient({
      id: "draft-1",
      parentFolderId: "drafts",
    });

    await expect(
      getDraftReference({
        client,
        messageId: "draft-1",
        logger: createTestLogger(),
      }),
    ).resolves.toEqual({ id: "draft-1", version: "*" });
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
