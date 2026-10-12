import { describe, expect, it, vi } from "vitest";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import type { EmailProvider } from "@/utils/email/types";
import { createTestLogger } from "@/__tests__/helpers";
import {
  normalizeOutlookSearchInput,
  runOutlookSearch,
} from "./assistant-search";

describe("normalizeOutlookSearchInput folder scope", () => {
  it("keeps folder and category field queries distinct", () => {
    expect(
      normalizeOutlookSearchInput({ query: 'folder:"Newsletter" unread' }),
    ).toMatchObject({
      query: "",
      readState: "unread",
      folderName: "Newsletter",
    });
    expect(
      normalizeOutlookSearchInput({ query: 'category:"Newsletter" unread' }),
    ).toMatchObject({
      query: "",
      readState: "unread",
      categoryName: "Newsletter",
    });
  });

  it("retains folder, category, sender, and read state through retries and empty pages", async () => {
    const getFolders = vi
      .fn()
      .mockResolvedValue([
        { id: "folder-id", displayName: "Newsletter", childFolders: [] },
      ]);
    const searchMessages = vi
      .fn<EmailProvider["searchMessages"]>()
      .mockRejectedValueOnce(new Error("Mock query failure"))
      .mockResolvedValueOnce({ messages: [], nextPageToken: "PAGE_TOKEN_2" })
      .mockResolvedValueOnce({ messages: [], nextPageToken: undefined });
    const result = await runOutlookSearch({
      emailProvider: createMockEmailProvider({ getFolders, searchMessages }),
      normalizedInput: {
        query: 'subject:"Weekly digest"',
        folderName: "Newsletter",
        categoryName: "Updates",
        fromEmail: "digest@example.com",
        readState: "unread",
      },
      limit: 20,
      logger: createTestLogger(),
    });
    expect(searchMessages).toHaveBeenCalledTimes(3);
    expect(getFolders).toHaveBeenCalledTimes(1);
    for (const [options] of searchMessages.mock.calls) {
      expect(options).toMatchObject({
        folderId: "folder-id",
        labelName: "Updates",
        fromEmail: "digest@example.com",
        readState: "unread",
      });
    }
    expect(result.result?.nextPageToken).toBeUndefined();
  });
});
