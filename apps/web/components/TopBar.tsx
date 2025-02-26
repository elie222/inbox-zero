import { cn } from "@/utils";

interface TopBarProps {
  children: React.ReactNode;
  className?: string;
  sticky?: boolean;
}

export function TopBar({ children, className, sticky = false }: TopBarProps) {
  return (
    <div
      className={cn(
        "border-border bg-background justify-between border-b px-2 py-2 shadow-sm sm:flex sm:px-4",
        sticky && "top-0 z-10 sm:sticky",
        className,
      )}
    >
      {children}
    </div>
  );
}
