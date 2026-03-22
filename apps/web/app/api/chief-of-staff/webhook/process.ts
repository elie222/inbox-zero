import prisma from "@/utils/prisma";
import type { CosFilterReason } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { getCalendarClientWithRefresh } from "@/utils/calendar/client";
import { getHistory } from "@/utils/gmail/history";
import { getMessage, parseMessage } from "@/utils/gmail/message";
import { preFilter } from "@/utils/chief-of-staff/pre-filter";
import { processEmailWithClaude } from "@/utils/chief-of-staff/engine";
import { detectVenture } from "@/utils/chief-of-staff/routing/venture-detector";
import {
  getVoiceToneProfile,
  formatVoiceToneForPrompt,
} from "@/utils/chief-of-staff/routing/voice-tone";
import { postToChiefOfStaff } from "@/utils/chief-of-staff/slack/poster";
import {
  buildApprovalMessage,
  buildAutoHandleMessage,
  buildFlagOnlyMessage,
} from "@/utils/chief-of-staff/slack/blocks";
import {
  parseShippingEmail,
  buildShippingCalendarEvent,
} from "@/utils/chief-of-staff/shipping";
import {
  PreFilterResult,
  AutonomyMode,
  type EmailMetadata,
  type CosCategory,
  DEFAULT_AUTONOMY_LEVELS,
} from "@/utils/chief-of-staff/types";
import type { gmail_v1 } from "@googleapis/gmail";

const logger = createScopedLogger("chief-of-staff/webhook");

// ---------------------------------------------------------------------------
// Pub/Sub entry point
// ---------------------------------------------------------------------------

