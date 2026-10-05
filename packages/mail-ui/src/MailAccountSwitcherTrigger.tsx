import type { ComponentProps, ReactNode } from "react";

export function MailAccountSwitcherTrigger({
  icon,
  indicator,
  label,
  email,
  collapsed = false,
  compact = false,
  className = "",
  ...buttonProps
}: Omit<ComponentProps<"button">, "children"> & {
  icon: ReactNode;
  indicator: ReactNode;
  label: string;
  email?: string | null;
  collapsed?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      {...buttonProps}
      aria-label={buttonProps["aria-label"] ?? (collapsed ? label : undefined)}
      className={`flex w-full items-center rounded-xl text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${collapsed ? "justify-center" : "gap-3 px-2"} ${compact ? "h-11" : "h-10"} ${className}`}
    >
      {icon}
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate font-medium text-sm">{label}</span>
            {email ? (
              <span className="block truncate text-muted-foreground text-xs">
                {email}
              </span>
            ) : null}
          </span>
          {indicator}
        </>
      )}
    </button>
  );
}
