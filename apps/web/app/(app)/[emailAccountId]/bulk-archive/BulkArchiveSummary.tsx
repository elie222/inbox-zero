"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";

const COUNT_DURATION_MS = 600;
const CLOCK_TICK_MS = 15_000;

export function BulkArchiveSummary({
  inboxCount,
  baselineCount,
  archivedCount,
  fetchedAt,
  isRefreshing,
  onRefresh,
}: {
  inboxCount: number;
  baselineCount?: number;
  archivedCount: number;
  fetchedAt?: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pt-4">
      <div>
        <p className="text-sm text-muted-foreground">
          In your inbox from these senders
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
          <CountingNumber
            value={inboxCount}
            className="text-3xl font-semibold leading-9"
          />
          {archivedCount > 0 && baselineCount !== undefined && (
            <span className="text-sm text-muted-foreground">
              was <span className="tabular-nums">{baselineCount}</span> ·{" "}
              <span className="tabular-nums">{archivedCount}</span> archived
              just now
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {fetchedAt && <UpdatedAgo at={fetchedAt} />}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCwIcon
            className={cn(
              "mr-2 size-4",
              isRefreshing && "animate-spin motion-reduce:animate-none",
            )}
          />
          Refresh
        </Button>
      </div>
    </div>
  );
}

function CountingNumber({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);

  useEffect(() => {
    if (shownRef.current === value) return;

    const from = shownRef.current;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shownRef.current = value;
      setShown(value);
      return;
    }

    const startedAt = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / COUNT_DURATION_MS);
      const eased = 1 - (1 - progress) ** 3;
      shownRef.current = Math.round(from + (value - from) * eased);
      setShown(shownRef.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <>
      <span aria-hidden className={cn("tabular-nums", className)}>
        {shown}
      </span>
      <span className="sr-only">{value}</span>
    </>
  );
}

function UpdatedAgo({ at }: { at: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="text-sm text-muted-foreground">
      Updated {formatUpdatedAgo(now - new Date(at).getTime())}
    </span>
  );
}

export function formatUpdatedAgo(elapsedMs: number) {
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
