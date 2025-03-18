"use client";

import { useState, useEffect, useRef } from "react";
import { parseAsString, useQueryState } from "nuqs";
import { useVirtualizer } from "@tanstack/react-virtual";
import { XCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailItem } from "./EmailFirehoseItem";
import { CleanStats } from "./CleanStats";
import { useEmailStream } from "./useEmailStream";
import { Loading } from "@/components/Loading";
import type { CleanThread } from "@/utils/redis/clean.types";
import { CleanAction } from "@prisma/client";

export function EmailFirehose({
  threads,
  stats,
  userEmail,
  action,
}: {
  threads: CleanThread[];
  stats: {
    total: number;
    archived: number;
  };
  userEmail: string;
  action: CleanAction;
}) {
  const [isPaused, setIsPaused] = useState(false);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const [tab] = useQueryState("tab", parseAsString.withDefault("feed"));
  const [filter, setFilter] = useQueryState("filter", parseAsString);
  // Track undo state for all threads
  const [undoStates, setUndoStates] = useState<
    Record<string, "undoing" | "undone">
  >({});

  const { emails, togglePause } = useEmailStream(isPaused, threads, filter);

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

  // const handlePauseToggle = () => {
  //   setIsPaused(!isPaused);
  //   togglePause();
  // };

  // Reset to live view
  // const resetToLive = () => {
  //   setUserHasScrolled(false);
  //   if (emails.length > 0) {
  //     // Set flag to indicate programmatic scrolling
  //     isProgrammaticScrollRef.current = true;
  //     virtualizer.scrollToIndex(emails.length - 1, { align: "end" });

  //     // Clear flag after scrolling is likely complete
  //     setTimeout(() => {
  //       isProgrammaticScrollRef.current = false;
  //     }, 100);
  //   }
  // };

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
      <Tabs defaultValue="feed" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="feed">Feed</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
        </TabsList>
        <TabsContent value="feed">
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
                <Loading />
                <span>Processing...</span>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="stats">
          <CleanStats stats={stats} action={action} />
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
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
          {/* <button
            onClick={() => setFilter(filter === 'labeled' ? null : 'labeled')}
            className={`flex items-center ${filter === 'labeled' ? 'bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded-md' : 'hover:underline'}`}
          >
            <div className="mr-1 size-3 rounded-full bg-yellow-500" />
            <span>Labeled</span>
            {filter === 'labeled' && (
              <XCircle className="ml-1 size-3 text-muted-foreground" />
            )}
          </button> */}
        </div>
        {/* <div className="flex items-center space-x-2">
          {userHasScrolled && (
            <Button
              variant="outline"
              size="sm"
              onClick={resetToLive}
              className="h-8"
            >
              <Play className="mr-1 h-3.5 w-3.5" />
              Back to Live
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handlePauseToggle}
            className="h-8"
          >
            {isPaused ? (
              <>
                <Play className="mr-1 h-3.5 w-3.5" />
                Resume
              </>
            ) : (
              <>
                <Pause className="mr-1 h-3.5 w-3.5" />
                Pause
              </>
            )}
          </Button>
        </div> */}
      </div>

      {/* <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="px-2 py-1 text-xs">
            <Inbox className="mr-1 size-3" />
            {stats.total.toLocaleString()} processed
          </Badge>
        </div>
        <div className="flex items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePauseToggle}
            className="h-8"
          >
            {isPaused ? (
              <>
                <Play className="mr-1 h-3.5 w-3.5" />
                Resume
              </>
            ) : (
              <>
                <Pause className="mr-1 h-3.5 w-3.5" />
                Pause
              </>
            )}
          </Button>
        </div>
      </div> */}
    </div>
  );
}
