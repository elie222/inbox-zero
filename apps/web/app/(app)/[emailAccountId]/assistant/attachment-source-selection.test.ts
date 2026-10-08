import { describe, expect, it } from "vitest";
import { AttachmentSourceType } from "@/generated/prisma/enums";
import {
  getAttachmentSourceKey,
  type AttachmentSourceInput,
} from "@/utils/attachments/source-schema";
import type { DriveSourceItem } from "@/utils/drive/source-items";
import {
  applyAttachmentSourceSelection,
  buildDriveSourceChildrenMap,
  driveSourceSelection,
  getAttachmentSourceNodeSelection,
  formatAttachmentSourceCount,
} from "./attachment-source-selection";

describe("formatAttachmentSourceCount", () => {
  it.each([
    [0, 0, ""],
    [1, 0, "1 folder"],
    [3, 0, "3 folders"],
    [0, 1, "1 file"],
    [0, 3, "3 files"],
    [1, 1, "1 folder, 1 file"],
    [1, 2, "1 folder, 2 files"],
    [2, 1, "2 folders, 1 file"],
    [2, 3, "2 folders, 3 files"],
  ])("formats %i folders and %i files as %s", (folders, files, expected) => {
    const sources = [
      ...Array.from({ length: files }, (_, i) =>
        source(`file-${i}`, "Demo.pdf"),
      ),
      ...Array.from({ length: folders }, (_, i) =>
        source(`folder-${i}`, "Demo Folder", AttachmentSourceType.FOLDER),
      ),
    ];

    expect(formatAttachmentSourceCount(sources)).toBe(expected);
  });
});

describe("attachment source selection", () => {
  it("selects a recursive folder source once", () => {
    const result = applyAttachmentSourceSelection({
      item: folder("parent", "Trips"),
      checked: true,
      selectedSources: [source("existing", "Existing.pdf")],
    });

    expect(result.map(getAttachmentSourceKey)).toEqual([
      "drive-connection:FILE:existing",
      "drive-connection:FOLDER:parent",
    ]);
    expect(result.map((item) => item.sourcePath)).toEqual([
      "Existing.pdf",
      "Trips",
    ]);
  });

  it("deselects a recursive folder without loading its descendants", () => {
    const parent = folder("parent", "Trips");

    const result = applyAttachmentSourceSelection({
      item: parent,
      checked: false,
      selectedSources: [
        source("parent", "Trips", AttachmentSourceType.FOLDER, "Trips"),
        source("unrelated", "Unrelated.pdf"),
      ],
    });

    expect(result.map(getAttachmentSourceKey)).toEqual([
      "drive-connection:FILE:unrelated",
    ]);
  });

  it("marks a folder indeterminate when only some loaded descendants are selected", () => {
    const items = [
      folder("parent", "Trips"),
      folder("child-folder", "France 2025", "parent", "Trips/France 2025"),
      file("child-file", "Itinerary.pdf", "parent", "Trips/Itinerary.pdf"),
    ];

    expect(
      driveSourceSelection.getSelectionState({
        item: items[0],
        selectedKeys: new Set(["drive-connection:FOLDER:child-folder"]),
        childrenByParentId: buildDriveSourceChildrenMap(items),
      }),
    ).toBe("indeterminate");
  });

  it("inherits recursive selection from an ancestor folder", () => {
    const child = folder("child", "France 2025", "parent");

    expect(
      getAttachmentSourceNodeSelection({
        item: child,
        selectedKeys: new Set(),
        childrenByParentId: new Map(),
        ancestorFolderSelected: true,
      }),
    ).toEqual({
      checkboxState: true,
      isSelectionInherited: true,
      descendantsAreSelected: true,
    });
  });

  it("inherits selection only from directly selected folders", () => {
    const items = [
      folder("parent", "Trips"),
      file("child", "Itinerary.pdf", "parent"),
    ];
    const childrenByParentId = buildDriveSourceChildrenMap(items);

    expect(
      getAttachmentSourceNodeSelection({
        item: items[0],
        selectedKeys: new Set(["drive-connection:FILE:child"]),
        childrenByParentId,
        ancestorFolderSelected: false,
      }),
    ).toEqual({
      checkboxState: true,
      isSelectionInherited: false,
      descendantsAreSelected: false,
    });
  });
});

function folder(
  id: string,
  name: string,
  parentId?: string,
  path: string = name,
): DriveSourceItem {
  return {
    id,
    name,
    path,
    driveConnectionId: "drive-connection",
    provider: "google",
    type: "folder",
    parentId,
  };
}

function file(
  id: string,
  name: string,
  parentId?: string,
  path: string = name,
): DriveSourceItem {
  return {
    id,
    name,
    path,
    driveConnectionId: "drive-connection",
    provider: "google",
    type: "file",
    parentId,
    mimeType: "application/pdf",
  };
}

function source(
  sourceId: string,
  name: string,
  type: AttachmentSourceType = AttachmentSourceType.FILE,
  sourcePath: string = name,
): AttachmentSourceInput {
  return {
    driveConnectionId: "drive-connection",
    name,
    sourceId,
    sourcePath,
    type,
  };
}
