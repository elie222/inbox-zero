import { z } from "zod";
import {
  editorSchema,
  mailFolderSchema,
} from "@/utils/mcp/mail-client-contract";
import { createEmailProvider } from "@/utils/email/provider";
import { executeDurableEmailSend } from "@/utils/email/durable-email-send";
import { parsedMessageMetadata } from "@/utils/mail-api/observations";
import { extractEmailAddress, splitRecipientList } from "@/utils/email";
import { resolveMcpEmailAccount } from "@/utils/mcp/account-selection";
import { textToHtmlParagraphs } from "@/utils/string";
import { emailToContent } from "@/utils/mail";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";

export const browseMailSchema = z.object({
  emailAccountId: z.string().min(1),
  folder: mailFolderSchema.describe(
    "System view: inbox, sent, draft, archive, starred, unread, all, spam, or trash; or a provider label/folder ID from the browse result's navigation. Use IDs only from the selected mailbox.",
  ),
  query: z.string().optional(),
  pageToken: z.string().optional(),
});
export const readMailSchema = z.object({
  emailAccountId: z.string().min(1),
  threadId: z.string().min(1),
});
export const changeMailSchema = readMailSchema.extend({
  action: z.enum(["archive", "unarchive", "read", "unread"]),
});
export const sendMailSchema = editorSchema.extend({
  mutationId: z.string().uuid(),
  queuedAt: z.number().int().nonnegative(),
});
const navigationCache = new Map<
  string,
  {
    expiresAt: number;
    value: Promise<Awaited<ReturnType<typeof fetchMailNavigation>>>;
  }
>();
const systemViews = new Set([
  "inbox",
  "sent",
  "draft",
  "archive",
  "starred",
  "unread",
  "all",
  "spam",
  "trash",
]);

export async function browseMailForMcp(
  userId: string,
  args: z.infer<typeof browseMailSchema>,
  logger: Logger,
) {
  const { emailAccount, provider } = await mailbox(
    userId,
    args.emailAccountId,
    logger,
  );
  const navigationPromise = getMailNavigation(
    userId,
    emailAccount.id,
    provider,
    logger,
  );
  const pagePromise = (async () => {
    if (args.query?.trim())
      return provider.searchThreads({
        query: args.query,
        pageToken: args.pageToken,
        maxResults: 25,
        messageFormat: "metadata",
      });
    let query: { type?: string; labelId?: string; folderId?: string };
    if (systemViews.has(args.folder)) query = { type: args.folder };
    else {
      const navigation = await navigationPromise;
      const item = navigation.items.find((item) => item.id === args.folder);
      if (!item)
        throw new Error(
          "Folder is no longer available. Refresh the mailbox navigation.",
        );
      query =
        item.kind === "folder" ? { folderId: item.id } : { labelId: item.id };
    }
    return provider.getThreadsWithQuery({
      query,
      pageToken: args.pageToken,
      maxResults: 25,
      messageFormat: "metadata",
    });
  })();
  const [page, navigation] = await Promise.all([
    pagePromise,
    navigationPromise,
  ]);
  return {
    emailAccount,
    threads: page.threads.map((thread) => ({
      id: thread.id,
      messages: thread.messages.map((message) =>
        serializeMail(message, !parsedMessageMetadata(message).read),
      ),
    })),
    nextPageToken: page.nextPageToken ?? null,
    navigation,
  };
}

export async function readMailForMcp(
  userId: string,
  args: z.infer<typeof readMailSchema>,
  logger: Logger,
) {
  const { emailAccount, provider } = await mailbox(
    userId,
    args.emailAccountId,
    logger,
  );
  const { messages } = await provider.getThread(args.threadId, {
    includeDrafts: true,
  });
  return {
    emailAccount,
    threadId: args.threadId,
    messages: await Promise.all(
      messages.map(async (message) => {
        const metadata = parsedMessageMetadata(message);
        const serialized = serializeMail(message, !metadata.read, true);
        if (metadata.roles.includes("draft"))
          serialized.draftId =
            (await provider.getDraftReferenceForMessage(message.id))?.id ??
            null;
        return serialized;
      }),
    ),
  };
}

export async function saveMailDraftForMcp(
  userId: string,
  args: z.infer<typeof editorSchema>,
  logger: Logger,
) {
  validateRecipients(args.to, args.cc);
  const { emailAccount, provider } = await mailbox(
    userId,
    args.emailAccountId,
    logger,
  );
  const messageHtml = textToHtmlParagraphs(args.body);
  let draftId = args.draftId;
  if (draftId) {
    if (!(await provider.getDraft(draftId)))
      throw new Error("Draft not found in the selected mailbox.");
    await provider.updateDraft(draftId, {
      to: args.to,
      cc: args.cc,
      subject: args.subject,
      messageHtml,
    });
  } else {
    if (args.replyToMessageId) await provider.getMessage(args.replyToMessageId);
    const draft = await provider.createDraft({
      to: args.to,
      cc: args.cc,
      subject: args.subject,
      messageHtml,
      replyToMessageId: args.replyToMessageId,
    });
    if (!draft.id) throw new Error("Draft could not be saved.");
    draftId = draft.id;
  }
  navigationCache.delete(JSON.stringify([userId, emailAccount.id]));
  return {
    emailAccount,
    emailAccountId: emailAccount.id,
    draftId,
    sent: false,
    editor: { ...args, draftId },
  };
}

