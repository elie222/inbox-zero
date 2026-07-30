import type { FolderItem } from "@/app/api/user/drive/folders/route";
import {
  createTreeSelection,
  type TreeChildrenMap,
} from "@/utils/tree-selection";

export type FolderChildrenMap = TreeChildrenMap<FolderItem>;

export const folderSelection = createTreeSelection<FolderItem>({
  getId: (folder) => folder.id,
  getParentId: (folder) => folder.parentId,
});

export function applyLoadedFolderChildrenSelection({
  parent,
  children,
  selectedFolderIds,
  childrenByParentId,
}: {
  parent: FolderItem;
  children: FolderItem[];
  selectedFolderIds: Set<string>;
  childrenByParentId: FolderChildrenMap;
}) {
  if (!selectedFolderIds.has(parent.id)) {
    return { changedFolders: [] };
  }

  const { changedItems } = folderSelection.applySelection({
    item: parent,
    checked: true,
    selectedKeys: selectedFolderIds,
    childrenByParentId: folderSelection.mergeChildren({
      childrenByParentId,
      parentId: parent.id,
      children,
    }),
  });

  return { changedFolders: changedItems };
}
