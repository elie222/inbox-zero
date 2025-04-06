import { useState, useCallback, useEffect, type RefCallback } from "react";

interface UseTableKeyboardNavigationOptions<T> {
  items: T[];
  onKeyAction?: (index: number, key: string) => void;
}

export function useTableKeyboardNavigation<T>({
  items,
  onKeyAction,
}: UseTableKeyboardNavigationOptions<T>) {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [rowRefs] = useState<Map<number, HTMLElement>>(new Map());

  const getRefCallback = useCallback(
    (index: number): RefCallback<HTMLElement> => {
      return (element) => {
        if (element) {
          rowRefs.set(index, element);
        } else {
          rowRefs.delete(index);
        }
      };
    },
    [rowRefs],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!items.length) return;

      // Check if we're in an editable element (input, textarea, or contenteditable)
      const target = e.target as HTMLElement;
      const isEditableElement =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.getAttribute("contenteditable") === "true" ||
        target.closest("[contenteditable=true]") !== null;

      if (isEditableElement) return;

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev <= 0 ? 0 : prev - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev >= items.length - 1 ? items.length - 1 : prev + 1,
        );
      } else if (onKeyAction && selectedIndex >= 0) {
        onKeyAction(selectedIndex, e.key);
      }
    },
    [items.length, onKeyAction, selectedIndex],
  );

  // Make sure the selected row is visible
  useEffect(() => {
    if (selectedIndex >= 0) {
      const element = rowRefs.get(selectedIndex);
      if (element) {
        element.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }
  }, [selectedIndex, rowRefs]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { selectedIndex, setSelectedIndex, getRefCallback };
}
