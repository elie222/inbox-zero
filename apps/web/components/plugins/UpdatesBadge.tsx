"use client";

import { Badge } from "@/components/Badge";
import { ArrowUpCircle } from "lucide-react";

interface UpdatesBadgeProps {
  count: number;
}

export function UpdatesBadge({ count }: UpdatesBadgeProps) {
  if (count === 0) return null;

  return (
    <Badge color="blue" className="flex items-center gap-1">
      <ArrowUpCircle className="h-3 w-3" />
      <span>
        {count} update{count > 1 ? "s" : ""} available
      </span>
    </Badge>
  );
}
