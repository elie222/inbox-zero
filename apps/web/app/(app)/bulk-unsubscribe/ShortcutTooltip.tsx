"use client";

import { SquareSlashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/Tooltip";

export function ShortcutTooltip() {
  return (
    <Tooltip
      contentComponent={
        <div>
          <h3 className="mb-1 font-semibold">Shortcuts:</h3>
          <p>U - Unsubscribe</p>
          <p>E - Auto Archive</p>
          <p>A - Keep (Approve)</p>
          <p>Enter - View more</p>
          <p>Up/down - navigate</p>
        </div>
      }
    >
      <Button size="icon" variant="link">
        <SquareSlashIcon className="h-5 w-5" />
      </Button>
    </Tooltip>
  );
}
