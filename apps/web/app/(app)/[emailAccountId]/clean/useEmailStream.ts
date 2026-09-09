/** biome-ignore-all lint/suspicious/noConsole: helpful for debugging till feature is fully live */
"use client";

import keyBy from "lodash/keyBy";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { CleanThread } from "@/utils/redis/clean.types";

const MAX_EMAILS = 1000;

type EmailStreamState = {
  emailsMap: Record<string, CleanThread>;
  emailOrder: string[];
};

export function useEmailStream(
  emailAccountId: string,
  initialPaused = false,
  initialThreads: CleanThread[] = [],
  filter?: string | null,
) {
  // Initialize emailsMap with sorted threads and proper dates
  const [{ emailsMap, emailOrder }, setEmailState] = useState<EmailStreamState>(
    () => ({
      emailsMap: createEmailMap(initialThreads),
      emailOrder: getSortedThreadIds(initialThreads),
    }),
  );

  const [isPaused, setIsPaused] = useState(initialPaused);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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

          setEmailState((current) =>
            addThreadToEmailState(current, thread, MAX_EMAILS),
          );
        } catch (error) {
          console.error("Error processing thread:", error);
        }
      });

      eventSource.onerror = (error) => {
        console.error("SSE connection error:", error);
        if (eventSourceRef.current !== eventSource) return;

        eventSource.close();
        eventSourceRef.current = null;

        // Attempt to reconnect after a short delay if not paused
        if (!isPaused && reconnectTimeoutRef.current === null) {
          console.log("Attempting to reconnect in 2 seconds...");
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connectToSSE();
          }, 2000);
        }
      };
    } catch (error) {
      console.error("Error establishing SSE connection:", error);
    }
  }, [isPaused, emailAccountId]);

  // Connect or disconnect based on pause state
  useEffect(() => {
    connectToSSE();

    // Cleanup
    return () => {
      console.log("Cleaning up SSE connection");
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.onerror = null;
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connectToSSE]);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const emails = useMemo(
    () =>
      emailOrder.reduce<(typeof emailsMap)[string][]>((acc, id) => {
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
      }, []),
    [emailsMap, emailOrder, filter],
  );

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

export function addThreadToEmailState(
  current: EmailStreamState,
  thread: CleanThread,
  maxEmails: number,
): EmailStreamState {
  const isNewThread = !current.emailsMap[thread.threadId];
  const emailsMap = {
    ...current.emailsMap,
    [thread.threadId]: thread,
  };

  if (!isNewThread) return { ...current, emailsMap };

  const emailOrder = [...current.emailOrder, thread.threadId];
  if (emailOrder.length <= maxEmails) return { emailsMap, emailOrder };

  const [oldestThreadId, ...remainingEmailOrder] = emailOrder;
  delete emailsMap[oldestThreadId];

  return { emailsMap, emailOrder: remainingEmailOrder };
}
