import { Skeleton } from "@/components/ui/skeleton";

// Instant shell while the contacts route loads: without this, tapping
// Contacts in the app tray leaves the previous page frozen until the server
// responds. Shaped like the control bar + card rows the real page renders.
export default function Loading() {
  return (
    <div className="flex flex-col" aria-hidden="true">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3 md:px-6 md:py-4">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 max-w-[420px] flex-1" />
        <Skeleton className="ml-auto h-8 w-28 shrink-0" />
      </div>
      <div className="flex flex-col gap-2 p-4 md:px-6">
        {Array.from({ length: 10 }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-[10px] border border-border px-3.5 py-2.5"
          >
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-1.5 h-3 w-56 max-w-full" />
            </div>
            <Skeleton className="h-3.5 w-12 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
