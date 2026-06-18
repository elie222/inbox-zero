import { describe, expect, it } from "vitest";
import type { FolderItem } from "@/app/api/user/drive/folders/route";
import {
  applyFolderSelection,
  buildFolderChildrenMap,
  getFolderSelectionState,
  getRootFolders,
  mergeFolderChildren,
} from "./allowed-folder-selection";

describe("allowed folder selection", () => {
  it("returns folders without a loaded parent as roots", () => {
    const folders = [
      folder("parent"),
      folder("child", "parent"),
      folder("orphan", "missing"),
    ];

    expect(getRootFolders(folders).map((root) => root.id)).toEqual([
      "parent",
      "orphan",
    ]);
  });

  it("preserves the children map when loaded children have not changed", () => {
    const childrenByParentId = buildFolderChildrenMap([
      folder("parent"),
      folder("child", "parent"),
    ]);

    expect(
      mergeFolderChildren({
        childrenByParentId,
        parentId: "parent",
        children: [folder("child", "parent")],
      }),
    ).toBe(childrenByParentId);
  });

  it("selects a folder and its loaded descendants", () => {
    const folders = [
      folder("parent"),
      folder("child-a", "parent"),
      folder("child-b", "parent"),
      folder("grandchild", "child-a"),
    ];

    const result = applyFolderSelection({
      folder: folders[0],
      isChecked: true,
      selectedFolderIds: new Set(["existing"]),
      childrenByParentId: buildFolderChildrenMap(folders),
    });

    expect([...result.nextFolderIds].sort()).toEqual([
      "child-a",
      "child-b",
      "existing",
      "grandchild",
      "parent",
    ]);
    expect(
      result.changedFolders.map((selectedFolder) => selectedFolder.id),
    ).toEqual(["parent", "child-a", "grandchild", "child-b"]);
  });

  it("deselects a folder and its loaded descendants", () => {
    const folders = [
      folder("parent"),
      folder("child-a", "parent"),
      folder("child-b", "parent"),
      folder("unrelated"),
    ];

    const result = applyFolderSelection({
      folder: folders[0],
      isChecked: false,
      selectedFolderIds: new Set(["parent", "child-a", "unrelated"]),
      childrenByParentId: buildFolderChildrenMap(folders),
    });

    expect([...result.nextFolderIds].sort()).toEqual(["unrelated"]);
    expect(
      result.changedFolders.map((selectedFolder) => selectedFolder.id),
    ).toEqual(["parent", "child-a"]);
  });

  it("marks a parent as indeterminate when only some descendants are selected", () => {
    const folders = [
      folder("parent"),
      folder("child-a", "parent"),
      folder("child-b", "parent"),
    ];

    expect(
      getFolderSelectionState({
        folderId: "parent",
        selectedFolderIds: new Set(["child-a"]),
        childrenByParentId: buildFolderChildrenMap(folders),
      }),
    ).toBe("indeterminate");
  });

  it("marks a parent as checked when every loaded descendant is selected", () => {
    const folders = [
      folder("parent"),
      folder("child-a", "parent"),
      folder("child-b", "parent"),
    ];

    expect(
      getFolderSelectionState({
        folderId: "parent",
        selectedFolderIds: new Set(["child-a", "child-b"]),
        childrenByParentId: buildFolderChildrenMap(folders),
      }),
    ).toBe(true);
  });
});

function folder(id: string, parentId?: string): FolderItem {
  return {
    id,
    name: id,
    path: id,
    driveConnectionId: "drive-connection",
    provider: "google",
    parentId,
  };
}
