import { describe, expect, it, vi } from "vitest";
import {
  resolveOutlookCategoryName,
  resolveOutlookFolderId,
} from "./search-scope";

describe("Outlook search scopes", () => {
  const folders = [
    {
      id: "parent",
      displayName: "Parent",
      childFolders: [
        { id: "nested", displayName: "Newsletter", childFolders: [] },
      ],
    },
    {
      id: "other-parent",
      displayName: "Other",
      childFolders: [
        { id: "other-nested", displayName: "Newsletter", childFolders: [] },
      ],
    },
  ];

  it.each([
    "Parent/Newsletter",
    "Parent\\Newsletter",
    "nested",
  ])("resolves a nested folder by path or ID: %s", async (folderName) => {
    expect(
      await resolveOutlookFolderId({
        emailProvider: { getFolders: vi.fn().mockResolvedValue(folders) },
        folderName,
      }),
    ).toBe("nested");
  });

  it("rejects ambiguous and missing folders without falling back to categories", async () => {
    const emailProvider = { getFolders: vi.fn().mockResolvedValue(folders) };
    await expect(
      resolveOutlookFolderId({ emailProvider, folderName: "Newsletter" }),
    ).rejects.toThrow("ambiguous");
    await expect(
      resolveOutlookFolderId({ emailProvider, folderName: "Missing" }),
    ).rejects.toThrow("not found");
  });

  it.each([
    "newsletter",
    "category-id",
  ])("resolves a category without reading mail folders: %s", async (categoryName) => {
    expect(
      await resolveOutlookCategoryName({
        emailProvider: {
          getLabels: vi
            .fn()
            .mockResolvedValue([{ id: "category-id", name: "Newsletter" }]),
        },
        categoryName,
      }),
    ).toBe("Newsletter");
  });
});
