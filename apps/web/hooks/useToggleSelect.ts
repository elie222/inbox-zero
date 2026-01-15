import { useState, useCallback, useRef } from "react";

export function useToggleSelect(items: { id: string }[]) {
  const [selected, setSelected] = useState<Map<string, boolean>>(new Map());
  const lastClickedIndexRef = useRef<number | null>(null);

  const isAllSelected =
    !!items.length && items.every((item) => selected.get(item.id));

  const onToggleSelect = useCallback(
    (id: string, shiftKey = false) => {
      const currentIndex = items.findIndex((item) => item.id === id);

      if (shiftKey && lastClickedIndexRef.current !== null) {
        // Shift-click: select range between last clicked and current
        const start = Math.min(lastClickedIndexRef.current, currentIndex);
        const end = Math.max(lastClickedIndexRef.current, currentIndex);

        setSelected((prev) => {
          const newSelected = new Map(prev);
          for (let i = start; i <= end; i++) {
            const item = items[i];
            if (item) {
              newSelected.set(item.id, true);
            }
          }
          return newSelected;
        });
      } else {
        // Normal click: toggle single item
        setSelected((prev) => new Map(prev).set(id, !prev.get(id)));
      }

      lastClickedIndexRef.current = currentIndex;
    },
    [items],
  );

  const onToggleSelectAll = useCallback(() => {
    const allSelected = items.every((item) => selected.get(item.id));

    setSelected((prev) => {
      const newSelected = new Map(prev);
      for (const item of items) {
        newSelected.set(item.id, !allSelected);
      }
      return newSelected;
    });
  }, [items, selected]);

  const clearSelection = useCallback(() => {
    setSelected(new Map());
    lastClickedIndexRef.current = null;
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
    clearSelection,
    deselectItem,
  };
}
