import { cn } from "@/utils";

interface ActionBarProps {
  children: React.ReactNode;
  className?: string;
  rightContent?: React.ReactNode;
}

export function ActionBar({
  children,
  className,
  rightContent,
}: ActionBarProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between w-full gap-3",
        className,
      )}
    >
      <div className="flex items-center gap-3">{children}</div>
      <div className="flex items-center gap-3">{rightContent}</div>
    </div>
  );
}
