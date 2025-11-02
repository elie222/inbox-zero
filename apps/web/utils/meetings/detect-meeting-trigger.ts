import type { Logger } from "@/utils/logger";

// Logger is optional to avoid env validation issues in tests
function getLogger(): Logger | null {
  try {
    // Lazy-load logger to avoid env validation issues in tests
    const { createScopedLogger } = require("@/utils/logger");
    return createScopedLogger("meetings/detect-trigger");
  } catch {
    // In test environment or if logger not available, return null
    return null;
  }
}

export interface MeetingTriggerDetection {
  isTriggered: boolean;
  triggerType: "schedule_subject" | "schedule_command" | null;
  isSentEmail: boolean;
}

/**
 * Detects if an email should trigger meeting scheduling
 *
 * Trigger patterns:
 * 1. Subject contains "Schedule:" (case-insensitive)
 * 2. Body contains "/schedule meeting" (case-insensitive)
 *
 * Both patterns work for:
 * - Emails to yourself
 * - Sent emails (outgoing messages)
 */
export function detectMeetingTrigger({
  subject,
  textBody,
  htmlBody,
  fromEmail,
  userEmail,
  isSent,
}: {
  subject: string | null | undefined;
  textBody: string | null | undefined;
  htmlBody: string | null | undefined;
  fromEmail: string;
  userEmail: string;
  isSent?: boolean;
}): MeetingTriggerDetection {
  // Normalize email addresses for comparison
  const normalizedFrom = fromEmail.toLowerCase().trim();
  const normalizedUser = userEmail.toLowerCase().trim();

  // Determine if this is a sent email or an email to yourself
  const isSentEmail = isSent === true;
  const isEmailToSelf = normalizedFrom === normalizedUser;

  // Only trigger for sent emails or emails to yourself
  if (!isSentEmail && !isEmailToSelf) {
    return {
      isTriggered: false,
      triggerType: null,
      isSentEmail: false,
    };
  }

  // Check for "Schedule:" in subject (case-insensitive)
  const hasScheduleInSubject = subject ? /schedule:/i.test(subject) : false;

  if (hasScheduleInSubject) {
    getLogger()?.info("Meeting trigger detected in subject", {
      subject,
      triggerType: "schedule_subject",
      isSentEmail,
    });

    return {
      isTriggered: true,
      triggerType: "schedule_subject",
      isSentEmail,
    };
  }

  // Check for "/schedule meeting" in body (case-insensitive)
  const scheduleCommandPattern = /\/schedule\s+meeting/i;

  const hasScheduleInTextBody = textBody
    ? scheduleCommandPattern.test(textBody)
    : false;

  const hasScheduleInHtmlBody = htmlBody
    ? scheduleCommandPattern.test(htmlBody)
    : false;

  const hasScheduleCommand = hasScheduleInTextBody || hasScheduleInHtmlBody;

  if (hasScheduleCommand) {
    getLogger()?.info("Meeting trigger detected in body", {
      subject,
      triggerType: "schedule_command",
      isSentEmail,
      foundInText: hasScheduleInTextBody,
      foundInHtml: hasScheduleInHtmlBody,
    });

    return {
      isTriggered: true,
      triggerType: "schedule_command",
      isSentEmail,
    };
  }

  // No trigger detected
  return {
    isTriggered: false,
    triggerType: null,
    isSentEmail,
  };
}

/**
 * Extract email body text from HTML
 * This is a simple implementation - may need enhancement for complex HTML
 */
export function extractTextFromHtml(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}
