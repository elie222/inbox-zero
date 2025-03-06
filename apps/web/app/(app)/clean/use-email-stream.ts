"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Email, EmailStats } from "./types";

export function useEmailStream(initialPaused = false) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [stats, setStats] = useState<EmailStats>({
    total: 0,
    inbox: 0,
    archived: 0,
    deleted: 0,
    labeled: 0,
    labels: {},
    rate: 0,
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

      // Process incoming email data
      eventSource.onmessage = (event) => {
        console.log("SSE message received:", event.data);
        try {
          const data = JSON.parse(event.data);

          if (data.type === "stats") {
            // Handle stats update
            console.log("Received stats update:", data);
            setStats(data);
          } else {
            // Handle incoming email
            console.log("Received email:", data);
            setEmails((prev) => {
              const newEmails = [data, ...prev]; // Add new email at the beginning

              // Update stats manually
              setStats((prev) => {
                const newStats = { ...prev };
                newStats.total += 1;

                if (data.action === "archive") {
                  newStats.archived += 1;
                } else if (data.action === "delete") {
                  newStats.deleted += 1;
                } else if (data.action === "label") {
                  newStats.labeled += 1;
                  if (data.label) {
                    newStats.labels[data.label] =
                      (newStats.labels[data.label] || 0) + 1;
                  }
                } else {
                  newStats.inbox += 1;
                }

                return newStats;
              });

              // Keep only the most recent maxEmails
              if (newEmails.length > maxEmails) {
                return newEmails.slice(0, maxEmails);
              }
              return newEmails;
            });
          }
        } catch (error) {
          console.error("Error processing SSE message:", error);
        }
      };

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
  }, [isPaused]);

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

  // Toggle pause state
  const togglePause = useCallback(() => {
    setIsPaused((prev) => {
      console.log("Toggling pause state from", prev, "to", !prev);
      return !prev;
    });
  }, []);

  return {
    emails,
    stats,
    isPaused,
    togglePause,
  };
}
