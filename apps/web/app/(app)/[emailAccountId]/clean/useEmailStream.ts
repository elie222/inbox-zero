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

      if (eventSourceRef.current) return;

      if (!emailAccountId) {
        console.error("Email account ID is missing, cannot connect to SSE.");
        return;
      }

      const eventSourceUrl = `/api/email-stream?emailAccountId=${encodeURIComponent(emailAccountId)}`;
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
            if (
              Object.keys(prev).length >= maxEmails &&
              !prev[thread.threadId]
            ) {
              const newMap = { ...prev };
              delete newMap[emailOrder[emailOrder.length - 1]];
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
  }, [isPaused, emailOrder, emailAccountId]);

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