export async function processChiefOfStaffWebhook(decoded: {
  emailAddress: string;
  historyId: number;
}) {
  const { emailAddress, historyId } = decoded;
  const email = emailAddress.toLowerCase();

  const log = logger.with({ email, historyId });

  try {
    // 1. Find email account with all required relations
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { email },
      include: {
        chiefOfStaffConfig: true,
        autonomyLevels: true,
        account: {
          select: {
            access_token: true,
            refresh_token: true,
            expires_at: true,
          },
        },
        messagingChannels: {
          where: { provider: "SLACK", isConnected: true },
          take: 1,
        },
        calendarConnections: {
          where: { provider: "google", isConnected: true },
          take: 1,
        },
      },
    });

    // 2. Check if COS is enabled
    if (!emailAccount?.chiefOfStaffConfig?.enabled) {
      log.info("Chief of Staff not enabled for account, skipping");
      return;
    }

    if (
      !emailAccount.account?.access_token ||
      !emailAccount.account?.refresh_token
    ) {
      log.error("Missing OAuth tokens");
      return;
    }

    const accessToken = emailAccount.account.access_token;
    const refreshToken = emailAccount.account.refresh_token;
    const expiresAt = emailAccount.account.expires_at
      ? emailAccount.account.expires_at.getTime()
      : null;

    // 3. Get Gmail client
    const gmail = await getGmailClientWithRefresh({
      accessToken,
      refreshToken,
      expiresAt,
      emailAccountId: emailAccount.id,
      logger: log,
    });

    // 4. Fetch history
    const startHistoryId =
      emailAccount.lastSyncedHistoryId ?? historyId.toString();
    let historyData: Awaited<ReturnType<typeof getHistory>>;
    try {
      historyData = await getHistory(gmail, {
        startHistoryId,
        historyTypes: ["messageAdded"],
        maxResults: 100,
      });
    } catch (err) {
      log.error("Failed to fetch Gmail history", { err });
      return;
    }

    const historyEntries = historyData.history ?? [];
    if (historyEntries.length === 0) {
      log.info("No new history entries");
      return;
    }

    // Collect all newly-added message IDs, deduplicated
    const messageIds = new Set<string>();
    for (const h of historyEntries) {
      for (const added of h.messagesAdded ?? []) {
        const id = added.message?.id;
        const labels = added.message?.labelIds ?? [];
        // Only inbox messages (not drafts)
        if (id && labels.includes("INBOX") && !labels.includes("DRAFT")) {
          messageIds.add(id);
        }
      }
    }

    log.info("Processing messages", { count: messageIds.size });

    // Build autonomy map from DB rows, falling back to defaults
    const autonomyLevels: Record<string, AutonomyMode> = {
      ...DEFAULT_AUTONOMY_LEVELS,
    };
    for (const level of emailAccount.autonomyLevels) {
      autonomyLevels[level.category] = level.mode as AutonomyMode;
    }

    // Slack channel info (optional — may not be connected)
    const slackChannel = emailAccount.messagingChannels[0];

    // Calendar client (optional — needed for tool use by Claude)
    const calendarConn = emailAccount.calendarConnections[0];
    let calendarClient: Awaited<
      ReturnType<typeof getCalendarClientWithRefresh>
    > | null = null;
    if (calendarConn?.refreshToken) {
      try {
        calendarClient = await getCalendarClientWithRefresh({
          accessToken: calendarConn.accessToken,
          refreshToken: calendarConn.refreshToken,
          expiresAt: calendarConn.expiresAt?.getTime() ?? null,
          emailAccountId: emailAccount.id,
          logger: log,
        });
      } catch (err) {
        log.warn("Could not build calendar client", { err });
      }
    }

    // 5. Process each message
    for (const messageId of messageIds) {
      try {
        await processOneEmail({
          messageId,
          emailAccount: {
            id: emailAccount.id,
            email: emailAccount.email,
            autonomyLevels: autonomyLevels as Record<CosCategory, AutonomyMode>,
          },
          gmail,
          calendarClient,
          slackChannel: slackChannel
            ? {
                accessToken: slackChannel.accessToken ?? "",
                channelId: slackChannel.channelId ?? "",
              }
            : null,
          allowedDomains:
            emailAccount.chiefOfStaffConfig.voiceTone &&
            typeof emailAccount.chiefOfStaffConfig.voiceTone === "object" &&
            "allowedDomains" in emailAccount.chiefOfStaffConfig.voiceTone
              ? (
                  emailAccount.chiefOfStaffConfig.voiceTone as {
                    allowedDomains?: string[];
                  }
                ).allowedDomains
              : undefined,
          blockedDomains:
            emailAccount.chiefOfStaffConfig.voiceTone &&
            typeof emailAccount.chiefOfStaffConfig.voiceTone === "object" &&
            "blockedDomains" in emailAccount.chiefOfStaffConfig.voiceTone
              ? (
                  emailAccount.chiefOfStaffConfig.voiceTone as {
                    blockedDomains?: string[];
                  }
                ).blockedDomains
              : undefined,
        });
      } catch (err) {
        log.error("Error processing message", { messageId, err });
      }
    }

    // Update lastSyncedHistoryId
    const lastEntry = historyEntries[historyEntries.length - 1];
    if (lastEntry?.id) {
      await prisma.$executeRaw`
        UPDATE "EmailAccount"
        SET "lastSyncedHistoryId" = ${lastEntry.id}, "updatedAt" = NOW()
        WHERE id = ${emailAccount.id}
        AND (
          "lastSyncedHistoryId" IS NULL
          OR CAST("lastSyncedHistoryId" AS NUMERIC) < CAST(${lastEntry.id} AS NUMERIC)
        )
      `;
    }
  } catch (err) {
    log.error("Unexpected error in processChiefOfStaffWebhook", { err });
  }
}

// ---------------------------------------------------------------------------
// Per-message processor (exported for retry jobs)
// ---------------------------------------------------------------------------

