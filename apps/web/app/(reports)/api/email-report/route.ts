import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import { fetchEmailsForReport, fetchGmailTemplates } from "./fetch";
import type { ParsedMessage } from "@/utils/types";
import prisma from "@/utils/prisma";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";

import {
  generateExecutiveSummary,
  buildUserPersona,
  analyzeEmailBehavior,
  analyzeResponsePatterns,
  analyzeLabelOptimization,
  generateActionableRecommendations,
  summarizeEmails,
} from "./prompts";
import type { EmailSummary } from "./schemas";
import type { gmail_v1 } from "@googleapis/gmail";
import type { EmailAccount, User, Account } from "@prisma/client";

const logger = createScopedLogger("email-report-api");

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId, email } = request.auth;

  try {
    const result = await getEmailReportData({
      emailAccountId,
      userEmail: email,
    });
    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error("Error generating email report", {
      error: errorMessage,
      stack: errorStack,
      emailAccountId,
    });

    return NextResponse.json(
      {
        error: "Failed to generate email report",
        details: errorMessage,
        emailAccountId,
      },
      { status: 500 },
    );
  }
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
  userEmail,
}: {
  emailAccountId: string;
  userEmail: string;
}) {
  logger.info("getEmailReportData started", {
    emailAccountId,
    userEmail,
  });
  let emailData: {
    receivedEmails: ParsedMessage[];
    sentEmails: ParsedMessage[];
    totalReceived: number;
    totalSent: number;
  } | null = null;

  let emailAccount:
    | (EmailAccount & {
        account: Account;
        user: Pick<User, "email" | "aiProvider" | "aiModel" | "aiApiKey">;
      })
    | null;
  try {
    emailAccount = await prisma.emailAccount.findFirst({
      where: { user: { email: userEmail } },
      include: {
        account: true,
        user: {
          select: {
            email: true,
            aiProvider: true,
            aiModel: true,
            aiApiKey: true,
          },
        },
      },
    });

    if (!emailAccount) {
      throw new Error("Email account not found");
    }
  } catch (error) {
    logger.error("Failed to fetch email account", {
      error: error instanceof Error ? error.message : String(error),
      userEmail,
      emailAccountId,
    });
    throw new Error(
      `Failed to fetch email account: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    logger.info("getEmailReportData: about to call fetchEmailsForReport", {
      emailAccountId: emailAccount.id,
      userEmail: emailAccount.user?.email,
    });

    emailData = await fetchEmailsForReport({
      emailAccount,
    });

    logger.info(
      "getEmailReportData: fetchEmailsForReport completed successfully",
      {
        receivedCount: emailData.totalReceived,
        sentCount: emailData.totalSent,
      },
    );
  } catch (error) {
    logger.error("Failed to fetch emails for report", {
      error: error instanceof Error ? error.message : String(error),
      emailAccountId,
      userEmail,
    });
    throw new Error(
      `Failed to fetch emails: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const { receivedEmails, sentEmails, totalReceived, totalSent } = emailData;

  let receivedEmailSummaries: EmailSummary[] = [];
  let sentEmailSummaries: EmailSummary[] = [];

  try {
    logger.info("Starting email summarization", {
      receivedEmailsCount: receivedEmails.length,
      sentEmailsCount: sentEmails.length,
    });

    logger.info("About to call summarizeEmails for received emails", {
      receivedEmailsCount: receivedEmails.length,
      firstEmailId: receivedEmails[0]?.id,
      lastEmailId: receivedEmails[receivedEmails.length - 1]?.id,
    });

    const receivedSummaries = await summarizeEmails(
      receivedEmails,
      userEmail,
      emailAccount,
    );

    logger.info("Received email summaries completed", {
      summariesCount: receivedSummaries.length,
    });

    logger.info("About to call summarizeEmails for sent emails", {
      sentEmailsCount: sentEmails.length,
      firstEmailId: sentEmails[0]?.id,
      lastEmailId: sentEmails[sentEmails.length - 1]?.id,
    });

    const sentSummaries = await summarizeEmails(
      sentEmails,
      userEmail,
      emailAccount,
    );

    logger.info("Sent email summaries completed", {
      summariesCount: sentSummaries.length,
    });

    receivedEmailSummaries = receivedSummaries;
    sentEmailSummaries = sentSummaries;
  } catch (error) {
    logger.error("Failed to generate email summaries", {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorStack: error instanceof Error ? error.stack : undefined,
      emailAccountId,
      userEmail,
    });
    throw new Error(
      `Failed to generate email summaries: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (
    !emailAccount?.account?.access_token ||
    !emailAccount?.account?.refresh_token
  ) {
    throw new Error("Missing Gmail tokens");
  }

  const gmail = await getGmailClientWithRefresh({
    accessToken: emailAccount.account.access_token,
    refreshToken: emailAccount.account.refresh_token,
    expiresAt: emailAccount.account.expires_at,
    emailAccountId: emailAccount.id,
  });

  const gmailLabels = await fetchGmailLabels(gmail);
  const gmailSignature = await fetchGmailSignature(gmail);
  const gmailTemplates = await fetchGmailTemplates(gmail);

  let executiveSummary: any,
    userPersona: any,
    emailBehavior: any,
    responsePatterns: any,
    labelAnalysis: any,
    actionableRecommendations: any;

  try {
    executiveSummary = await generateExecutiveSummary(
      receivedEmailSummaries,
      sentEmailSummaries,
      gmailLabels,
      userEmail,
      emailAccount,
    );
  } catch (error) {
    logger.error("Failed to generate executive summary", {
      error: error instanceof Error ? error.message : String(error),
      emailAccountId,
    });
    throw new Error(
      `Failed to generate executive summary: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    userPersona = await buildUserPersona(
      receivedEmailSummaries,
      userEmail,
      emailAccount,
      sentEmailSummaries,
      gmailSignature,
      gmailTemplates,
    );
  } catch (error) {
    logger.error("Failed to build user persona", {
      error: error instanceof Error ? error.message : String(error),
      emailAccountId,
    });
    throw new Error(
      `Failed to build user persona: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    emailBehavior = await analyzeEmailBehavior(
      receivedEmailSummaries,
      userEmail,
      emailAccount,
      sentEmailSummaries,
    );
  } catch (error) {
    logger.error("Failed to analyze email behavior", {
      error: error instanceof Error ? error.message : String(error),
      emailAccountId,
    });
    throw new Error(
      `Failed to analyze email behavior: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    responsePatterns = await analyzeResponsePatterns(
      receivedEmailSummaries,
      userEmail,
      emailAccount,
      sentEmailSummaries,
    );
  } catch (error) {
    logger.error("Failed to analyze response patterns", {
      error: error instanceof Error ? error.message : String(error),
      emailAccountId,
    });
    throw new Error(
      `Failed to analyze response patterns: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    labelAnalysis = await analyzeLabelOptimization(
      receivedEmailSummaries,
      userEmail,
      emailAccount,
      gmailLabels,
    );
  } catch (error) {
    logger.error("Failed to analyze label optimization", {
      error: error instanceof Error ? error.message : String(error),
      emailAccountId,
    });
    throw new Error(
      `Failed to analyze label optimization: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    actionableRecommendations = await generateActionableRecommendations(
      receivedEmailSummaries,
      userEmail,
      emailAccount,
      userPersona,
      emailBehavior,
    );
  } catch (error) {
    logger.error("Failed to generate actionable recommendations", {
      error: error instanceof Error ? error.message : String(error),
      emailAccountId,
    });
    throw new Error(
      `Failed to generate actionable recommendations: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

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
