import { useState, useCallback, useRef } from "react";

export function useToggleSelect(items: { id: string }[]) {
  const [selected, setSelected] = useState<Map<string, boolean>>(new Map());
  const lastClickedIdRef = useRef<string | null>(null);

  const isAllSelected =
    !!items.length && items.every((item) => selected.get(item.id));

  const onToggleSelect = useCallback(
    (id: string, shiftKey = false, selectableIds?: string[]) => {
      const ids = selectableIds ?? items.map((item) => item.id);
      const currentIndex = ids.indexOf(id);
      const lastClickedIndex = lastClickedIdRef.current
        ? ids.indexOf(lastClickedIdRef.current)
        : -1;

      if (shiftKey && currentIndex >= 0 && lastClickedIndex >= 0) {
        // Shift-click: select range between last clicked and current
        const start = Math.min(lastClickedIndex, currentIndex);
        const end = Math.max(lastClickedIndex, currentIndex);

        setSelected((prev) => {
          const newSelected = new Map(prev);
          for (let i = start; i <= end; i++) {
            const itemId = ids[i];
            if (itemId) {
              newSelected.set(itemId, true);
            }
          }
          return newSelected;
        });
      } else {
        // Normal click: toggle single item
        setSelected((prev) => new Map(prev).set(id, !prev.get(id)));
      }

      lastClickedIdRef.current = id;
    },
    [items],
  );

  const onToggleSelectItems = useCallback(
    (ids: string[]) => {
      const allSelected = ids.every((id) => selected.get(id));

      setSelected((prev) => {
        const newSelected = new Map(prev);
        for (const id of ids) {
          newSelected.set(id, !allSelected);
        }
        return newSelected;
      });
    },
    [selected],
  );

  const onToggleSelectAll = useCallback(() => {
    onToggleSelectItems(items.map((item) => item.id));
  }, [items, onToggleSelectItems]);

  const selectItems = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const newSelected = new Map(prev);
      for (const id of ids) {
        newSelected.set(id, true);
      }
      return newSelected;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Map());
    lastClickedIdRef.current = null;
  }, []);

  const deselectItem = useCallback((id: string) => {
    setSelected((prev) => {
      const newSelected = new Map(prev);
      newSelected.delete(id);
      return newSelected;
    });
  }, []);

  return {
    selected,
    isAllSelected,
    onToggleSelect,
    onToggleSelectAll,
    onToggleSelectItems,
    selectItems,
    clearSelection,
    deselectItem,
  };
}
