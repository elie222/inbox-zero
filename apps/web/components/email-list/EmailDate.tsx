import { cn } from "@/utils";
import { formatShortDate } from "@/utils/date";

export function EmailDate({
  date,
  className,
}: {
  date: Date;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex-shrink-0 text-sm font-medium leading-5 text-muted-foreground",
        className,
      )}
    >
      {formatShortDate(date)}
    </div>
  );
}
