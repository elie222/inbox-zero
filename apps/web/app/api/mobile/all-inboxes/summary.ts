import type { EmailProvider, EmailThread } from "@/utils/email/types";
import { isIgnoredSender } from "@/utils/filter-ignored-senders";
import type { Logger } from "@/utils/logger";
import { mapWithConcurrency } from "./map-with-concurrency";

const INBOX_LABEL_ID = "INBOX";
const TO_REPLY_LABEL_NAME = "To Reply";
const CATEGORY_LABELS = [
  { labelName: "Newsletter", displayName: "Newsletters" },
  { labelName: "Marketing", displayName: "Promotions" },
  { labelName: "Notification", displayName: "Notifications" },
] as const;
const ACCOUNT_CONCURRENCY = 4;

export type AllInboxesAccount = {
  id: string;
  email: string;
  provider: string;
};

export type AllInboxesAccountSummary = {
  accountId: string;
  email: string;
  status: "ok" | "partial" | "error";
  replies: EmailThread[];
  categories: {
    key: string;
    labelId: string;
    name: string;
    threads: EmailThread[];
  }[];
};

export async function loadAllInboxesSummary({
  accounts,
  after,
  createProvider,
  logger,
}: {
  accounts: AllInboxesAccount[];
  after: Date;
  createProvider: (account: AllInboxesAccount) => Promise<EmailProvider>;
  logger: Logger;
}) {
  const summaries = await mapWithConcurrency(
    accounts,
    ACCOUNT_CONCURRENCY,
    async (account): Promise<AllInboxesAccountSummary> => {
      const accountLogger = logger.with({ emailAccountId: account.id });

      try {
        const emailProvider = await createProvider(account);
        const [inboxResult, labelsResult] = await Promise.allSettled([
          emailProvider.getThreadsWithQuery({
            query: { type: "inbox", after },
            maxResults: 100,
          }),
          emailProvider.getLabels(),
        ]);
        if (labelsResult.status === "rejected") {
          throw labelsResult.reason;
        }
        const labels = labelsResult.value;
        const toReplyLabel = labels.find(
          (label) =>
            label.name.toLowerCase() === TO_REPLY_LABEL_NAME.toLowerCase(),
        );
        const categoryLabels = CATEGORY_LABELS.flatMap((category) => {
          const label = labels.find(
            (item) =>
              item.name.toLowerCase() === category.labelName.toLowerCase(),
          );
          return label ? [{ ...category, label }] : [];
        });
        const repliesPromise = toReplyLabel
          ? emailProvider.getThreadsWithQuery({
              query: {
                labelIds: [toReplyLabel.id, INBOX_LABEL_ID],
              },
              maxResults: 20,
            })
          : Promise.resolve({ threads: [] as EmailThread[] });

        const [repliesResult] = await Promise.allSettled([repliesPromise]);
        const inboxThreads =
          inboxResult.status === "fulfilled"
            ? normalizeThreads(inboxResult.value.threads)
            : [];
        const replies =
          repliesResult.status === "fulfilled"
            ? normalizeThreads(repliesResult.value.threads)
            : [];

        if (inboxResult.status === "rejected") {
          accountLogger.warn("Failed to load all-inboxes categories", {
            error: inboxResult.reason,
          });
        }
        if (repliesResult.status === "rejected") {
          accountLogger.warn("Failed to load all-inboxes replies", {
            error: repliesResult.reason,
          });
        }

        let status: AllInboxesAccountSummary["status"] = "partial";
        if (
          inboxResult.status === "fulfilled" &&
          repliesResult.status === "fulfilled"
        ) {
          status = "ok";
        } else if (
          inboxResult.status === "rejected" &&
          repliesResult.status === "rejected"
        ) {
          status = "error";
        }

        return {
          accountId: account.id,
          email: account.email,
          status,
          replies,
          categories: categoryLabels.map((category) => ({
            key: `${account.id}:${category.label.id}`,
            labelId: category.label.id,
            name: category.displayName,
            threads: inboxThreads.filter((thread) =>
              thread.messages.some((message) =>
                message.labelIds?.includes(category.label.id),
              ),
            ),
          })),
        };
      } catch (error) {
        accountLogger.warn("Failed to load mailbox for all inboxes", { error });
        return {
          accountId: account.id,
          email: account.email,
          status: "error",
          replies: [],
          categories: [],
        };
      }
    },
  );

  return {
    accounts: summaries,
    failedAccountIds: summaries
      .filter((summary) => summary.status === "error")
      .map((summary) => summary.accountId),
  };
}

function normalizeThreads(threads: EmailThread[]): EmailThread[] {
  return threads.flatMap((thread) => {
    // List and category screens only need metadata. Full bodies and attachment
    // details are fetched by the existing thread-detail endpoint on demand.
    const messages = thread.messages
      .filter((message) => {
        if (!message.headers?.from) return true;
        return !isIgnoredSender(message.headers.from);
      })
      .map((message) => ({
        ...message,
        attachments: undefined,
        inline: [],
        rawRecipients: undefined,
        textHtml: undefined,
        textPlain: undefined,
      }));

    return messages.length ? [{ ...thread, messages }] : [];
  });
}
