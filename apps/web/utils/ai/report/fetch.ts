import type { gmail_v1 } from "@googleapis/gmail";
import { getMessages, getMessage, parseMessage } from "@/utils/gmail/message";
import { createScopedLogger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { sleep } from "@/utils/sleep";
import { getGmailClientForEmail } from "@/utils/account";

const logger = createScopedLogger("email-report-fetch");

/**
 * Fetch emails from Gmail based on query
 *
 * Uses sequential message fetching instead of batch loads to avoid Gmail API rate limits.
 * This approach fetches one message at a time with retry and backofflogic, which is slower but more
 * reliable than trying to fetch 100 messages at once.
 *
 * Not usinggetMessagesLargeBatch because it expects the messageIds
 * queryBatchMessages is limited to 20 messages at a time
 */
async function fetchEmailsByQuery(
  gmail: gmail_v1.Gmail,
  query: string,
  count: number,
): Promise<ParsedMessage[]> {
  const emails: ParsedMessage[] = [];
  let nextPageToken: string | undefined;
  let retryCount = 0;
  const maxRetries = 3;

  logger.info("fetchEmailsByQuery started", {
    query,
    targetCount: count,
    maxRetries,
  });

  while (emails.length < count && retryCount < maxRetries) {
    try {
      logger.info("fetchEmailsByQuery: calling getMessages", {
        query,
        maxResults: Math.min(100, count - emails.length),
        hasPageToken: !!nextPageToken,
        currentEmailsCount: emails.length,
        retryCount,
      });

      const response = await getMessages(gmail, {
        query: query || undefined,
        maxResults: Math.min(100, count - emails.length),
        pageToken: nextPageToken,
      });

      logger.info("fetchEmailsByQuery: getMessages response received", {
        hasMessages: !!response.messages,
        messagesCount: response.messages?.length || 0,
        hasNextPageToken: !!response.nextPageToken,
        responseKeys: Object.keys(response),
      });

      if (!response.messages || response.messages.length === 0) {
        logger.info("fetchEmailsByQuery: no messages found, breaking");
        break;
      }

      logger.info("fetchEmailsByQuery: starting to fetch individual messages", {
        messageIdsCount: response.messages?.length || 0,
        messageIds: response.messages?.map((m: any) => m.id).slice(0, 5) || [],
      });

      const messagePromises = (response.messages || []).map(
        async (message: any, index: number) => {
          if (!message.id) {
            logger.warn("fetchEmailsByQuery: message without ID", {
              index,
              message,
            });
            return null;
          }

          logger.info("fetchEmailsByQuery: fetching individual message", {
            messageId: message.id,
            index,
            totalMessages: response.messages?.length || 0,
          });

          for (let i = 0; i < 3; i++) {
            try {
              logger.info("fetchEmailsByQuery: calling getMessage", {
                messageId: message.id,
                attempt: i + 1,
                format: "full",
              });

              const messageWithPayload = await getMessage(
                message.id,
                gmail,
                "full",
              );

              logger.info("fetchEmailsByQuery: getMessage successful", {
                messageId: message.id,
                hasPayload: !!messageWithPayload,
                payloadKeys: messageWithPayload
                  ? Object.keys(messageWithPayload)
                  : [],
              });

              const parsedMessage = parseMessage(messageWithPayload);
              logger.info("fetchEmailsByQuery: message parsed successfully", {
                messageId: message.id,
                hasHeaders: !!parsedMessage.headers,
                hasTextPlain: !!parsedMessage.textPlain,
                hasTextHtml: !!parsedMessage.textHtml,
              });

              return parsedMessage;
            } catch (error) {
              logger.warn("fetchEmailsByQuery: getMessage attempt failed", {
                error,
                messageId: message.id,
                attempt: i + 1,
              });

              if (i === 2) {
                logger.warn(
                  `Failed to fetch message ${message.id} after 3 attempts:`,
                  { error },
                );
                return null;
              }
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * (i + 1)),
              );
            }
          }
          return null;
        },
      );

      logger.info("fetchEmailsByQuery: waiting for all message promises", {
        promisesCount: messagePromises.length,
      });

      const messages = await Promise.all(messagePromises);
      const validMessages = messages.filter((msg) => msg !== null);

      logger.info("fetchEmailsByQuery: message promises completed", {
        totalMessages: messages.length,
        validMessages: validMessages.length,
        nullMessages: messages.length - validMessages.length,
      });

      emails.push(...validMessages);

      nextPageToken = response.nextPageToken || undefined;
      if (!nextPageToken) {
        logger.info("fetchEmailsByQuery: no next page token, breaking");
        break;
      }

      retryCount = 0;
      logger.info("fetchEmailsByQuery: successful iteration completed", {
        currentEmailsCount: emails.length,
        targetCount: count,
        hasNextPageToken: !!nextPageToken,
      });
    } catch (error) {
      retryCount++;
      logger.error("fetchEmailsByQuery: main loop error", {
        error,
        retryCount,
        maxRetries,
        currentEmailsCount: emails.length,
        targetCount: count,
      });

      if (retryCount >= maxRetries) {
        logger.error(`Failed to fetch emails after ${maxRetries} attempts:`, {
          error,
        });
        break;
      }

      await sleep(2000 * retryCount);
    }
  }

  logger.info("fetchEmailsByQuery completed", {
    finalEmailsCount: emails.length,
    targetCount: count,
    finalRetryCount: retryCount,
  });

  return emails;
}

export interface EmailFetchResult {
  receivedEmails: ParsedMessage[];
  sentEmails: ParsedMessage[];
  totalReceived: number;
  totalSent: number;
}

export async function fetchEmailsForReport({
  emailAccount,
}: {
  emailAccount: EmailAccountWithAI;
}): Promise<EmailFetchResult> {
  logger.info("fetchEmailsForReport started", {
    emailAccountId: emailAccount.id,
  });

  const gmail = await getGmailClientForEmail({
    emailAccountId: emailAccount.id,
  });

  const receivedEmails = await fetchReceivedEmails(gmail, 200);
  await sleep(3000);
  const sentEmails = await fetchSentEmails(gmail, 50);

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
  gmail: gmail_v1.Gmail,
  targetCount: number,
): Promise<ParsedMessage[]> {
  const emails: ParsedMessage[] = [];
  const sources = [
    { name: "inbox", query: "in:inbox" },
    { name: "archived", query: "-in:inbox -in:sent -in:trash" },
    { name: "trash", query: "in:trash" },
  ];

  for (const source of sources) {
    if (emails.length >= targetCount) break;

    try {
      const sourceEmails = await fetchEmailsByQuery(
        gmail,
        source.query,
        targetCount - emails.length,
      );
      emails.push(...sourceEmails);
    } catch (error) {
      logger.error(`Error fetching emails from ${source.name}`, {
        error,
        query: source.query,
        maxResults: targetCount - emails.length,
      });
    }
  }

  return emails;
}

async function fetchSentEmails(
  gmail: gmail_v1.Gmail,
  targetCount: number,
): Promise<ParsedMessage[]> {
  try {
    const emails = await fetchEmailsByQuery(gmail, "from:me", targetCount);

    return emails;
  } catch (error) {
    logger.error("Error fetching sent emails", {
      error,
    });
    return [];
  }
}

export async function fetchGmailTemplates(
  gmail: gmail_v1.Gmail,
): Promise<string[]> {
  try {
    const drafts = await fetchEmailsByQuery(gmail, "in:draft", 50);

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
    logger.warn("Failed to fetch Gmail templates:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
