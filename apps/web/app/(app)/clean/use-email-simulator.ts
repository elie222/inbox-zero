"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Email, EmailStats } from "./types";

const ACTIONS = ["archive", "delete", "label", null] as const;
const COMMON_LABELS = [
  "Important",
  "Work",
  "Personal",
  "Finance",
  "Travel",
  "Shopping",
  "Updates",
  "Social",
  "Promotions",
  "Forums",
];
const SENDERS = [
  "john.doe@example.com",
  "jane.smith@company.co",
  "newsletter@service.com",
  "support@platform.io",
  "info@organization.org",
  "team@startup.app",
  "sales@business.net",
  "updates@network.com",
  "noreply@system.edu",
  "contact@provider.dev",
];

const SUBJECTS = [
  "Weekly Newsletter",
  "Your Account Update",
  "Invoice #12345",
  "Meeting Reminder",
  "Important Announcement",
  "Your Order Has Shipped",
  "Action Required",
  "Invitation to Event",
  "Security Alert",
  "Payment Confirmation",
  "New Feature Announcement",
  "Feedback Request",
  "Subscription Renewal",
  "Welcome Aboard",
  "Password Reset",
];

function generateRandomEmail(): Email {
  const id = Math.random().toString(36).substring(2, 10);
  const subject = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
  const from = SENDERS[Math.floor(Math.random() * SENDERS.length)];
  const size = Math.floor(Math.random() * 100) + 1;
  const timestamp = new Date().toLocaleTimeString();
  const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  const label =
    action === "label"
      ? COMMON_LABELS[Math.floor(Math.random() * COMMON_LABELS.length)]
      : undefined;

  return {
    id,
    subject,
    from,
    timestamp,
    size,
    action,
    label,
  };
}

export function useEmailSimulator(initialPaused = false) {
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
  const [processingRate, setProcessingRate] = useState(5);
  const [isPaused, setIsPaused] = useState(initialPaused);
  const processedCountRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const statsRef = useRef(stats);
  const maxEmails = 1000; // Maximum emails to keep in the buffer

  // Update statsRef when stats change
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  // Process email and update stats
  const processEmail = useCallback(() => {
    if (isPaused) return;

    const newEmail = generateRandomEmail();
    processedCountRef.current += 1;

    // Update stats
    const newStats = { ...statsRef.current };
    newStats.total += 1;

    if (newEmail.action === "archive") {
      newStats.archived += 1;
    } else if (newEmail.action === "delete") {
      newStats.deleted += 1;
    } else if (newEmail.action === "label") {
      newStats.labeled += 1;
      if (newEmail.label) {
        newStats.labels[newEmail.label] =
          (newStats.labels[newEmail.label] || 0) + 1;
      }
    } else {
      newStats.inbox += 1;
    }

    // Calculate rate
    const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
    if (elapsedTime > 0) {
      newStats.rate = processedCountRef.current / elapsedTime;
    }

    setStats(newStats);

    // Add to emails (keep only the most recent maxEmails)
    setEmails((prev) => {
      const newEmails = [...prev, newEmail];
      if (newEmails.length > maxEmails) {
        return newEmails.slice(newEmails.length - maxEmails);
      }
      return newEmails;
    });
  }, [isPaused]);

  // Toggle pause state
  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  // Process emails at the specified rate
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      for (let i = 0; i < processingRate; i++) {
        processEmail();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, processingRate, processEmail]);

  return {
    emails,
    stats,
    processingRate,
    setProcessingRate,
    isPaused,
    togglePause,
  };
}
