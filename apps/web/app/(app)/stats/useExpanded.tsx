import { ExpandIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/Button";

export const useExpanded = () => {
  const [expanded, setExpanded] = useState(false);
  const onExpand = useCallback(() => setExpanded(true), []);

  const extra = useMemo(() => {
    return (
      !expanded && (
        <div className="mt-2">
          <Button color="white" full onClick={onExpand}>
            <ExpandIcon className="h-4 w-4" />
            <span className="ml-3">Show more</span>
          </Button>
        </div>
      )
    );
  }, [expanded, onExpand]);

  return { expanded, extra };
};