export async function processOneEmail({
  messageId,
  emailAccount,
  gmail,
  calendarClient,
  slackChannel,
  allowedDomains,
  blockedDomains,
}: {
  messageId: string;
  emailAccount: {
    id: string;
    email: string;
    autonomyLevels: Record<CosCategory, AutonomyMode>;
  };
  gmail: gmail_v1.Gmail;
  // biome-ignore lint/suspicious/noExplicitAny: Google Calendar API client type
  calendarClient: any;
  slackChannel: { accessToken: string; channelId: string } | null;
  allowedDomains?: string[];
  blockedDomains?: string[];
}) {
  const log = logger.with({ messageId, emailAccountId: emailAccount.id });

  // a. Dedup check
  const existing = await prisma.processedEmail.findUnique({
    where: { messageId },
  });
  if (existing) {
    log.info("Message already processed, skipping");
    return;
  }

  // b. Fetch full message
  const rawMessage = await getMessage(messageId, gmail, "full");
  const parsed = parseMessage(rawMessage);

  // c. Build EmailMetadata
  const emailMetadata = parseGmailToEmailMetadata(
    rawMessage,
    parsed,
    emailAccount.email,
  );

  // d. Pre-filter
  const filterResult = preFilter(
    {
      category: emailMetadata.category,
      from: emailMetadata.from,
      headers: emailMetadata.headers,
      labels: emailMetadata.labels,
      subject: emailMetadata.subject,
    },
    { allowedDomains, blockedDomains },
  );

  if (filterResult.action === PreFilterResult.SKIP) {
    log.info("Pre-filter: SKIP", { reason: filterResult.reason });
    await prisma.cosFilteredEmail.create({
      data: {
        messageId,
        emailAccountId: emailAccount.id,
        sender: emailMetadata.from,
        subject: emailMetadata.subject,
        filterReason: filterResult.reason as CosFilterReason,
      },
    });
    return;
  }

  if (filterResult.action === PreFilterResult.CREATE_CALENDAR_EVENT) {
    log.info("Pre-filter: SHIPPING — creating calendar event");
    await prisma.cosFilteredEmail.create({
      data: {
        messageId,
        emailAccountId: emailAccount.id,
        sender: emailMetadata.from,
        subject: emailMetadata.subject,
        filterReason: "shipping",
      },
    });
    // Create calendar event if we have a calendar client
    if (calendarClient) {
      try {
        const itemDescription = parseShippingEmail({
          from: emailMetadata.from,
          subject: emailMetadata.subject,
        });
        const messageLink = `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
        const calendarEvent = buildShippingCalendarEvent(
          itemDescription,
          messageLink,
        );
        await calendarClient.events.insert({
          calendarId: calendarEvent.calendarId,
          requestBody: {
            summary: calendarEvent.summary,
            description: calendarEvent.description,
            start: calendarEvent.start,
            end: calendarEvent.end,
          },
        });
        await prisma.shippingEvent.create({
          data: {
            messageId,
            emailAccountId: emailAccount.id,
            calendarEventId: "created",
            itemDescription,
          },
        });
        log.info("Shipping calendar event created", { itemDescription });
      } catch (err) {
        log.warn("Failed to create shipping calendar event", { err });
      }
    }
    return;
  }

  if (filterResult.action === PreFilterResult.BATCH_SUMMARY) {
    log.info("Pre-filter: BATCH_SUMMARY — logging and skipping");
    await prisma.cosFilteredEmail.create({
      data: {
        messageId,
        emailAccountId: emailAccount.id,
        sender: emailMetadata.from,
        subject: emailMetadata.subject,
        filterReason: "batch_summary",
      },
    });
    return;
  }

  // filterResult.action === PROCESS — continue
  log.info("Pre-filter: PROCESS");

  // e. Create ProcessedEmail record
  const processedEmail = await prisma.processedEmail.create({
    data: {
      messageId,
      threadId: emailMetadata.threadId,
      emailAccountId: emailAccount.id,
      status: "processing",
    },
  });

  try {
    // f. Detect venture
    const venture = detectVenture({
      clientGroupVenture: null, // TODO: VIP lookup can populate this
      inboxEmail: emailAccount.email,
      senderEmail: emailMetadata.from,
    });

    // g. Get voice/tone profile
    const voiceToneProfile = getVoiceToneProfile(venture);
    const voiceTone = formatVoiceToneForPrompt(voiceToneProfile);

    // h. Call Claude
    const engineResponse = await processEmailWithClaude({
      email: emailMetadata,
      venture,
      voiceTone,
      autonomyLevels: emailAccount.autonomyLevels,
      toolContext: {
        emailAccountId: emailAccount.id,
        emailAddress: emailAccount.email,
        gmail,
        calendarAuth: calendarClient,
        prisma,
      },
    });

    // i. Post to Slack based on autonomy level
    const autonomyMode =
      emailAccount.autonomyLevels[engineResponse.category] ??
      AutonomyMode.DRAFT_APPROVE;

    let slackMessageTs: string | undefined;

    if (slackChannel?.channelId && slackChannel?.accessToken) {
      if (autonomyMode === AutonomyMode.AUTO_HANDLE) {
        const blocks = buildAutoHandleMessage({
          summary: engineResponse.summary,
          actionTaken: engineResponse.actionTaken ?? "No action taken",
        });
        slackMessageTs = await postToChiefOfStaff({
          accessToken: slackChannel.accessToken,
          channelId: slackChannel.channelId,
          blocks,
          text: `Auto-handled: ${engineResponse.summary}`,
        });
      } else if (autonomyMode === AutonomyMode.FLAG_ONLY) {
        const blocks = buildFlagOnlyMessage({
          fromEmail: emailMetadata.from,
          subject: emailMetadata.subject,
          summary: engineResponse.summary,
          venture,
        });
        slackMessageTs = await postToChiefOfStaff({
          accessToken: slackChannel.accessToken,
          channelId: slackChannel.channelId,
          blocks,
          text: `Flagged: ${emailMetadata.subject}`,
        });
      } else {
        // DRAFT_APPROVE
        const blocks = buildApprovalMessage({
          response: engineResponse,
          fromEmail: emailMetadata.from,
          subject: emailMetadata.subject,
          venture,
        });
        slackMessageTs = await postToChiefOfStaff({
          accessToken: slackChannel.accessToken,
          channelId: slackChannel.channelId,
          blocks,
          text: `Approval required: ${emailMetadata.subject}`,
        });
      }
    }

    // j. Save CosPendingDraft if a draft was created and needs approval
    if (
      engineResponse.draft &&
      engineResponse.needsApproval &&
      slackMessageTs &&
      slackChannel
    ) {
      await prisma.cosPendingDraft.create({
        data: {
          slackMessageTs,
          slackChannelId: slackChannel.channelId,
          gmailDraftId: engineResponse.draft.gmailDraftId,
          gmailThreadId: engineResponse.draft.gmailThreadId,
          emailAccountId: emailAccount.id,
          toAddress: engineResponse.draft.to,
          subject: engineResponse.draft.subject,
          bodyHtml: engineResponse.draft.body,
          category: engineResponse.category,
          status: "pending",
          claudeResponse: engineResponse as object,
          processedEmailId: processedEmail.id,
        },
      });
    }

    // k. Update ProcessedEmail to completed
    await prisma.processedEmail.update({
      where: { id: processedEmail.id },
      data: {
        status: "completed",
        category: engineResponse.category,
        actionTaken: engineResponse.actionTaken,
      },
    });

    log.info("Email processed successfully", {
      category: engineResponse.category,
      autonomyMode,
      venture,
    });
  } catch (err) {
    log.error("Error during Claude processing", { err });
    await prisma.processedEmail.update({
      where: { id: processedEmail.id },
      data: {
        status: "failed",
        failedStage: "claude_processing",
      },
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helper: parse Gmail message into EmailMetadata
// ---------------------------------------------------------------------------

function parseGmailToEmailMetadata(
  rawMessage: gmail_v1.Schema$Message & {
    payload: gmail_v1.Schema$MessagePart;
  },
  parsed: ReturnType<typeof parseMessage>,
  inboxEmail: string,
): EmailMetadata {
  const headers = parsed.headers ?? {};
  const labelIds = rawMessage.labelIds ?? [];

  // Extract flat headers map (lowercase keys)
  const flatHeaders: Record<string, string> = {};
  for (const part of rawMessage.payload?.headers ?? []) {
    if (part.name && part.value) {
      flatHeaders[part.name.toLowerCase()] = part.value;
    }
  }

  const category = detectGmailCategory(labelIds);

  // Body: prefer textPlain, fall back to textHtml, then snippet
  const body = parsed.textPlain || parsed.textHtml || rawMessage.snippet || "";

  const internalDate = rawMessage.internalDate
    ? new Date(Number(rawMessage.internalDate))
    : new Date();

  return {
    messageId: rawMessage.id ?? "",
    threadId: rawMessage.threadId ?? "",
    from: headers.from ?? "",
    to: headers.to ?? inboxEmail,
    subject: headers.subject ?? parsed.subject ?? "",
    date: internalDate,
    labels: labelIds,
    category,
    headers: flatHeaders,
    snippet: rawMessage.snippet ?? "",
    body,
  };
}

function detectGmailCategory(labelIds: string[]): string | null {
  if (labelIds.includes("CATEGORY_PROMOTIONS")) return "promotions";
  if (labelIds.includes("CATEGORY_SOCIAL")) return "social";
  if (labelIds.includes("CATEGORY_FORUMS")) return "forums";
  if (labelIds.includes("CATEGORY_UPDATES")) return "updates";
  if (labelIds.includes("CATEGORY_PERSONAL")) return "personal";
  return null;
}
