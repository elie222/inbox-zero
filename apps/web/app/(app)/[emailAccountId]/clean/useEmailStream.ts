/** biome-ignore-all lint/suspicious/noConsole: helpful for debugging till feature is fully live */
"use client";

import keyBy from "lodash/keyBy";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { CleanThread } from "@/utils/redis/clean.types";

export function useEmailStream(
  emailAccountId: string,
  initialPaused = false,
  initialThreads: CleanThread[] = [],
  filter?: string | null,
) {
  // Initialize emailsMap with sorted threads and proper dates
  const [emailsMap, setEmailsMap] = useState<Record<string, CleanThread>>(() =>
    createEmailMap(initialThreads),
  );

  // Initialize emailOrder sorted by date (newest first)
  const [emailOrder, setEmailOrder] = useState<string[]>(() =>
    getSortedThreadIds(initialThreads),
  );

  const [isPaused, setIsPaused] = useState(initialPaused);
  const eventSourceRef = useRef<EventSource | null>(null);
  const isConnectingRef = useRef(false);
  const isMountedRef = useRef(true);
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
        console.log("Already have an active connection, skipping");
        return;
      }

      if (isConnectingRef.current) {
        console.log("Connection already in progress, skipping");
        return;
      }

      if (!emailAccountId) {
        console.error("Email account ID is missing, cannot connect to SSE.");
        return;
      }

      isConnectingRef.current = true;

      const eventSourceUrl = `/api/email-stream?emailAccountId=${encodeURIComponent(emailAccountId)}`;
      console.log("Connecting to SSE:", eventSourceUrl);
      const eventSource = new EventSource(eventSourceUrl, {
        withCredentials: true,
      });
      eventSourceRef.current = eventSource;

      // Handle thread events
      eventSource.addEventListener("thread", (event) => {
        try {
          const threadData: CleanThread = JSON.parse(event.data);
          const thread = {
            ...threadData,
            date: new Date(threadData.date),
          };

          setEmailsMap((prev) => {
            // If we're at the limit and this is a new email, remove the oldest one
            const currentOrder = Object.keys(prev);
            if (currentOrder.length >= maxEmails && !prev[thread.threadId]) {
              const newMap = { ...prev };
              delete newMap[currentOrder[currentOrder.length - 1]];
              return {
                ...newMap,
                [thread.threadId]: thread,
              };
            }
            return {
              ...prev,
              [thread.threadId]: thread,
            };
          });

          // Update order - add to end if new
          setEmailOrder((prev) => {
            if (!prev.includes(thread.threadId)) {
              return [...prev, thread.threadId];
            }
            return prev;
          });
        } catch (error) {
          console.error("Error processing thread:", error);
        }
      });

      eventSource.onopen = () => {
        console.log("SSE connection opened successfully");
        isConnectingRef.current = false;
      };

      eventSource.onerror = (error) => {
        console.error("SSE connection error:", error);
        console.error("EventSource readyState:", eventSource.readyState);
        console.error("EventSource URL:", eventSourceUrl);

        isConnectingRef.current = false;

        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }

        // Attempt to reconnect after a short delay if not paused
        if (!isPaused) {
          console.log("Attempting to reconnect in 5 seconds...");
          setTimeout(connectToSSE, 5000);
        }
      };
    } catch (error) {
      console.error("Error establishing SSE connection:", error);
    }
  }, [isPaused, emailAccountId]); // Removed emailOrder from dependencies!

  // Connect or disconnect based on pause state
  useEffect(() => {
    isMountedRef.current = true;
    console.log("SSE effect triggered, isPaused:", isPaused);
    connectToSSE();

    // Cleanup - but only if we're truly unmounting (not just a hot reload)
    return () => {
      isMountedRef.current = false;
      // Don't close connection immediately - wait to see if component remounts
      setTimeout(() => {
        if (!isMountedRef.current) {
          console.log("Cleaning up SSE connection (component unmounted)");
          isConnectingRef.current = false;
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
        } else {
          console.log("Component remounted, keeping connection alive");
        }
      }, 100);
    };
  }, [connectToSSE]); // Removed isPaused - it's already in connectToSSE dependencies

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const emails = useMemo(() => {
    return emailOrder.reduce<(typeof emailsMap)[string][]>((acc, id) => {
      const email = emailsMap[id];
      if (!email) return acc;

      if (!filter) {
        acc.push(email);
        return acc;
      }

      if (filter === "keep" && !email.archive && !email.label) {
        acc.push(email);
      } else if (filter === "archived" && email.archive === true) {
        acc.push(email);
      }

      return acc;
    }, []);
  }, [emailsMap, emailOrder, filter]);

  return {
    emails,
    isPaused,
    togglePause,
  };
}

/**
 * Helper Functions
 */

function createEmailMap(threads: CleanThread[]): Record<string, CleanThread> {
  const threadsWithDates = threads.map((thread) => ({
    ...thread,
    date: new Date(thread.date),
  }));
  return keyBy(threadsWithDates, "threadId");
}

function getSortedThreadIds(threads: CleanThread[]): string[] {
  return threads
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((thread) => thread.threadId);
}
