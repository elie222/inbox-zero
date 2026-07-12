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
} from "./attachment-source-selection";

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
