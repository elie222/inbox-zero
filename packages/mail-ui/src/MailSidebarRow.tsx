import type { ReactNode } from "react";
import { cx } from "./utils";

export function getMailSidebarRowPresentation({
  active,
  icon,
  name,
  count,
  emphasizeCount,
  nested,
  collapsed,
}: {
  active: boolean;
  icon: ReactNode;
  name: string;
  count: number | null;
  emphasizeCount?: boolean;
  nested?: boolean;
  collapsed?: boolean;
}) {
  const className = cx(
    "flex items-center rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    collapsed
      ? "relative mx-auto size-8 justify-center"
      : "gap-2.5 px-2.5 py-1.5",
    nested && "pl-7",
    active
      ? "bg-blue-50 font-medium text-foreground dark:bg-blue-950/40 [&>svg]:text-blue-600 dark:[&>svg]:text-blue-400"
      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  );
  const content = collapsed ? (
    <>
      {icon}
      {count !== null && (
        // The rail has no room for a number, so unread mail shows as a dot.
        <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
      )}
      <span className="sr-only">{name}</span>
    </>
  ) : (
    <>
      {icon}
      <span className="flex-1 truncate">{name}</span>
      {count !== null && (
        <span
          className={cx(
            "shrink-0 text-xs",
            emphasizeCount
              ? "rounded-full bg-primary/10 px-1.5 py-px font-medium text-primary"
              : "text-sidebar-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </>
  );

  return { className, content };
}
