import { ChevronsDownIcon, ChevronsUpIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export const useExpanded = (options?: {
  /** Current number of results */
  resultCount?: number;
  /** The limit used when not expanded (default: 50) */
  collapsedLimit?: number;
}) => {
  const { resultCount, collapsedLimit = 50 } = options ?? {};
  const [expanded, setExpanded] = useState(false);
  const toggleExpand = useCallback(
    () => setExpanded((expanded) => !expanded),
    [],
  );

  // Only show "Show more" if we have exactly the limit (meaning there might be more)
  // Only show "Show less" if expanded
  const shouldShowButton =
    expanded || (resultCount !== undefined && resultCount >= collapsedLimit);

  const extra = useMemo(() => {
    if (!shouldShowButton) return null;

    return (
      <div className="mt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleExpand}
          className="w-full"
        >
          {expanded ? (
            <>
              <ChevronsUpIcon className="h-4 w-4" />
              <span className="ml-2">Show less</span>
            </>
          ) : (
            <>
              <ChevronsDownIcon className="h-4 w-4" />
              <span className="ml-2">Show more</span>
            </>
          )}
        </Button>
      </div>
    );
  }, [expanded, toggleExpand, shouldShowButton]);

  return { expanded, extra };
};
