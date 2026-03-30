import { useCallback } from "react";
import { useTableKeyboardNavigation } from "@/hooks/useTableKeyboardNavigation";

interface UseMailKeyboardNavigationOptions {
  onArchive: (index: number) => void;
  onReply: (index: number) => void;
  threads: { id: string }[];
}

export function useMailKeyboardNavigation({
  threads,
  onReply,
  onArchive,
}: UseMailKeyboardNavigationOptions) {
  const handleKeyAction = useCallback(
    (index: number, key: string, event: KeyboardEvent) => {
      // Skip modified key combos to avoid conflicts with browser/OS shortcuts
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
        return;

      if (key === "r") {
        onReply(index);
      } else if (key === "e") {
        onArchive(index);
      }
    },
    [onReply, onArchive],
  );

  return useTableKeyboardNavigation({
    items: threads,
    onKeyAction: handleKeyAction,
  });
}
