import { useCallback } from "react";
import { useTableKeyboardNavigation } from "@/hooks/useTableKeyboardNavigation";

interface UseMailKeyboardNavigationOptions {
  threads: { id: string }[];
  onReply: (index: number) => void;
  onArchive: (index: number) => void;
}

export function useMailKeyboardNavigation({
  threads,
  onReply,
  onArchive,
}: UseMailKeyboardNavigationOptions) {
  const handleKeyAction = useCallback(
    (index: number, key: string) => {
      if (key === "r" || key === "R") {
        onReply(index);
      } else if (key === "e" || key === "E") {
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
