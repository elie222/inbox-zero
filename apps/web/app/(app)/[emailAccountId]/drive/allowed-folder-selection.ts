import type { FolderItem } from "@/app/api/user/drive/folders/route";

export type FolderChildrenMap = Map<string, FolderItem[]>;
export type FolderSelectionState = boolean | "indeterminate";

export function buildFolderChildrenMap(folders: FolderItem[]) {
  const map: FolderChildrenMap = new Map();

  for (const folder of folders) {
    if (!folder.parentId) continue;
    const children = map.get(folder.parentId) ?? [];
    children.push(folder);
    map.set(folder.parentId, children);
  }

  return map;
}

export function getFolderSelectionState({
  folderId,
  selectedFolderIds,
  childrenByParentId,
}: {
  folderId: string;
  selectedFolderIds: Set<string>;
  childrenByParentId: FolderChildrenMap;
}): FolderSelectionState {
  if (selectedFolderIds.has(folderId)) return true;

  const descendants = getLoadedDescendants(folderId, childrenByParentId);
  if (descendants.length === 0) return false;

  const selectedDescendants = descendants.filter((folder) =>
    selectedFolderIds.has(folder.id),
  );

  if (selectedDescendants.length === 0) return false;
  if (selectedDescendants.length === descendants.length) return true;

  return "indeterminate";
}

export function applyFolderSelection({
  folder,
  isChecked,
  selectedFolderIds,
  childrenByParentId,
}: {
  folder: FolderItem;
  isChecked: boolean;
  selectedFolderIds: Set<string>;
  childrenByParentId: FolderChildrenMap;
}) {
  const nextFolderIds = new Set(selectedFolderIds);
  const affectedFolders = [
    folder,
    ...getLoadedDescendants(folder.id, childrenByParentId),
  ];

  const changedFolders = affectedFolders.filter((affectedFolder) => {
    const wasSelected = selectedFolderIds.has(affectedFolder.id);
    if (isChecked) {
      nextFolderIds.add(affectedFolder.id);
      return !wasSelected;
    }

    nextFolderIds.delete(affectedFolder.id);
    return wasSelected;
  });

  return { nextFolderIds, changedFolders };
}

function getLoadedDescendants(
  folderId: string,
  childrenByParentId: FolderChildrenMap,
) {
  const descendants: FolderItem[] = [];
  const children = childrenByParentId.get(folderId) ?? [];

  for (const child of children) {
    descendants.push(child);
    descendants.push(...getLoadedDescendants(child.id, childrenByParentId));
  }

  return descendants;
}
