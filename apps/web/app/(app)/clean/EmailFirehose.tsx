"use client";

import { useState, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Inbox, Pause, Play } from "lucide-react";
import { EmailItem } from "./EmailFirehoseItem";
import { EmailStats } from "./EmailFirehoseStats";
import { useEmailSSE } from "./use-email-sse";

export function EmailFirehose() {
  const [isPaused, setIsPaused] = useState(false);
  const [view, setView] = useState<"firehose" | "stats">("firehose");

  const { emails, stats, processingRate, setProcessingRate, togglePause } =
    useEmailSSE(isPaused);

  // For virtualization
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: emails.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56, // Estimated height of each email item
    overscan: 10, // Number of items to render outside of the visible area
  });

  const handlePauseToggle = () => {
    setIsPaused(!isPaused);
    togglePause();
  };

  // Auto-scroll based on display order
  useEffect(() => {
    if (
      !isPaused &&
      view === "firehose" &&
      parentRef.current &&
      emails.length > 0
    ) {
      virtualizer.scrollToIndex(0, { align: "start" });
    }
  }, [isPaused, view, emails.length, virtualizer]);

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="px-2 py-1 text-xs">
            <Clock className="mr-1 h-3 w-3" />
            {processingRate} emails/sec
          </Badge>
          <Badge variant="outline" className="px-2 py-1 text-xs">
            <Inbox className="mr-1 h-3 w-3" />
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
      </div>

      <Tabs defaultValue="firehose" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="firehose">Firehose</TabsTrigger>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
        </TabsList>
        <TabsContent value="firehose">
          <div
            ref={parentRef}
            className="mt-2 h-[600px] overflow-y-auto rounded-md border bg-muted/20"
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
                    <EmailItem email={emails[virtualItem.index]} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center py-20 text-muted-foreground">
                No emails processed yet. Resume to start streaming emails.
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="stats">
          <EmailStats stats={stats} />
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <div className="mr-1 h-3 w-3 rounded-full bg-blue-500" />
            <span>Inbox</span>
          </div>
          <div className="flex items-center">
            <div className="mr-1 h-3 w-3 rounded-full bg-green-500" />
            <span>Archived</span>
          </div>
          <div className="flex items-center">
            <div className="mr-1 h-3 w-3 rounded-full bg-yellow-500" />
            <span>Labeled</span>
          </div>
        </div>
        <div>Streamed: {emails.length} emails</div>
      </div>
    </div>
  );
}
