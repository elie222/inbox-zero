import type { ReactNode } from "react";

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
      ? "relative mx-auto size-10 justify-center"
      : "gap-2.5 px-2.5 py-1.5",
    nested && "pl-7",
    active
      ? "bg-card font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_1px_rgba(17,24,39,0.05)]"
      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  );
  const content = collapsed ? (
    <>
      {icon}
      {count !== null && (
        // The rail has no room for a number, so unread mail shows as a dot.
        <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
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

function cx(...values: Array<string | boolean | undefined>) {
  return values.filter(Boolean).join(" ");
}
