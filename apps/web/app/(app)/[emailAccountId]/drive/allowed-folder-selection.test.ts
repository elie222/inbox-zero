import { describe, expect, it } from "vitest";
import type { FolderItem } from "@/app/api/user/drive/folders/route";
import { folderSelection } from "./allowed-folder-selection";

describe("allowed folder selection", () => {
  it("returns folders without a loaded parent as roots", () => {
    const folders = [
      folder("parent"),
      folder("child", "parent"),
      folder("orphan", "missing"),
    ];

    expect(
      folderSelection.getRootItems(folders).map((root) => root.id),
    ).toEqual(["parent", "orphan"]);
  });

  it("selects a folder and its loaded descendants", () => {
    const folders = [
      folder("parent"),
      folder("child-a", "parent"),
      folder("child-b", "parent"),
      folder("grandchild", "child-a"),
    ];

    const result = folderSelection.applySelection({
      item: folders[0],
      checked: true,
      selectedKeys: new Set(["existing"]),
      childrenByParentId: folderSelection.buildChildrenMap(folders),
    });

    expect([...result.nextKeys].sort()).toEqual([
      "child-a",
      "child-b",
      "existing",
      "grandchild",
      "parent",
    ]);
    expect(
      result.changedItems.map((selectedFolder) => selectedFolder.id),
    ).toEqual(["parent", "child-a", "grandchild", "child-b"]);
  });

  it("deselects a folder and its loaded descendants", () => {
    const folders = [
      folder("parent"),
      folder("child-a", "parent"),
      folder("child-b", "parent"),
      folder("unrelated"),
    ];

    const result = folderSelection.applySelection({
      item: folders[0],
      checked: false,
      selectedKeys: new Set(["parent", "child-a", "unrelated"]),
      childrenByParentId: folderSelection.buildChildrenMap(folders),
    });

    expect([...result.nextKeys].sort()).toEqual(["unrelated"]);
    expect(
      result.changedItems.map((selectedFolder) => selectedFolder.id),
    ).toEqual(["parent", "child-a"]);
  });

  it("marks a parent as indeterminate when only some descendants are selected", () => {
    const folders = [
      folder("parent"),
      folder("child-a", "parent"),
      folder("child-b", "parent"),
    ];

    expect(
      folderSelection.getSelectionState({
        item: folders[0],
        selectedKeys: new Set(["child-a"]),
        childrenByParentId: folderSelection.buildChildrenMap(folders),
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
      folderSelection.getSelectionState({
        item: folders[0],
        selectedKeys: new Set(["child-a", "child-b"]),
        childrenByParentId: folderSelection.buildChildrenMap(folders),
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
