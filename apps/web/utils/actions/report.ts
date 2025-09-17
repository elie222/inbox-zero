"use server";

import type { gmail_v1 } from "@googleapis/gmail";
import { z } from "zod";
import {
  fetchEmailsForReport,
  fetchGmailTemplates,
} from "@/utils/ai/report/fetch";
import { aiSummarizeEmails } from "@/utils/ai/report/summarize-emails";
import { aiGenerateExecutiveSummary } from "@/utils/ai/report/generate-executive-summary";
import { aiBuildUserPersona } from "@/utils/ai/report/build-user-persona";
import { aiAnalyzeEmailBehavior } from "@/utils/ai/report/analyze-email-behavior";
import { aiAnalyzeResponsePatterns } from "@/utils/ai/report/response-patterns";
import { aiAnalyzeLabelOptimization } from "@/utils/ai/report/analyze-label-optimization";
import { aiGenerateActionableRecommendations } from "@/utils/ai/report/generate-actionable-recommendations";
import { actionClient } from "@/utils/actions/safe-action";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { getGmailClientForEmail } from "@/utils/account";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { Logger } from "@/utils/logger";

export type EmailReportData = Awaited<ReturnType<typeof getEmailReportData>>;

export const generateReportAction = actionClient
  .metadata({ name: "generateReport" })
  .schema(z.object({}))
  .action(async ({ ctx: { emailAccountId, logger } }) => {
    return getEmailReportData({ emailAccountId, logger });
  });

