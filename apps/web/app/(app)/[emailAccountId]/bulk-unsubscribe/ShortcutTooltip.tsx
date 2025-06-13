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
          <p>E - Skip Inbox</p>
          <p>A - Keep</p>
          <p>Enter - View more</p>
          <p>Up/down - navigate</p>
        </div>
      }
    >
      <Button size="icon" variant="ghost">
        <SquareSlashIcon className="size-5" />
      </Button>
    </Tooltip>
  );
}
