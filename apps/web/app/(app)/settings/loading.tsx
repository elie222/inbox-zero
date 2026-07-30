import { Skeleton } from "@/components/ui/skeleton";

// Instant shell while the settings route loads: without this, tapping
// Settings in the app tray leaves the previous page frozen until the server
// responds.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6" aria-hidden="true">
      <Skeleton className="h-7 w-32" />
      <div className="mt-6 flex flex-col gap-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-lg border border-border p-4"
          >
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="mt-1.5 h-3 w-64 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
