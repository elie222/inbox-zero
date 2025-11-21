import { createScopedLogger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { sleep } from "@/utils/sleep";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";

const logger = createScopedLogger("email-report-fetch");

export async function fetchEmailsForReport({
  emailAccount,
}: {
  emailAccount: EmailAccountWithAI;
}) {
  logger.info("fetchEmailsForReport started", {
    emailAccountId: emailAccount.id,
  });

  const emailProvider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: emailAccount.account.provider,
  });

  const receivedEmails = await fetchReceivedEmails(emailProvider, 200);
  await sleep(3000);
  const sentEmails = await fetchSentEmails(emailProvider, 50);

  logger.info("fetchEmailsForReport: preparing return result", {
    receivedCount: receivedEmails.length,
    sentCount: sentEmails.length,
  });

  return {
    receivedEmails,
    sentEmails,
    totalReceived: receivedEmails.length,
    totalSent: sentEmails.length,
  };
}

async function fetchReceivedEmails(
  emailProvider: EmailProvider,
  targetCount: number,
): Promise<ParsedMessage[]> {
  const emails: ParsedMessage[] = [];

  // Fetch from different sources in priority order
  const sources = [
    { name: "inbox", type: "inbox" as const },
    {
      name: "archived",
      type: "all" as const,
      excludeInbox: true,
      excludeSent: true,
    },
  ];

  for (const source of sources) {
    if (emails.length >= targetCount) break;

    try {
      const response = await emailProvider.getMessagesByFields({
        type: source.type,
        excludeInbox: source.excludeInbox,
        excludeSent: source.excludeSent,
        maxResults: targetCount - emails.length,
      });

      emails.push(...response.messages);

      logger.info("Fetched emails", {
        sourceName: source.name,
        count: response.messages.length,
        totalSoFar: emails.length,
        targetCount,
      });
    } catch (error) {
      logger.error("Error fetching emails", {
        sourceName: source.name,
        error,
        sourceConfig: source,
      });
    }
  }

  return emails;
}

async function fetchSentEmails(
  emailProvider: EmailProvider,
  targetCount: number,
): Promise<ParsedMessage[]> {
  try {
    const response = await emailProvider.getMessagesByFields({
      type: "sent",
      maxResults: targetCount,
    });

    return response.messages;
  } catch (error) {
    logger.error("Error fetching sent emails", { error });
    return [];
  }
}

export async function fetchEmailTemplates(
  emailProvider: EmailProvider,
): Promise<string[]> {
  try {
    const drafts = await emailProvider.getDrafts({ maxResults: 50 });

    const templates: string[] = [];

    for (const draft of drafts) {
      try {
        if (draft.textPlain?.trim()) {
          templates.push(draft.textPlain.trim());
        }

        if (templates.length >= 10) break;
      } catch (error) {
        logger.warn("Failed to process draft:", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return templates;
  } catch (error) {
    logger.warn("Failed to fetch email templates:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
