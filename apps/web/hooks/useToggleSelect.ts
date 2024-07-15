import { useState, useCallback } from "react";

export function useToggleSelect(items: { id: string }[]) {
  const [selected, setSelected] = useState<Map<string, boolean>>(new Map());
  const isAllSelected = items.every((item) => selected.get(item.id));
  const onToggleSelect = (id: string) => {
    setSelected((prev) => new Map(prev).set(id, !prev.get(id)));
  };
  const onToggleSelectAll = useCallback(() => {
    items.forEach((item) => {
      setSelected((prev) => new Map(prev).set(item.id, !prev.get(item.id)));
    });
  }, [items]);

  return { selected, isAllSelected, onToggleSelect, onToggleSelectAll };
}
