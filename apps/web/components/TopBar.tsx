import { cn } from "@/utils";

export function TopBar({
  children,
  sticky = false,
  className,
}: {
  children: React.ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-1 border-b bg-white px-2 py-2 shadow sm:flex-row sm:px-4",
        sticky && "top-0 z-10 sm:sticky",
        className,
      )}
    >
      {children}
    </div>
  );
}
