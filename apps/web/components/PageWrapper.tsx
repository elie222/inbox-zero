import { cn } from "@/utils";

export function PageWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto max-w-screen-xl w-full px-2 md:px-4 2xl:px-0 mb-12 md:mb-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
