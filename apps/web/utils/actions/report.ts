"use server";

import {
  fetchEmailsForReport,
  fetchGmailTemplates,
} from "@/utils/ai/report/fetch";
import {
  generateExecutiveSummary,
  buildUserPersona,
  analyzeEmailBehavior,
  analyzeResponsePatterns,
  analyzeLabelOptimization,
  generateActionableRecommendations,
  summarizeEmails,
} from "@/utils/ai/report/prompts";
import type { gmail_v1 } from "@googleapis/gmail";
import { createScopedLogger } from "@/utils/logger";
import { actionClient } from "@/utils/actions/safe-action";
import { z } from "zod";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { getGmailClientForEmail } from "@/utils/account";

const logger = createScopedLogger("actions/report");

export type EmailReportData = Awaited<ReturnType<typeof getEmailReportData>>;

export const generateReportAction = actionClient
  .metadata({ name: "generateReport" })
  .schema(z.object({}))
  .action(async ({ ctx: { emailAccountId } }) => {
    return getEmailReportData({ emailAccountId });
  });

async function fetchGmailLabels(
  gmail: gmail_v1.Gmail,
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
            logger.warn(`Failed to get details for label ${label.name}:`, {
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
    logger.warn("Failed to fetch Gmail labels:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function fetchGmailSignature(gmail: gmail_v1.Gmail): Promise<string> {
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
    logger.warn("Failed to fetch Gmail signature:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}

async function getEmailReportData({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  logger.info("getEmailReportData started", { emailAccountId });

  const emailAccount = await getEmailAccountWithAi({ emailAccountId });

  if (!emailAccount) {
    logger.error("Email account not found", { emailAccountId });
    throw new Error("Email account not found");
  }

  const emailData = await fetchEmailsForReport({ emailAccount });

  const { receivedEmails, sentEmails, totalReceived, totalSent } = emailData;

  const receivedSummaries = await summarizeEmails(receivedEmails, emailAccount);
  const sentSummaries = await summarizeEmails(sentEmails, emailAccount);

  const gmail = await getGmailClientForEmail({
    emailAccountId: emailAccount.id,
  });

  const gmailLabels = await fetchGmailLabels(gmail);
  const gmailSignature = await fetchGmailSignature(gmail);
  const gmailTemplates = await fetchGmailTemplates(gmail);

  const executiveSummary = await generateExecutiveSummary(
    receivedSummaries,
    sentSummaries,
    gmailLabels,
    emailAccount,
  );

  const userPersona = await buildUserPersona(
    receivedSummaries,
    emailAccount,
    sentSummaries,
    gmailSignature,
    gmailTemplates,
  );

  const emailBehavior = await analyzeEmailBehavior(
    receivedSummaries,
    emailAccount,
    sentSummaries,
  );

  const responsePatterns = await analyzeResponsePatterns(
    receivedSummaries,
    emailAccount,
    sentSummaries,
  );

  const labelAnalysis = await analyzeLabelOptimization(
    receivedSummaries,
    emailAccount,
    gmailLabels,
  );

  const actionableRecommendations = await generateActionableRecommendations(
    receivedSummaries,
    emailAccount,
    userPersona,
  );

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
      optimizationSuggestions: labelAnalysis.optimizationSuggestions,
    },
    actionableRecommendations,
  };
}
