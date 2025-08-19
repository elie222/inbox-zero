import { cn } from "@/utils";

export function PageWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto max-w-screen-xl w-full", className)}>
      {children}
    </div>
  );
}
