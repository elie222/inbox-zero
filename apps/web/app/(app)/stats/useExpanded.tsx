import { ChevronsDownIcon, ChevronsUpIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export const useExpanded = () => {
  const [expanded, setExpanded] = useState(false);
  const toggleExpand = useCallback(
    () => setExpanded((expanded) => !expanded),
    []
  );

  const extra = useMemo(() => {
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
  }, [expanded, toggleExpand]);

  return { expanded, extra };
};
