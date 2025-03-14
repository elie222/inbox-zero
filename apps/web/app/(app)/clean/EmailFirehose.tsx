"use client";

import { useState, useEffect, useRef } from "react";
import { parseAsString, useQueryState } from "nuqs";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Inbox, Pause, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailItem } from "./EmailFirehoseItem";
import { EmailStats } from "./EmailFirehoseStats";
import { useEmailStream } from "./use-email-stream";
import { Loading } from "@/components/Loading";
import type { CleanThread } from "@/utils/redis/clean.types";
import type { CleanAction } from "@prisma/client";

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

  const { emails, togglePause } = useEmailStream(isPaused, threads);

  // For virtualization
  const parentRef = useRef<HTMLDivElement>(null);

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

  // Handle scroll events to detect user interaction
  const handleScroll = () => {
    if (!userHasScrolled) {
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
      virtualizer.scrollToIndex(emails.length - 1, { align: "end" });
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
          <EmailStats stats={stats} action={action} />
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <div className="mr-1 size-3 rounded-full bg-blue-500" />
            <span>Inbox</span>
          </div>
          <div className="flex items-center">
            <div className="mr-1 size-3 rounded-full bg-green-500" />
            <span>Archived</span>
          </div>
          <div className="flex items-center">
            <div className="mr-1 size-3 rounded-full bg-yellow-500" />
            <span>Labeled</span>
          </div>
        </div>
        <div>Processed: {stats.total} emails</div>
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