async function getEmailReportData({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  logger.info("getEmailReportData started");

  const emailAccount = await getEmailAccountWithAi({ emailAccountId });

  if (!emailAccount) {
    logger.error("Email account not found");
    throw new Error("Email account not found");
  }

  const { receivedEmails, sentEmails, totalReceived, totalSent } =
    await fetchEmailsForReport({ emailAccount });

  const [receivedSummaries, sentSummaries] = await Promise.all([
    aiSummarizeEmails(
      receivedEmails.map((message) =>
        getEmailForLLM(message, { maxLength: 1000 }),
      ),
      emailAccount,
    ).catch((error) => {
      logger.error("Error summarizing received emails", { error });
      return [];
    }),
    aiSummarizeEmails(
      sentEmails.map((message) => getEmailForLLM(message, { maxLength: 1000 })),
      emailAccount,
    ).catch((error) => {
      logger.error("Error summarizing sent emails", { error });
      return [];
    }),
  ]);

  const gmail = await getGmailClientForEmail({
    emailAccountId: emailAccount.id,
  });

  const gmailLabels = await fetchGmailLabels(gmail, logger);
  const gmailSignature = await fetchGmailSignature(gmail, logger);
  const gmailTemplates = await fetchGmailTemplates(gmail);

  const [
    executiveSummary,
    userPersona,
    emailBehavior,
    responsePatterns,
    labelAnalysis,
  ] = await Promise.all([
    aiGenerateExecutiveSummary(
      receivedSummaries,
      sentSummaries,
      gmailLabels,
      emailAccount,
    ).catch((error) => {
      logger.error("Error generating executive summary", { error });
    }),
    aiBuildUserPersona(
      receivedSummaries,
      emailAccount,
      sentSummaries,
      gmailSignature,
      gmailTemplates,
    ).catch((error) => {
      logger.error("Error generating user persona", { error });
    }),
    aiAnalyzeEmailBehavior(
      receivedSummaries,
      emailAccount,
      sentSummaries,
    ).catch((error) => {
      logger.error("Error generating email behavior", { error });
    }),
    aiAnalyzeResponsePatterns(
      receivedSummaries,
      emailAccount,
      sentSummaries,
    ).catch((error) => {
      logger.error("Error generating response patterns", { error });
    }),
    aiAnalyzeLabelOptimization(
      receivedSummaries,
      emailAccount,
      gmailLabels,
    ).catch((error) => {
      logger.error("Error generating label optimization", { error });
    }),
  ]);

  const actionableRecommendations = userPersona
    ? await aiGenerateActionableRecommendations(
        receivedSummaries,
        emailAccount,
        userPersona,
      ).catch((error) => {
        logger.error("Error generating actionable recommendations", { error });
      })
    : null;

  return {
    executiveSummary,
    emailActivityOverview: {
      dataSources: {
        inbox: totalReceived,
        archived: 0,
        trash: 0,
        sent: totalSent,
      },
    },
    userPersona,
    emailBehavior,
    responsePatterns,
    labelAnalysis: {
      currentLabels: gmailLabels.map((label) => ({
        name: label.name,
        emailCount: label.messagesTotal || 0,
        unreadCount: label.messagesUnread || 0,
        threadCount: label.threadsTotal || 0,
        unreadThreads: label.threadsUnread || 0,
        color: label.color || null,
        type: label.type,
      })),
      optimizationSuggestions: labelAnalysis?.optimizationSuggestions || [],
    },
    actionableRecommendations,
  };
}

// TODO: should be able to import this functionality from elsewhere
async function fetchGmailLabels(
  gmail: gmail_v1.Gmail,
  logger: Logger,
): Promise<gmail_v1.Schema$Label[]> {
  try {
    const response = await gmail.users.labels.list({ userId: "me" });

    const userLabels =
      response.data.labels?.filter(
        (label: gmail_v1.Schema$Label) =>
          label.type === "user" &&
          label.name &&
          !label.name.startsWith("CATEGORY_") &&
          !label.name.startsWith("CHAT"),
      ) || [];

    const labelsWithCounts = await Promise.all(
      userLabels
        .filter(
          (
            label,
          ): label is gmail_v1.Schema$Label & { id: string; name: string } =>
            Boolean(label.id && label.name),
        )
        .map(async (label) => {
          try {
            const labelDetail = await gmail.users.labels.get({
              userId: "me",
              id: label.id,
            });
            return {
              ...label,
              messagesTotal: labelDetail.data.messagesTotal || 0,
              messagesUnread: labelDetail.data.messagesUnread || 0,
              threadsTotal: labelDetail.data.threadsTotal || 0,
              threadsUnread: labelDetail.data.threadsUnread || 0,
            };
          } catch (error) {
            logger.warn("Failed to get details for label", {
              labelName: label.name,
              error: error instanceof Error ? error.message : String(error),
            });
            return {
              ...label,
              messagesTotal: 0,
              messagesUnread: 0,
              threadsTotal: 0,
              threadsUnread: 0,
            };
          }
        }),
    );

    const sortedLabels = labelsWithCounts.sort(
      (a, b) => (b.messagesTotal || 0) - (a.messagesTotal || 0),
    );

    return sortedLabels;
  } catch (error) {
    logger.warn("Failed to fetch Gmail labels", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// TODO: should be able to import this functionality from elsewhere
async function fetchGmailSignature(
  gmail: gmail_v1.Gmail,
  logger: Logger,
): Promise<string> {
  try {
    const sendAsList = await gmail.users.settings.sendAs.list({
      userId: "me",
    });

    if (!sendAsList.data.sendAs || sendAsList.data.sendAs.length === 0) {
      logger.warn("No sendAs settings found");
      return "";
    }

    const primarySendAs = sendAsList.data.sendAs[0];
    if (!primarySendAs.sendAsEmail) {
      logger.warn("No primary sendAs email found");
      return "";
    }

    const signatureResponse = await gmail.users.settings.sendAs.get({
      userId: "me",
      sendAsEmail: primarySendAs.sendAsEmail,
    });

    const signature = signatureResponse.data.signature;
    logger.info("Gmail signature fetched successfully", {
      hasSignature: !!signature,
      sendAsEmail: primarySendAs.sendAsEmail,
    });

    return signature || "";
  } catch (error) {
    logger.warn("Failed to fetch Gmail signature", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}
