import { cn } from "@/utils";

export function IllustrationWindow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      data-theme="mail"
      className={cn(
        "pointer-events-none select-none overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl shadow-black/10",
        className,
      )}
    >
      <div className="flex h-9 items-center gap-1.5 border-b border-border bg-sidebar px-3.5">
        <span className="size-2.5 rounded-full bg-[#FF5F57]" />
        <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="size-2.5 rounded-full bg-[#28C840]" />
      </div>
      {children}
    </div>
  );
}
