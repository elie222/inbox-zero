import { Loader2Icon } from "lucide-react";
import { cn } from "@/utils";

export function Loading({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center p-8", className)}>
      <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export function LoadingMiniSpinner({ className }: { className?: string }) {
  return (
    <Loader2Icon
      className={cn("size-4 animate-spin text-muted-foreground", className)}
    />
  );
}

export function ButtonLoader({ className }: { className?: string }) {
  return <Loader2Icon className={cn("mr-2 size-4 animate-spin", className)} />;
}
