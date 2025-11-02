import prisma from "@/utils/prisma";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import { categorizeSender } from "@/utils/categorize/senders/categorize";
import { markMessageAsProcessing } from "@/utils/redis/message-processing";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { processAssistantEmail } from "@/utils/assistant/process-assistant-email";
import { handleOutboundMessage } from "@/utils/reply-tracker/handle-outbound";
import { type EmailAccount, NewsletterStatus } from "@prisma/client";
import { extractEmailAddress } from "@/utils/email";
import { isIgnoredSender } from "@/utils/filter-ignored-senders";
import type { EmailProvider } from "@/utils/email/types";
import type { RuleWithActions } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import { detectMeetingTrigger } from "@/utils/meetings/detect-meeting-trigger";
import { aiParseMeetingRequest } from "@/utils/meetings/parse-meeting-request";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { findMeetingAvailability } from "@/utils/meetings/find-availability";
import { createMeetingLink } from "@/utils/meetings/create-meeting-link";
import { createCalendarEvent } from "@/utils/meetings/create-calendar-event";

export type SharedProcessHistoryOptions = {
  provider: EmailProvider;
  rules: RuleWithActions[];
  hasAutomationRules: boolean;
  hasAiAccess: boolean;
  emailAccount: EmailAccountWithAI &
    Pick<EmailAccount, "autoCategorizeSenders">;
  logger: Logger;
};

