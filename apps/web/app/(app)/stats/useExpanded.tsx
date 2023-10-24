import { ChevronsDownIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export const useExpanded = () => {
  const [expanded, setExpanded] = useState(false);
  const onExpand = useCallback(() => setExpanded(true), []);

  const extra = useMemo(() => {
    return (
      !expanded && (
        <div className="mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onExpand}
            className="w-full"
          >
            <ChevronsDownIcon className="h-4 w-4" />
            <span className="ml-2">Show more</span>
          </Button>
        </div>
      )
    );
  }, [expanded, onExpand]);

  return { expanded, extra };
};
