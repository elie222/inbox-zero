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
  it("selects a folder and its loaded descendant folders and files", () => {
    const items = [
      folder("parent", "Trips"),
      folder("child-folder", "France 2025", "parent", "Trips/France 2025"),
      file("child-file", "Itinerary.pdf", "parent", "Trips/Itinerary.pdf"),
      file(
        "grandchild-file",
        "Tickets.pdf",
        "child-folder",
        "Trips/France 2025/Tickets.pdf",
      ),
    ];

    const result = applyAttachmentSourceSelection({
      item: items[0],
      checked: true,
      selectedSources: [source("existing", "Existing.pdf")],
      childrenByParentId: buildDriveSourceChildrenMap(items),
    });

    expect(result.map(getAttachmentSourceKey)).toEqual([
      "drive-connection:FILE:existing",
      "drive-connection:FOLDER:parent",
      "drive-connection:FOLDER:child-folder",
      "drive-connection:FILE:grandchild-file",
      "drive-connection:FILE:child-file",
    ]);
    expect(result.map((item) => item.sourcePath)).toEqual([
      "Existing.pdf",
      "Trips",
      "Trips/France 2025",
      "Trips/France 2025/Tickets.pdf",
      "Trips/Itinerary.pdf",
    ]);
  });

  it("deselects a folder and its loaded descendant folders and files", () => {
    const items = [
      folder("parent", "Trips"),
      folder("child-folder", "France 2025", "parent", "Trips/France 2025"),
      file("child-file", "Itinerary.pdf", "parent", "Trips/Itinerary.pdf"),
      file("unrelated", "Unrelated.pdf"),
    ];

    const result = applyAttachmentSourceSelection({
      item: items[0],
      checked: false,
      selectedSources: items.map((item) =>
        source(
          item.id,
          item.name,
          item.type === "folder"
            ? AttachmentSourceType.FOLDER
            : AttachmentSourceType.FILE,
          item.path,
        ),
      ),
      childrenByParentId: buildDriveSourceChildrenMap(items),
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
