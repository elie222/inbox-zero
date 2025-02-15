import { formatShortDate } from "@/utils/date";

export function EmailDate(props: { date: Date }) {
  return (
    <div className="flex-shrink-0 text-sm font-medium leading-5 text-muted-foreground">
      {formatShortDate(props.date)}
    </div>
  );
}
