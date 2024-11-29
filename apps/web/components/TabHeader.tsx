import { cn } from "@/utils";

interface TabHeaderProps {
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export const TabHeader = ({ children, className, actions }: TabHeaderProps) => {
  return (
    <div
      className={cn(
        "content-container flex shrink-0 flex-col justify-between gap-x-4 space-y-2 border-b border-gray-200 bg-white py-2 shadow-sm md:flex-row md:gap-x-6 md:space-y-0",
        className,
      )}
    >
      <div className="w-full overflow-x-auto">{children}</div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
};
