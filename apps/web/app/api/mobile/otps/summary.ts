import type { EmailProvider, EmailThread } from "@/utils/email/types";
import { getMessageTimestamp } from "@/utils/email/message-timestamp";
import { isIgnoredSender } from "@/utils/filter-ignored-senders";
import type { Logger } from "@/utils/logger";
import { getRecentOtpThreads, OTP_MAX_AGE_MS } from "@/utils/otp";
import { mapWithConcurrency } from "../all-inboxes/map-with-concurrency";

const ACCOUNT_CONCURRENCY = 4;
const THREAD_PAGE_SIZE = 100;

type OtpAccount = {
  id: string;
  email: string;
  provider: string;
};

export async function loadRecentOtpSummary({
  accounts,
  createProvider,
  logger,
  now = new Date(),
}: {
  accounts: OtpAccount[];
  createProvider: (account: OtpAccount) => Promise<EmailProvider>;
  logger: Logger;
  now?: Date;
}) {
  const failedAccountIds: string[] = [];
  const after = new Date(now.getTime() - OTP_MAX_AGE_MS);
  const summaries = await mapWithConcurrency(
    accounts,
    ACCOUNT_CONCURRENCY,
    async (account) => {
      try {
        const provider = await createProvider(account);
        const threads = await loadThreadsSince(provider, after);

        return {
          accountId: account.id,
          email: account.email,
          threads: normalizeReceivedDates(
            getRecentOtpThreads(normalizeThreads(threads), now),
          ),
        };
      } catch (error) {
        failedAccountIds.push(account.id);
        logger.warn("Failed to load recent OTP messages", {
          emailAccountId: account.id,
          error,
        });
        return null;
      }
    },
  );

  return {
    accounts: summaries.filter((summary) => summary !== null),
    failedAccountIds,
  };
}

async function loadThreadsSince(provider: EmailProvider, after: Date) {
  const threads: EmailThread[] = [];
  let pageToken: string | undefined;

  do {
    const page = await provider.getThreadsWithQuery({
      query: { type: "inbox", after },
      maxResults: THREAD_PAGE_SIZE,
      pageToken,
    });
    threads.push(...page.threads);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return threads;
}

function normalizeReceivedDates(threads: EmailThread[]): EmailThread[] {
  return threads.map((thread) => ({
    ...thread,
    messages: thread.messages.map((message) => {
      const date = new Date(getMessageTimestamp(message)).toISOString();
      return {
        ...message,
        date,
        headers: { ...message.headers, date },
      };
    }),
  }));
}

function normalizeThreads(threads: EmailThread[]): EmailThread[] {
  return threads.flatMap((thread) => {
    const messages = thread.messages
      .filter(
        (message) =>
          !message.headers?.from || !isIgnoredSender(message.headers.from),
      )
      .map((message) => ({
        ...message,
        attachments: undefined,
        inline: [],
        rawRecipients: undefined,
        textHtml: undefined,
        textPlain: undefined,
      }));

    return messages.length > 0 ? [{ ...thread, messages }] : [];
  });
}
