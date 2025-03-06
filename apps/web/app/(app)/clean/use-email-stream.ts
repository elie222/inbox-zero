"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { CleanThread, CleanStats } from "@/utils/redis/clean.types";

export function useEmailStream(initialPaused = false) {
  const [emailsMap, setEmailsMap] = useState<Record<string, CleanThread>>({});
  const [emailOrder, setEmailOrder] = useState<string[]>([]);
  const [stats, setStats] = useState<CleanStats>({
    total: 0,
    processing: 0,
    applying: 0,
    completed: 0,
    archived: 0,
    labels: {},
  });
  const [isPaused, setIsPaused] = useState(initialPaused);
  const eventSourceRef = useRef<EventSource | null>(null);
  const maxEmails = 1000; // Maximum emails to keep in the buffer

  const connectToSSE = useCallback(() => {
    try {
      if (isPaused) {
        console.log("SSE paused - closing connection if exists");
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        return;
      }

      if (eventSourceRef.current) {
        console.log("SSE connection already exists");
        return;
      }

      console.log("Connecting to SSE...");

      const eventSource = new EventSource("/api/email-stream");
      eventSourceRef.current = eventSource;

      console.log("SSE connection created");

      eventSource.onopen = () => {
        console.log("SSE connection opened");
      };

      // Handle stats events
      eventSource.addEventListener("stats", (event) => {
        console.log("SSE stats received:", event.data);
        try {
          const statsData: CleanStats = JSON.parse(event.data);
          setStats(statsData);
        } catch (error) {
          console.error("Error processing stats:", error);
        }
      });

      // Handle thread events
      eventSource.addEventListener("thread", (event) => {
        console.log("SSE thread received:", event.data);
        try {
          const d: CleanThread = JSON.parse(event.data);
          const data = { ...d, date: new Date(d.date) };

          setEmailsMap((prev) => {
            // If we're at the limit and this is a new email, remove the oldest one
            if (Object.keys(prev).length >= maxEmails && !prev[data.threadId]) {
              const newMap = { ...prev };
              delete newMap[emailOrder[emailOrder.length - 1]];
              return {
                ...newMap,
                [data.threadId]: data,
              };
            }
            return {
              ...prev,
              [data.threadId]: data,
            };
          });

          // Update order - add to beginning if new, otherwise maintain existing position
          setEmailOrder((prev) => {
            if (!prev.includes(data.threadId)) {
              const newOrder = [data.threadId, ...prev];
              return newOrder.slice(0, maxEmails);
            }
            return prev;
          });
        } catch (error) {
          console.error("Error processing thread:", error);
        }
      });

      eventSource.onerror = (error) => {
        console.error("SSE connection error:", error);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }

        // Attempt to reconnect after a short delay if not paused
        if (!isPaused) {
          console.log("Attempting to reconnect in 2 seconds...");
          setTimeout(connectToSSE, 2000);
        }
      };
    } catch (error) {
      console.error("Error establishing SSE connection:", error);
    }
  }, [isPaused, emailOrder]);

  // Connect or disconnect based on pause state
  useEffect(() => {
    console.log("SSE effect triggered, isPaused:", isPaused);
    connectToSSE();

    // Cleanup
    return () => {
      console.log("Cleaning up SSE connection");
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connectToSSE, isPaused]);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const emails = useMemo(() => {
    return emailOrder.map((id) => emailsMap[id]).filter(Boolean);
  }, [emailsMap, emailOrder]);

  return {
    emails,
    stats,
    isPaused,
    togglePause,
  };
}
