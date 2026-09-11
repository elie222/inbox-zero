export type TreeChildrenMap<TItem> = Map<string, TItem[]>;
export type TreeSelectionState = boolean | "indeterminate";

export function createTreeSelection<TItem>({
  getId,
  getParentId,
  getSelectionKey = getId,
}: {
  getId: (item: TItem) => string;
  getParentId: (item: TItem) => string | null | undefined;
  // Selection keys can differ from tree node ids (e.g. persisted source keys).
  getSelectionKey?: (item: TItem) => string;
}) {
  function buildChildrenMap(items: TItem[]): TreeChildrenMap<TItem> {
    const map: TreeChildrenMap<TItem> = new Map();

    for (const item of items) {
      const parentId = getParentId(item);
      if (!parentId) continue;

      const children = map.get(parentId) ?? [];
      children.push(item);
      map.set(parentId, children);
    }

    return map;
  }

  function getRootItems(items: TItem[]) {
    const itemIds = new Set(items.map(getId));

    return items.filter((item) => {
      const parentId = getParentId(item);
      return !parentId || !itemIds.has(parentId);
    });
  }

  function mergeChildren({
    childrenByParentId,
    parentId,
    children,
  }: {
    childrenByParentId: TreeChildrenMap<TItem>;
    parentId: string;
    children: TItem[];
  }) {
    if (childrenByParentId.get(parentId) === children) {
      return childrenByParentId;
    }

    const next = new Map(childrenByParentId);
    next.set(parentId, children);
    return next;
  }

  function getSelectionState({
    item,
    selectedKeys,
    childrenByParentId,
  }: {
    item: TItem;
    selectedKeys: Set<string>;
    childrenByParentId: TreeChildrenMap<TItem>;
  }): TreeSelectionState {
    if (selectedKeys.has(getSelectionKey(item))) return true;

    const descendants = getLoadedDescendants(getId(item), childrenByParentId);
    if (descendants.length === 0) return false;

    const selectedCount = descendants.filter((descendant) =>
      selectedKeys.has(getSelectionKey(descendant)),
    ).length;

    if (selectedCount === 0) return false;
    if (selectedCount === descendants.length) return true;

    return "indeterminate";
  }

  function applySelection({
    item,
    checked,
    selectedKeys,
    childrenByParentId,
  }: {
    item: TItem;
    checked: boolean;
    selectedKeys: Set<string>;
    childrenByParentId: TreeChildrenMap<TItem>;
  }) {
    const nextKeys = new Set(selectedKeys);
    const affectedItems = [
      item,
      ...getLoadedDescendants(getId(item), childrenByParentId),
    ];

    const changedItems = affectedItems.filter((affectedItem) => {
      const key = getSelectionKey(affectedItem);
      const wasSelected = selectedKeys.has(key);
      if (checked) {
        nextKeys.add(key);
        return !wasSelected;
      }

      nextKeys.delete(key);
      return wasSelected;
    });

    return { nextKeys, changedItems };
  }

  function getLoadedDescendants(
    itemId: string,
    childrenByParentId: TreeChildrenMap<TItem>,
    descendants: TItem[] = [],
  ) {
    for (const child of childrenByParentId.get(itemId) ?? []) {
      descendants.push(child);
      getLoadedDescendants(getId(child), childrenByParentId, descendants);
    }

    return descendants;
  }

  return {
    buildChildrenMap,
    getRootItems,
    mergeChildren,
    getSelectionState,
    applySelection,
  };
}