export async function processHistoryItem(
  {
    messageId,
    threadId,
  }: {
    messageId: string;
    threadId?: string;
  },
  options: SharedProcessHistoryOptions,
) {
  const {
    provider,
    emailAccount,
    hasAutomationRules,
    hasAiAccess,
    rules,
    logger,
  } = options;

  const emailAccountId = emailAccount.id;
  const userEmail = emailAccount.email;

  const isFree = await markMessageAsProcessing({ userEmail, messageId });

  if (!isFree) {
    logger.info("Skipping. Message already being processed.");
    return;
  }

  logger.info("Getting message");

  try {
    const [parsedMessage, hasExistingRule] = await Promise.all([
      provider.getMessage(messageId),
      threadId
        ? prisma.executedRule.findFirst({
            where: {
              emailAccountId,
              threadId,
              messageId,
            },
            select: { id: true },
          })
        : null,
    ]);

    // Get threadId from message if not provided
    const actualThreadId = threadId || parsedMessage.threadId;

    // Re-check with actual threadId if we didn't have it initially
    const finalHasExistingRule =
      hasExistingRule !== null
        ? hasExistingRule
        : actualThreadId
          ? await prisma.executedRule.findFirst({
              where: {
                emailAccountId,
                threadId: actualThreadId,
                messageId,
              },
              select: { id: true },
            })
          : null;

    // if the rule has already been executed, skip
    if (finalHasExistingRule) {
      logger.info("Skipping. Rule already exists.");
      return;
    }

    if (isIgnoredSender(parsedMessage.headers.from)) {
      logger.info("Skipping. Ignored sender.");
      return;
    }

    // Skip messages that are not in inbox or sent items folders
    // We want to process inbox messages (for rules/automation) and sent messages (for reply tracking)
    const isInInbox = parsedMessage.labelIds?.includes("INBOX") || false;
    const isInSentItems = parsedMessage.labelIds?.includes("SENT") || false;

    if (!isInInbox && !isInSentItems) {
      logger.info("Skipping message not in inbox or sent items");
      return;
    }

    const isForAssistant = isAssistantEmail({
      userEmail,
      emailToCheck: parsedMessage.headers.to,
    });

    if (isForAssistant) {
      logger.info("Passing through assistant email.");
      return processAssistantEmail({
        message: parsedMessage,
        emailAccountId,
        userEmail,
        provider,
      });
    }

    const isFromAssistant = isAssistantEmail({
      userEmail,
      emailToCheck: parsedMessage.headers.from,
    });

    if (isFromAssistant) {
      logger.info("Skipping. Assistant email.");
      return;
    }

    const isOutbound = provider.isSentMessage(parsedMessage);

    // Check for meeting triggers (works for both sent messages and emails to yourself)
    const meetingTrigger = detectMeetingTrigger({
      subject: parsedMessage.headers.subject,
      textBody: parsedMessage.textPlain,
      htmlBody: parsedMessage.textHtml,
      fromEmail: extractEmailAddress(parsedMessage.headers.from),
      userEmail,
      isSent: isOutbound,
    });

    if (meetingTrigger.isTriggered) {
      logger.info("Meeting trigger detected", {
        triggerType: meetingTrigger.triggerType,
        isSentEmail: meetingTrigger.isSentEmail,
      });

      // Parse meeting request details using AI
      try {
        const emailForLLM = getEmailForLLM(parsedMessage);
        const meetingDetails = await aiParseMeetingRequest({
          email: emailForLLM,
          emailAccount,
          userEmail,
        });

        logger.info("Meeting request parsed", {
          attendeeCount: meetingDetails.attendees.length,
          title: meetingDetails.title,
          provider: meetingDetails.preferredProvider,
          isUrgent: meetingDetails.isUrgent,
        });

        // Check availability across all calendars
        const availability = await findMeetingAvailability({
          emailAccountId,
          meetingRequest: meetingDetails,
        });

        logger.info("Meeting availability checked", {
          timezone: availability.timezone,
          requestedSlotsCount: availability.requestedTimes.length,
          suggestedSlotsCount: availability.suggestedTimes.length,
          hasConflicts: availability.hasConflicts,
        });

        // Select time slot - prefer requested times, fall back to suggestions
        const timeSlot =
          availability.requestedTimes[0] || availability.suggestedTimes[0];

        if (!timeSlot) {
          logger.warn("No available time slots found for meeting");
        } else {
          // Generate meeting link (Phase 4)
          try {
            const meetingLink = await createMeetingLink({
              emailAccountId,
              subject: meetingDetails.title,
              startDateTime: timeSlot.start,
              endDateTime: timeSlot.endISO,
              preferredProvider: meetingDetails.preferredProvider,
            });

            logger.info("Meeting link created", {
              provider: meetingLink.provider,
              joinUrl: meetingLink.joinUrl,
              startTime: timeSlot.startISO,
              endTime: timeSlot.endISO,
            });

            // Create calendar event (Phase 5)
            try {
              const calendarEvent = await createCalendarEvent({
                emailAccountId,
                meetingDetails,
                startDateTime: timeSlot.start,
                endDateTime: timeSlot.endISO,
                meetingLink,
                timezone: availability.timezone,
              });

              logger.info("Calendar event created", {
                eventId: calendarEvent.eventId,
                eventUrl: calendarEvent.eventUrl,
                provider: calendarEvent.provider,
              });

              // TODO: Phase 6 implementation
              // - Send confirmation email to attendees
            } catch (calendarError) {
              logger.error("Failed to create calendar event", {
                error: calendarError,
              });
            }
          } catch (error) {
            logger.error("Failed to create meeting link", { error });
          }
        }
      } catch (error) {
        logger.error("Error parsing meeting request", { error });
      }
    }

    if (isOutbound) {
      await handleOutboundMessage({
        emailAccount,
        message: parsedMessage,
        provider,
      });
      return;
    }

    // check if unsubscribed
    const email = extractEmailAddress(parsedMessage.headers.from);
    const sender = await prisma.newsletter.findFirst({
      where: {
        emailAccountId,
        email,
        status: NewsletterStatus.UNSUBSCRIBED,
      },
    });

    if (sender) {
      await provider.blockUnsubscribedEmail(messageId);
      logger.info("Skipping. Blocked unsubscribed email.", { from: email });
      return;
    }

    if (!hasAiAccess) {
      logger.info("Skipping. No AI access.");
      return;
    }

    // categorize a sender if we haven't already
    // this is used for category filters in ai rules
    if (emailAccount.autoCategorizeSenders) {
      const sender = extractEmailAddress(parsedMessage.headers.from);
      const existingSender = await prisma.newsletter.findUnique({
        where: {
          email_emailAccountId: { email: sender, emailAccountId },
        },
        select: { category: true },
      });
      if (!existingSender?.category) {
        await categorizeSender(sender, emailAccount, provider);
      }
    }

    if (hasAutomationRules && hasAiAccess) {
      logger.info("Running rules...");

      await runRules({
        provider,
        message: parsedMessage,
        rules,
        emailAccount,
        isTest: false,
        modelType: "default",
      });
    }
  } catch (error: unknown) {
    // Handle provider-specific "not found" errors
    if (error instanceof Error) {
      const isGoogleNotFound =
        error.message === "Requested entity was not found.";
      const isOutlookNotFound =
        error.message.includes("ItemNotFound") ||
        error.message.includes("ResourceNotFound");

      if (isGoogleNotFound || isOutlookNotFound) {
        logger.info("Message not found");
        return;
      }
    }

    throw error;
  }
}
