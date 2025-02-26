import { formatShortDate } from "@/utils/date";

export function EmailDate(props: { date: Date }) {
  return (
    <div className="text-muted-foreground shrink-0 text-sm leading-5 font-medium">
      {formatShortDate(props.date)}
    </div>
  );
}
