"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Row selection for the mail list.
 *
 * Anchored range extension is the subtle part: `Shift+J/K` must grow and shrink a
 * range from where the user started extending, without discarding selections they
 * made before that. So the selection at the moment extension begins is kept as a
 * base and the anchored range is layered on top of it each keystroke.
 */
export function useThreadSelection(orderedIds: string[]) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const anchorIndex = useRef<number | null>(null);
  const baseSelection = useRef<ReadonlySet<string> | null>(null);
  const lastToggledIndex = useRef<number | null>(null);
  const previousOrderedIds = useRef(orderedIds);

  const resetAnchor = useCallback(() => {
    anchorIndex.current = null;
    baseSelection.current = null;
  }, []);

  const clear = useCallback(() => {
    resetAnchor();
    lastToggledIndex.current = null;
    setSelectedIds((current) => (current.size ? new Set() : current));
  }, [resetAnchor]);

  useEffect(() => {
    const previousIds = previousOrderedIds.current;
    previousOrderedIds.current = orderedIds;
    if (hasSameOrder(previousIds, orderedIds)) return;

    const visibleIds = new Set(orderedIds);
    resetAnchor();
    lastToggledIndex.current = null;
    setSelectedIds((current) => {
      if ([...current].every((id) => visibleIds.has(id))) return current;

      return new Set([...current].filter((id) => visibleIds.has(id)));
    });
  }, [orderedIds, resetAnchor]);

  const toggle = useCallback(
    (index: number) => {
      const id = orderedIds[index];
      if (!id) return;
      resetAnchor();
      lastToggledIndex.current = index;
      setSelectedIds((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      });
    },
    [orderedIds, resetAnchor],
  );

  // Shift+click: fill from the last individually toggled row to this one.
  const selectRangeTo = useCallback(
    (index: number) => {
      const from = lastToggledIndex.current;
      if (from === null) {
        toggle(index);
        return;
      }
      resetAnchor();
      setSelectedIds((current) =>
        addRange({ ids: orderedIds, base: current, from, to: index }),
      );
      lastToggledIndex.current = index;
    },
    [orderedIds, resetAnchor, toggle],
  );

  const extendTo = useCallback(
    (index: number, fromIndex: number) => {
      if (anchorIndex.current === null) {
        anchorIndex.current = fromIndex;
        baseSelection.current = selectedIds;
      }
      const anchor = anchorIndex.current;
      const base = baseSelection.current ?? new Set<string>();
      setSelectedIds(
        addRange({ ids: orderedIds, base, from: anchor, to: index }),
      );
      lastToggledIndex.current = index;
    },
    [orderedIds, selectedIds],
  );

  // Acting on a selection consumes it; acting with none targets the focused row.
  const targetIds = useCallback(
    (focusedId: string | undefined) => {
      if (selectedIds.size) return [...selectedIds];
      return focusedId ? [focusedId] : [];
    },
    [selectedIds],
  );

  return useMemo(
    () => ({
      selectedIds,
      selectedCount: selectedIds.size,
      hasSelection: selectedIds.size > 0,
      isSelected: (id: string) => selectedIds.has(id),
      toggle,
      selectRangeTo,
      extendTo,
      clear,
      targetIds,
    }),
    [selectedIds, toggle, selectRangeTo, extendTo, clear, targetIds],
  );
}

function hasSameOrder(previousIds: string[], currentIds: string[]) {
  return (
    previousIds.length === currentIds.length &&
    previousIds.every((id, index) => id === currentIds[index])
  );
}

function addRange({
  ids,
  base,
  from,
  to,
}: {
  ids: string[];
  base: ReadonlySet<string>;
  from: number;
  to: number;
}): Set<string> {
  const next = new Set(base);
  const start = Math.max(0, Math.min(from, to));
  const end = Math.min(ids.length - 1, Math.max(from, to));
  for (let index = start; index <= end; index++) {
    const id = ids[index];
    if (id) next.add(id);
  }
  return next;
}
