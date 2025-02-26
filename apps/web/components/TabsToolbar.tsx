import { cn } from "@/utils";

interface TabsToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function TabsToolbar({
  className,
  children,
  ...props
}: TabsToolbarProps) {
  return (
    <div
      className={cn(
        "content-container border-border bg-background flex shrink-0 flex-col justify-between space-y-2 gap-x-4 border-b py-2 shadow-xs md:flex-row md:space-y-0 md:gap-x-6",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
