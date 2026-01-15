"use client";

import { SearchIcon } from "lucide-react";
import { useCallback } from "react";
import throttle from "lodash/throttle";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils";

export function SearchBar({
  onSearch,
  className,
}: {
  onSearch: (search: string) => void;
  className?: string;
}) {
  const throttledSearch = useCallback(
    throttle((value: string) => {
      onSearch(value.trim());
    }, 300),
    [],
  );

  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder="Search..."
        className="pl-9"
        onChange={(e) => throttledSearch(e.target.value)}
      />
    </div>
  );
}
