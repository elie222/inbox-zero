"use client";

import { useState, useEffect, useRef } from "react";
import { parseAsString, useQueryState } from "nuqs";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2Icon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailItem } from "./EmailFirehoseItem";
import { useEmailStream } from "./useEmailStream";
import type { CleanThread } from "@/utils/redis/clean.types";
import { CleanAction } from "@/generated/prisma/enums";
import { useAccount } from "@/providers/EmailAccountProvider";

export function EmailFirehose({
  threads,
  stats,
  action,
}: {
  threads: CleanThread[];
  stats: {
    total: number;
    done: number;
  };
  action: CleanAction;
}) {
  const { userEmail, emailAccountId } = useAccount();

  const [isPaused, _setIsPaused] = useState(false);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const [tab] = useQueryState("tab", parseAsString.withDefault("archived"));
  // Track undo state for all threads
  const [undoStates, setUndoStates] = useState<
    Record<string, "undoing" | "undone">
  >({});

  const { emails, lastEventAt, totalReceived } = useEmailStream(
    emailAccountId,
    isPaused,
    threads,
    tab,
  );

  // Track whether the stream appears stalled (no events for 15s)
  const [isStalled, setIsStalled] = useState(false);
  useEffect(() => {
    if (!lastEventAt) return;
    setIsStalled(false);
    const timer = setTimeout(() => setIsStalled(true), 15_000);
    return () => clearTimeout(timer);
  }, [lastEventAt]);

  // For virtualization
  const parentRef = useRef<HTMLDivElement>(null);
  // Track programmatic scrolling
  const isProgrammaticScrollRef = useRef(false);

  const virtualizer = useVirtualizer({
    count: emails.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56, // Estimated height of each email item
    overscan: 10, // Number of items to render outside of the visible area
  });

  // Handle scroll events to detect user interaction
  const handleScroll = () => {
    // Only set userHasScrolled if this is not a programmatic scroll
    if (!userHasScrolled && !isProgrammaticScrollRef.current) {
      setUserHasScrolled(true);
    }
  };

  // Reset userHasScrolled when switching tabs
  // biome-ignore lint/correctness/useExhaustiveDependencies: We want to reset scroll state when tab changes
  useEffect(() => {
    setUserHasScrolled(false);
  }, [tab]);

  // Modified auto-scroll behavior - now scrolls to bottom for new items
  useEffect(() => {
    if (
      !isPaused &&
      tab === "feed" &&
      parentRef.current &&
      emails.length > 0 &&
      !userHasScrolled
    ) {
      // Set flag to indicate programmatic scrolling
      isProgrammaticScrollRef.current = true;
      virtualizer.scrollToIndex(emails.length - 1, { align: "end" });

      // Clear flag after scrolling is likely complete
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 100);
    }
  }, [isPaused, tab, emails.length, virtualizer, userHasScrolled]);

  return (
    <div className="flex flex-col space-y-4">
      <ProcessingStatus
        totalReceived={totalReceived}
        isStalled={isStalled}
        lastEventAt={lastEventAt}
        action={action}
      />
      <Tabs defaultValue="done" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="done">
            {action === CleanAction.ARCHIVE ? "Archived" : "Marked read"}
          </TabsTrigger>
          <TabsTrigger value="keep">Kept</TabsTrigger>
        </TabsList>
        <div
          ref={parentRef}
          onScroll={handleScroll}
          className="mt-2 h-[calc(100vh-300px)] overflow-y-auto rounded-md border bg-muted/20"
        >
          {emails.length > 0 ? (
            <div
              className="relative w-full p-2"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => (
                <div
                  key={virtualItem.key}
                  className="absolute left-0 top-0 w-full p-1"
                  style={{
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <EmailItem
                    email={emails[virtualItem.index]}
                    userEmail={userEmail}
                    emailAccountId={emailAccountId}
                    action={action}
                    undoState={undoStates[emails[virtualItem.index].threadId]}
                    setUndoing={(threadId) => {
                      setUndoStates((prev) => ({
                        ...prev,
                        [threadId]: "undoing",
                      }));
                    }}
                    setUndone={(threadId) => {
                      setUndoStates((prev) => ({
                        ...prev,
                        [threadId]: "undone",
                      }));
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center py-20 text-muted-foreground">
              {stats.total ? (
                <span>
                  {stats.total} emails processed. {stats.done}{" "}
                  {action === CleanAction.ARCHIVE ? "archived" : "marked read"}.
                </span>
              ) : (
                <span>No emails yet</span>
              )}
            </div>
          )}
        </div>
      </Tabs>

    </div>
  );
}

function ProcessingStatus({
  totalReceived,
  isStalled,
  lastEventAt,
  action,
}: {
  totalReceived: number;
  isStalled: boolean;
  lastEventAt: number | null;
  action: CleanAction;
}) {
  if (totalReceived === 0 && !lastEventAt) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="h-4 w-4 animate-spin" />
        <span>Fetching emails from Gmail...</span>
      </div>
    );
  }

  const actionLabel =
    action === CleanAction.ARCHIVE ? "archived" : "marked read";

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        {isStalled ? (
          <>
            <Loader2Icon className="h-4 w-4 animate-spin" />
            <span>
              Waiting for Gmail API... ({totalReceived} emails processed)
            </span>
          </>
        ) : (
          <>
            <Loader2Icon className="h-4 w-4 animate-spin" />
            <span>
              Processing — {totalReceived} emails {actionLabel} so far
            </span>
          </>
        )}
      </div>
    </div>
  );
}
