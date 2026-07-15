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
