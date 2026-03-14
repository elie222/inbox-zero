import { describe, expect, it } from "vitest";
import { buildDriveSourceItems } from "./source-items";

describe("buildDriveSourceItems", () => {
  it("maps folders and files into drive source items", () => {
    const items = buildDriveSourceItems({
      driveConnectionId: "drive-1",
      provider: "google",
      folders: [
        {
          id: "folder-1",
          name: "Properties",
          parentId: "root",
          path: "Shared/Properties",
        },
      ],
      files: [
        {
          id: "file-1",
          name: "lease.pdf",
          folderId: "folder-1",
          mimeType: "application/pdf",
        },
      ],
    });

    expect(items).toEqual([
      {
        id: "folder-1",
        name: "Properties",
        path: "Shared/Properties",
        driveConnectionId: "drive-1",
        provider: "google",
        type: "folder",
        parentId: "root",
      },
      {
        id: "file-1",
        name: "lease.pdf",
        path: "lease.pdf",
        driveConnectionId: "drive-1",
        provider: "google",
        type: "file",
        parentId: "folder-1",
        mimeType: "application/pdf",
      },
    ]);
  });

  it("falls back to the folder name when no path is provided", () => {
    const items = buildDriveSourceItems({
      driveConnectionId: "drive-1",
      provider: "google",
      folders: [{ id: "folder-1", name: "Properties" }],
      files: [],
    });

    expect(items).toEqual([
      {
        id: "folder-1",
        name: "Properties",
        path: "Properties",
        driveConnectionId: "drive-1",
        provider: "google",
        type: "folder",
      },
    ]);
  });
});
