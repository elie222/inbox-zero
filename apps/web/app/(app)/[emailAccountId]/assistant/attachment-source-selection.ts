import { AttachmentSourceType } from "@/generated/prisma/enums";
import {
  getAttachmentSourceKey,
  type AttachmentSourceInput,
} from "@/utils/attachments/source-schema";
import type { DriveSourceItem } from "@/utils/drive/source-items";
import {
  createTreeSelection,
  type TreeChildrenMap,
} from "@/utils/tree-selection";

export type DriveSourceChildrenMap = TreeChildrenMap<DriveSourceItem>;

export const driveSourceSelection = createTreeSelection<DriveSourceItem>({
  getId: getDriveSourceTreeNodeId,
  getParentId: (item) =>
    item.parentId ? `${item.driveConnectionId}:folder:${item.parentId}` : null,
  getSelectionKey: (item) => getAttachmentSourceKey(toAttachmentSource(item)),
});

// The API returns bare file names as paths for nested items, so compute full
// paths from the parent chain while grouping children by parent.
export function buildDriveSourceChildrenMap(
  items: DriveSourceItem[],
): DriveSourceChildrenMap {
  const rawChildren = driveSourceSelection.buildChildrenMap(items);
  const map: DriveSourceChildrenMap = new Map();

  const addChildren = (parent: DriveSourceItem) => {
    const children = rawChildren.get(getDriveSourceTreeNodeId(parent));
    if (!children) return;

    const enriched = children.map((child) => ({
      ...child,
      path: `${parent.path || parent.name}/${child.name}`,
    }));
    map.set(getDriveSourceTreeNodeId(parent), enriched);
    enriched.forEach(addChildren);
  };

  for (const root of driveSourceSelection.getRootItems(items)) {
    addChildren(root);
  }

  return map;
}

export function applyAttachmentSourceSelection({
  item,
  checked,
  selectedSources,
}: {
  item: DriveSourceItem;
  checked: boolean;
  selectedSources: AttachmentSourceInput[];
}): AttachmentSourceInput[] {
  const source = toAttachmentSource(item);
  const sourceKey = getAttachmentSourceKey(source);

  if (checked) {
    return selectedSources.some(
      (selectedSource) => getAttachmentSourceKey(selectedSource) === sourceKey,
    )
      ? selectedSources
      : [...selectedSources, source];
  }

  return selectedSources.filter(
    (selectedSource) => getAttachmentSourceKey(selectedSource) !== sourceKey,
  );
}

export function getDriveSourceTreeNodeId(item: DriveSourceItem) {
  return `${item.driveConnectionId}:${item.type}:${item.id}`;
}

function toAttachmentSource(item: DriveSourceItem): AttachmentSourceInput {
  return {
    driveConnectionId: item.driveConnectionId,
    name: item.name,
    sourceId: item.id,
    sourcePath: item.path || item.name,
    type:
      item.type === "folder"
        ? AttachmentSourceType.FOLDER
        : AttachmentSourceType.FILE,
  };
}