export async function sendMailForMcp(
  userId: string,
  args: z.infer<typeof sendMailSchema>,
  logger: Logger,
) {
  validateRecipients(args.to, args.cc);
  const { emailAccount, provider } = await mailbox(
    userId,
    args.emailAccountId,
    logger,
  );
  const reply = args.replyToMessageId
    ? await provider.getMessage(args.replyToMessageId)
    : null;
  const outcome = await executeDurableEmailSend({
    emailAccountId: emailAccount.id,
    provider: emailAccount.provider,
    logger,
    getEmailProvider: async () => provider,
    input: {
      mutationId: args.mutationId,
      queuedAt: args.queuedAt,
      threadId: reply?.threadId ?? null,
      messageIds: reply ? [reply.id] : [],
      email: {
        to: args.to,
        cc: args.cc,
        subject: args.subject,
        messageHtml: textToHtmlParagraphs(args.body),
        ...(args.draftId && { providerDraftId: args.draftId }),
        ...(reply && {
          replyToEmail: {
            threadId: reply.threadId,
            messageId: reply.id,
            headerMessageId: reply.headers["message-id"],
            references: reply.headers.references,
          },
        }),
      },
    },
  });
  navigationCache.delete(JSON.stringify([userId, emailAccount.id]));
  return { emailAccount, ...outcome };
}

export async function changeMailForMcp(
  userId: string,
  args: z.infer<typeof changeMailSchema>,
  logger: Logger,
) {
  const { emailAccount, provider } = await mailbox(
    userId,
    args.emailAccountId,
    logger,
  );
  if (args.action === "archive")
    await provider.archiveThread(args.threadId, emailAccount.email);
  else if (args.action === "unarchive")
    await provider.unarchiveThread(args.threadId);
  else await provider.markReadThread(args.threadId, args.action === "read");
  navigationCache.delete(JSON.stringify([userId, emailAccount.id]));
  return {
    emailAccount,
    threadId: args.threadId,
    action: args.action,
    applied: true,
  };
}

async function mailbox(userId: string, emailAccountId: string, logger: Logger) {
  const emailAccount = await resolveMcpEmailAccount({ userId, emailAccountId });
  const provider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: emailAccount.provider,
    logger,
  });
  return { emailAccount, provider };
}

function serializeMail(
  message: ParsedMessage,
  unread: boolean,
  includeBody = false,
) {
  return {
    id: message.id,
    threadId: message.threadId,
    subject: message.subject,
    from: message.headers.from ?? "",
    to: message.headers.to ?? "",
    cc: message.headers.cc ?? "",
    replyTo: message.headers["reply-to"] ?? "",
    date: message.date,
    snippet: message.snippet,
    body: includeBody
      ? emailToContent(message, {
          maxLength: Number.MAX_SAFE_INTEGER,
          includeLinkUrls: true,
          includeImageAltText: true,
        })
      : "",
    unread,
    draftId: null as string | null,
  };
}

function validateRecipients(to: string, cc?: string) {
  for (const value of [to, cc].filter(Boolean)) {
    const recipients = splitRecipientList(value!);
    const addresses = recipients.map(extractEmailAddress);
    if (
      !addresses.length ||
      addresses.some((address) => !z.email().safeParse(address).success)
    )
      throw new Error("Enter valid recipient email addresses.");
  }
}

function getMailNavigation(
  userId: string,
  emailAccountId: string,
  provider: Awaited<ReturnType<typeof createEmailProvider>>,
  logger: Logger,
) {
  const key = JSON.stringify([userId, emailAccountId]);
  const existing = navigationCache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.value;
  navigationCache.delete(key);
  if (navigationCache.size >= 100)
    navigationCache.delete(navigationCache.keys().next().value!);
  const entry = {
    expiresAt: Date.now() + 60_000,
    value: fetchMailNavigation(provider, logger),
  };
  navigationCache.set(key, entry);
  entry.value.then(
    (navigation) => {
      if (navigation.unavailable && navigationCache.get(key) === entry)
        navigationCache.delete(key);
    },
    () => {
      if (navigationCache.get(key) === entry) navigationCache.delete(key);
    },
  );
  return entry.value;
}

async function fetchMailNavigation(
  provider: Awaited<ReturnType<typeof createEmailProvider>>,
  logger: Logger,
) {
  const [labelsResult, countsResult] = await Promise.allSettled([
    provider.getLabels(),
    provider.getFolderCounts(),
  ]);
  const labels = labelsResult.status === "fulfilled" ? labelsResult.value : [];
  const counts = countsResult.status === "fulfilled" ? countsResult.value : [];
  const unavailable =
    labelsResult.status === "rejected" || countsResult.status === "rejected";
  if (unavailable) logger.warn("Mailbox navigation is partially unavailable");
  const systemIds = new Set([
    "INBOX",
    "DRAFT",
    "SENT",
    "ARCHIVE",
    "STARRED",
    "UNREAD",
    "SPAM",
    "TRASH",
    "IMPORTANT",
    "CHAT",
    "ALL",
  ]);
  const labelIds = new Set(labels.map((label) => label.id));
  const countsById = new Map(counts.map((count) => [count.id, count]));
  return {
    items: [
      ...labels
        .filter((label) => label.type !== "system" && !systemIds.has(label.id))
        .map((label) => ({
          id: label.id,
          name: label.name,
          kind: "label" as const,
          total: countsById.get(label.id)?.total,
          unread: countsById.get(label.id)?.unread,
        })),
      ...counts
        .filter(
          (count) =>
            !count.systemType &&
            !systemIds.has(count.id) &&
            !labelIds.has(count.id),
        )
        .map((count) => ({
          id: count.id,
          name: count.name,
          kind: "folder" as const,
          total: count.total,
          unread: count.unread,
        })),
    ],
    counts: counts.map(({ id, systemType, total, unread }) => ({
      id,
      systemType,
      total,
      unread,
    })),
    unavailable,
  };
}
