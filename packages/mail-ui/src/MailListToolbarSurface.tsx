import type { ComponentProps, FormEventHandler, ReactNode } from "react";

export function MailListToolbarSurface({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex shrink-0 items-center gap-2 px-3 pt-3 pb-3 ${className}`}
    >
      {children}
    </div>
  );
}

export function MailSearchSurface({
  children,
  searchIcon,
  controls,
  active = false,
  className = "",
  onSubmit,
  ...surfaceProps
}: Omit<ComponentProps<"div">, "onSubmit"> & {
  children: ReactNode;
  searchIcon: ReactNode;
  controls?: ReactNode;
  active?: boolean;
  className?: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  return (
    <div
      {...surfaceProps}
      className={`relative flex h-8 min-w-0 flex-1 items-center rounded-lg border border-border bg-sidebar text-muted-foreground text-sm transition-colors focus-within:border-[hsl(var(--border-strong))] focus-within:bg-background hover:border-[hsl(var(--border-strong))] ${active ? "border-[hsl(var(--border-strong))] bg-background" : ""} ${className}`}
    >
      <form
        role="search"
        onSubmit={onSubmit}
        className="flex h-full min-w-0 flex-1 items-center gap-2 px-2.5"
      >
        {searchIcon}
        {children}
      </form>
      {controls}
    </div>
  );
}
