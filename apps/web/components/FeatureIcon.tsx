import { cn } from "@/utils";

export function FeatureIcon({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg bg-gradient-to-b from-new-blue-150 to-new-blue-200 p-px shadow-sm",
        className,
      )}
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[7px] bg-gradient-to-b from-new-blue-50 to-new-blue-100 text-new-blue-600 shadow-sm">
        {children}
      </div>
    </div>
  );
}
