import type { gmail_v1 } from "@googleapis/gmail";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { getMessages, getMessage } from "@/utils/gmail/message";
import { parseMessage } from "@/utils/mail";
import { createScopedLogger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import type { EmailAccount, User, Account } from "@prisma/client";

const logger = createScopedLogger("email-report-fetch");

/**
 * Fetch emails from Gmail based on query
 *
 * Uses sequential message fetching instead of batch loads to avoid Gmail API rate limits.
 * This approach fetches one message at a time with retry and backofflogic, which is slower but more
 * reliable than trying to fetch 100 messages at once.
 *
 * getMessagesLargeBatch because it expects the messageIds
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
                messageId: message.id,
                attempt: i + 1,
                error: error instanceof Error ? error.message : String(error),
                errorType:
                  error instanceof Error
                    ? error.constructor.name
                    : typeof error,
              });

              if (i === 2) {
                logger.warn(
                  `Failed to fetch message ${message.id} after 3 attempts:`,
                  {
                    error:
                      error instanceof Error ? error.message : String(error),
                  },
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
        retryCount,
        maxRetries,
        error: error instanceof Error ? error.message : String(error),
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
        errorStack: error instanceof Error ? error.stack : undefined,
        currentEmailsCount: emails.length,
        targetCount: count,
      });

      if (retryCount >= maxRetries) {
        logger.error(`Failed to fetch emails after ${maxRetries} attempts:`, {
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000 * retryCount));
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
  emailAccount: EmailAccount & {
    account: Account;
    user: Pick<User, "email" | "aiProvider" | "aiModel" | "aiApiKey">;
  };
}): Promise<EmailFetchResult> {
  logger.info("fetchEmailsForReport started", {
    emailAccountId: emailAccount?.id,
    userEmail: emailAccount?.user?.email,
    hasAccessToken: !!emailAccount?.account?.access_token,
    hasRefreshToken: !!emailAccount?.account?.refresh_token,
  });

  if (
    !emailAccount.account?.access_token ||
    !emailAccount.account?.refresh_token
  ) {
    logger.error("fetchEmailsForReport: missing Gmail tokens", {
      hasAccessToken: !!emailAccount?.account?.access_token,
      hasRefreshToken: !!emailAccount?.account?.refresh_token,
    });
    throw new Error("Missing Gmail tokens");
  }

  let gmail: gmail_v1.Gmail;
  try {
    logger.info("fetchEmailsForReport: initializing Gmail client", {
      emailAccountId: emailAccount.id,
      expiresAt: emailAccount.account.expires_at,
    });

    gmail = await getGmailClientWithRefresh({
      accessToken: emailAccount.account.access_token,
      refreshToken: emailAccount.account.refresh_token,
      expiresAt: emailAccount.account.expires_at,
      emailAccountId: emailAccount.id,
    });

    logger.info("fetchEmailsForReport: Gmail client initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize Gmail client", {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorStack: error instanceof Error ? error.stack : undefined,
      emailAccountId: emailAccount.id,
    });
    throw new Error(
      `Failed to initialize Gmail client: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let receivedEmails: ParsedMessage[];
  let sentEmails: ParsedMessage[];

  try {
    logger.info("fetchEmailsForReport: about to fetch received emails", {
      targetCount: 200,
    });

    receivedEmails = await fetchReceivedEmails(gmail, 200);

    logger.info("fetchEmailsForReport: received emails fetched successfully", {
      count: receivedEmails.length,
    });
  } catch (error) {
    logger.error("Failed to fetch received emails", {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorStack: error instanceof Error ? error.stack : undefined,
      emailAccountId: emailAccount.id,
    });
    throw new Error(
      `Failed to fetch received emails: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 3000));

  try {
    logger.info("fetchEmailsForReport: about to fetch sent emails", {
      targetCount: 50,
    });

    sentEmails = await fetchSentEmails(gmail, 50);

    logger.info("fetchEmailsForReport: sent emails fetched successfully", {
      count: sentEmails.length,
    });
  } catch (error) {
    logger.error("Failed to fetch sent emails", {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorStack: error instanceof Error ? error.stack : undefined,
      emailAccountId: emailAccount.id,
    });
    throw new Error(
      `Failed to fetch sent emails: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  logger.info("fetchEmailsForReport: preparing return result", {
    receivedCount: receivedEmails.length,
    sentCount: sentEmails.length,
  });

  const result = {
    receivedEmails,
    sentEmails,
    totalReceived: receivedEmails.length,
    totalSent: sentEmails.length,
  };

  logger.info("fetchEmailsForReport: returning result", {
    resultKeys: Object.keys(result),
    receivedCount: result.totalReceived,
    sentCount: result.totalSent,
  });

  return result;
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
        error: error instanceof Error ? error.message : String(error),
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
      error: error instanceof Error ? error.message : String(error),
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
