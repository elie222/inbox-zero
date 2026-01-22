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
        "mx-auto max-w-screen-2xl w-full px-4 xl:px-20 2xl:px-36 mb-12 md:mb-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
