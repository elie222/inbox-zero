"use client";

import { useState, useEffect, useRef } from "react";
import { parseAsString, useQueryState } from "nuqs";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailItem } from "./EmailFirehoseItem";
import { useEmailStream } from "./useEmailStream";
import type { CleanThread } from "@/utils/redis/clean.types";
import { CleanAction } from "@prisma/client";
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

  const { emails } = useEmailStream(emailAccountId, isPaused, threads, tab);

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

      {/* <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center space-x-4">
          <button
            type="button"
            onClick={() => setFilter(filter === "keep" ? null : "keep")}
            className={`flex items-center ${filter === "keep" ? "rounded-md bg-blue-100 px-2 py-1 dark:bg-blue-900/30" : "hover:underline"}`}
          >
            <div className="mr-1 size-3 rounded-full bg-blue-500" />
            <span>Keep</span>
            {filter === "keep" && (
              <XCircle className="ml-1 size-3 text-muted-foreground" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilter(filter === "archived" ? null : "archived")}
            className={`flex items-center ${filter === "archived" ? "rounded-md bg-green-100 px-2 py-1 dark:bg-green-900/30" : "hover:underline"}`}
          >
            <div className="mr-1 size-3 rounded-full bg-green-500" />
            <span>
              {action === CleanAction.ARCHIVE ? "Archived" : "Marked read"}
            </span>
            {filter === "archived" && (
              <XCircle className="ml-1 size-3 text-muted-foreground" />
            )}
          </button>
        </div>
      </div> */}
    </div>
  );
}
