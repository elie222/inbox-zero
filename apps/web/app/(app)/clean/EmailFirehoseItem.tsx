"use client";

import { useState, useEffect } from "react";
import { Archive, Tag, Trash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils";
import type { CleanThread } from "@/utils/redis/clean.types";
import { formatShortDate } from "@/utils/date";

export function EmailItem({ email }: { email: CleanThread }) {
  const [isNew, setIsNew] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsNew(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={cn(
        "flex items-center rounded-md border p-2 text-sm transition-all duration-300",
        isNew ? "bg-primary/5" : "bg-card",
        email.action === "archive" && "border-green-500/30",
        email.action === "delete" && "border-red-500/30",
        email.action === "label" && "border-yellow-500/30",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center">
          <div
            className={cn(
              "mr-2 h-2 w-2 rounded-full",
              email.action === "archive" && "bg-green-500",
              email.action === "delete" && "bg-red-500",
              email.action === "label" && "bg-yellow-500",
              !email.action && "bg-blue-500",
            )}
          />
          <div className="truncate font-medium">{email.subject}</div>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          From: {email.from} • {formatShortDate(email.date)}
        </div>
      </div>
      <div className="ml-2 flex items-center space-x-2">
        {email.action === "archive" && (
          <Archive className="h-3.5 w-3.5 text-green-500" />
        )}
        {email.action === "delete" && (
          <Trash className="h-3.5 w-3.5 text-red-500" />
        )}
        {email.action === "label" && (
          <div className="flex items-center">
            <Tag className="mr-1 h-3.5 w-3.5 text-yellow-500" />
            <Badge variant="outline" className="h-5 px-1 py-0 text-xs">
              {email.label}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}
