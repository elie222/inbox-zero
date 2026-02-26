import type {
  EmailLabel,
  EmailProvider,
  EmailThread,
} from "@/utils/email/types";
import { inboxZeroLabels, type InboxZeroLabel } from "@/utils/label";
import { createScopedLogger, type Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import { LOCAL_BYPASS_USER_EMAIL } from "@/utils/auth/local-bypass-config";

export function createLocalBypassEmailProvider(logger?: Logger): EmailProvider {
  const log = (logger || createScopedLogger("local-bypass-provider")).with({
    provider: "local-bypass",
  });

  const messages = getLocalBypassMessages();
  const messagesById = new Map(
    messages.map((message) => [message.id, message]),
  );
  const defaultMessage = messages[0] || getFallbackMessage();
  let labels = getLocalBypassLabels();

  const findLabelById = (labelId: string) =>
    labels.find((label) => label.id === labelId) || null;
  const findLabelByName = (name: string) =>
    labels.find(
      (label) => label.name.toLowerCase() === name.trim().toLowerCase(),
    ) || null;
  const getOrCreateUserLabel = (name: string) => {
    const existingLabel = findLabelByName(name);
    if (existingLabel) return existingLabel;

    const createdLabel: EmailLabel = {
      id: getLocalBypassUserLabelId(name),
      name: name.trim(),
      type: "user",
    };
    labels = [...labels, createdLabel];
    return createdLabel;
  };

  return {
    name: "google",
    toJSON: () => ({ name: "google", type: "LocalBypassEmailProvider" }),
    getThreads: async () => toThreads(messages),
    getThread: async (threadId) =>
      getThreadById(messages, threadId) || {
        id: threadId,
        messages: [defaultMessage],
        snippet: defaultMessage.snippet,
      },
    getLabels: async () => labels,
    getLabelById: async (labelId) => findLabelById(labelId),
    getLabelByName: async (name) => findLabelByName(name),
    getFolders: async () => [],
    getMessage: async (messageId) =>
      messagesById.get(messageId) || defaultMessage,
    getMessageByRfc822MessageId: async (rfc822MessageId) =>
      messages.find(
        (message) => message.headers["message-id"] === rfc822MessageId,
      ) || null,
    getSentMessages: async (maxResults) =>
      sortMessagesByDateDesc(messages)
        .filter((message) => hasLabel(message, "SENT"))
        .slice(0, maxResults),
    getInboxMessages: async (maxResults) =>
      sortMessagesByDateDesc(messages)
        .filter((message) => hasLabel(message, "INBOX"))
        .slice(0, maxResults),
    getSentMessageIds: async ({ maxResults, after, before }) =>
      sortMessagesByDateDesc(messages)
        .filter((message) => hasLabel(message, "SENT"))
        .filter(
          (message) => !after || getMessageTime(message) > after.getTime(),
        )
        .filter(
          (message) => !before || getMessageTime(message) < before.getTime(),
        )
        .slice(0, maxResults)
        .map((message) => ({ id: message.id, threadId: message.threadId })),
    getSentThreadsExcluding: async ({
      excludeFromEmails = [],
      excludeToEmails = [],
      maxResults,
    }) => {
      const excludedFrom = new Set(
        excludeFromEmails.map((email) => normalizeEmailAddress(email)),
      );
      const excludedTo = new Set(
        excludeToEmails.map((email) => normalizeEmailAddress(email)),
      );

      const filtered = messages.filter((message) => {
        if (!hasLabel(message, "SENT")) return false;

        const normalizedFrom = normalizeEmailAddress(message.headers.from);
        const normalizedTo = normalizeEmailAddress(message.headers.to);

        if (excludedFrom.has(normalizedFrom)) return false;
        if (excludedTo.has(normalizedTo)) return false;

        return true;
      });

      return toThreads(filtered).slice(0, maxResults);
    },
    getDrafts: async () => [],
    getThreadMessages: async (threadId) =>
      sortMessagesByDateAsc(
        messages.filter((message) => message.threadId === threadId),
      ),
    getThreadMessagesInInbox: async (threadId) =>
      sortMessagesByDateAsc(
        messages.filter(
          (message) =>
            message.threadId === threadId && hasLabel(message, "INBOX"),
        ),
      ),
    getPreviousConversationMessages: async (messageIds) => {
      const sourceMessages = messageIds
        .map((messageId) => messagesById.get(messageId))
        .filter(isDefined);
      const sourceThreadIds = new Set(sourceMessages.map((m) => m.threadId));

      return sortMessagesByDateAsc(
        messages.filter(
          (message) =>
            sourceThreadIds.has(message.threadId) &&
            !messageIds.includes(message.id),
        ),
      );
    },
    archiveThread: async () => {},
    archiveThreadWithLabel: async () => {},
    archiveMessage: async () => {},
    bulkArchiveFromSenders: async () => {},
    bulkTrashFromSenders: async () => {},
    trashThread: async () => {},
    labelMessage: async () => ({}),
    removeThreadLabel: async () => {},
    removeThreadLabels: async () => {},
    draftEmail: async () => ({ draftId: "local-bypass-draft-id" }),
    replyToEmail: async () => {},
    sendEmail: async () => {
      log.info("Skipping sendEmail for local bypass provider");
    },
    sendEmailWithHtml: async () => {
      log.info("Skipping sendEmailWithHtml for local bypass provider");
      return {
        messageId: "local-bypass-message-id",
        threadId: "local-bypass-thread-id",
      };
    },
    forwardEmail: async () => {},
    markSpam: async () => {},
    markRead: async () => {},
    markReadThread: async () => {},
    getDraft: async () => null,
    deleteDraft: async () => {},
    sendDraft: async () => ({
      messageId: "local-bypass-message-id",
      threadId: "local-bypass-thread-id",
    }),
    createDraft: async () => ({ id: "local-bypass-draft-id" }),
    updateDraft: async () => {},
    createLabel: async (name) => getOrCreateUserLabel(name),
    deleteLabel: async (labelId) => {
      const labelToDelete = findLabelById(labelId);
      if (!labelToDelete || labelToDelete.type === "system") return;

      labels = labels.filter((label) => label.id !== labelId);
    },
    getOrCreateInboxZeroLabel: async (key: InboxZeroLabel) =>
      getOrCreateUserLabel(inboxZeroLabels[key].name),
    blockUnsubscribedEmail: async () => {},
    getOriginalMessage: async () => null,
    getFiltersList: async () => [],
    createFilter: async () => ({ status: 200 }),
    deleteFilter: async () => ({ status: 200 }),
    createAutoArchiveFilter: async () => ({ status: 200 }),
    getMessagesWithPagination: async (options) =>
      paginateMessages(
        filterMessages(messages, {
          query: options.query,
          before: options.before,
          after: options.after,
          inboxOnly: options.inboxOnly,
          unreadOnly: options.unreadOnly,
        }),
        options.maxResults,
        options.pageToken,
      ),
    getMessagesWithAttachments: async ({ maxResults, pageToken }) =>
      paginateMessages(sortMessagesByDateDesc(messages), maxResults, pageToken),
    getMessagesFromSender: async ({
      senderEmail,
      maxResults,
      pageToken,
      before,
      after,
    }) =>
      paginateMessages(
        filterMessages(messages, { before, after }).filter((message) =>
          matchesSender(message, senderEmail),
        ),
        maxResults,
        pageToken,
      ),
    getThreadsWithParticipant: async ({ participantEmail, maxThreads }) =>
      toThreads(
        messages.filter((message) => {
          const participant = normalizeEmailAddress(participantEmail);
          return (
            normalizeEmailAddress(message.headers.from) === participant ||
            normalizeEmailAddress(message.headers.to) === participant
          );
        }),
      ).slice(0, maxThreads),
    getThreadsWithLabel: async ({ labelId, maxResults }) =>
      toThreads(messages.filter((message) => hasLabel(message, labelId))).slice(
        0,
        maxResults,
      ),
    getLatestMessageFromThreadSnapshot: async (thread) =>
      sortMessagesByDateAsc(thread.messages).at(-1) ?? null,
    getLatestMessageInThread: async (threadId) => {
      const thread = getThreadById(messages, threadId);
      return thread?.messages.at(-1) || null;
    },
    getMessagesBatch: async (messageIds) =>
      messageIds
        .map((messageId) => messagesById.get(messageId))
        .filter(isDefined),
    getAccessToken: () => "local-bypass-access-token",
    checkIfReplySent: async (senderEmail) =>
      messages.some(
        (message) =>
          hasLabel(message, "SENT") &&
          normalizeEmailAddress(message.headers.to) ===
            normalizeEmailAddress(senderEmail),
      ),
    countReceivedMessages: async (senderEmail, threshold) =>
      messages.filter(
        (message) =>
          !hasLabel(message, "SENT") && matchesSender(message, senderEmail),
      ).length >= threshold
        ? threshold
        : messages.filter(
            (message) =>
              !hasLabel(message, "SENT") && matchesSender(message, senderEmail),
          ).length,
    getAttachment: async () => ({ data: "", size: 0 }),
    getThreadsWithQuery: async ({ query, maxResults, pageToken }) => {
      const filteredMessages = filterMessages(messages, {
        before: query?.before ?? undefined,
        after: query?.after ?? undefined,
      }).filter((message) => {
        if (query?.fromEmail && !matchesSender(message, query.fromEmail)) {
          return false;
        }

        if (query?.labelId && !hasLabel(message, query.labelId)) {
          return false;
        }

        if (query?.isUnread && !hasLabel(message, "UNREAD")) {
          return false;
        }

        if (query?.type !== "all" && !hasLabel(message, "INBOX")) {
          return false;
        }

        return true;
      });

      return paginateThreads(
        toThreads(filteredMessages),
        maxResults,
        pageToken,
      );
    },
    hasPreviousCommunicationsWithSenderOrDomain: async ({
      from,
      date,
      messageId,
    }) => {
      const normalizedFrom = normalizeEmailAddress(from);
      const senderDomain = getEmailDomain(normalizedFrom);

      return messages.some((message) => {
        if (message.id === messageId) return false;
        if (getMessageTime(message) >= date.getTime()) return false;

        const messageFrom = normalizeEmailAddress(message.headers.from);
        if (messageFrom === normalizedFrom) return true;

        return getEmailDomain(messageFrom) === senderDomain;
      });
    },
    getThreadsFromSenderWithSubject: async (sender, limit) =>
      toThreads(messages.filter((message) => matchesSender(message, sender)))
        .slice(0, limit)
        .map((thread) => ({
          id: thread.id,
          snippet: thread.snippet,
          subject: thread.messages.at(-1)?.subject || "",
        })),
    processHistory: async () => {},
    watchEmails: async () => ({
      expirationDate: getFutureDate(),
      subscriptionId: "local-bypass-subscription-id",
    }),
    unwatchEmails: async () => {},
    isReplyInThread: (message) => Boolean(message.headers["in-reply-to"]),
    isSentMessage: (message) => hasLabel(message, "SENT"),
    moveThreadToFolder: async () => {},
    getOrCreateFolderIdByName: async (folderName) =>
      `local-bypass-folder:${folderName}`,
    getSignatures: async () => [],
    getInboxStats: async () => {
      const inboxMessages = messages.filter((message) =>
        hasLabel(message, "INBOX"),
      );
      return {
        total: inboxMessages.length,
        unread: inboxMessages.filter((message) => hasLabel(message, "UNREAD"))
          .length,
      };
    },
  };
}

function getFutureDate() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date;
}

function getFallbackMessage(): ParsedMessage {
  const now = new Date().toISOString();

  return {
    id: "local-bypass-message-id",
    threadId: "local-bypass-thread-id",
    labelIds: ["INBOX"],
    snippet: "Local bypass test message",
    historyId: "0",
    internalDate: Date.now().toString(),
    subject: "Local bypass test message",
    date: now,
    headers: {
      from: "sender@example.com",
      to: "local-bypass@inboxzero.local",
      subject: "Local bypass test message",
      date: now,
    },
    textPlain: "Local bypass test message",
    textHtml: "<p>Local bypass test message</p>",
    inline: [],
  };
}

function getLocalBypassLabels(): EmailLabel[] {
  const systemLabels: EmailLabel[] = [
    { id: "INBOX", name: "INBOX", type: "system" },
    { id: "UNREAD", name: "UNREAD", type: "system" },
    { id: "SENT", name: "SENT", type: "system" },
    { id: "DRAFT", name: "DRAFT", type: "system" },
    { id: "TRASH", name: "TRASH", type: "system" },
  ];

  const inboxZeroSystemLabels = Object.values(inboxZeroLabels).map((label) => ({
    id: getLocalBypassUserLabelId(label.name),
    name: label.name,
    type: "user",
  }));

  const userLabels: EmailLabel[] = [
    {
      id: getLocalBypassUserLabelId("Newsletter"),
      name: "Newsletter",
      type: "user",
    },
    {
      id: getLocalBypassUserLabelId("Receipts"),
      name: "Receipts",
      type: "user",
    },
    {
      id: getLocalBypassUserLabelId("Follow-up"),
      name: "Follow-up",
      type: "user",
    },
  ];

  return [...systemLabels, ...inboxZeroSystemLabels, ...userLabels];
}

function getLocalBypassUserLabelId(name: string) {
  return `local-bypass-label:${encodeURIComponent(name.trim().toLowerCase())}`;
}

function getLocalBypassMessages(): ParsedMessage[] {
  const now = Date.now();
  const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000);

  return sortMessagesByDateDesc([
    buildMessage({
      id: "local-bypass-message-001",
      threadId: "local-bypass-thread-001",
      from: "Morning Brew <newsletter@morningbrew.com>",
      subject: "Your morning brew is ready",
      snippet: "Top stories, markets, and product news in 5 minutes.",
      textPlain:
        "Top stories, markets, and product news in 5 minutes. Click unsubscribe if you no longer want this.",
      unsubscribeUrl: "https://morningbrew.com/unsubscribe",
      unread: true,
      inbox: true,
      sent: false,
      date: hoursAgo(2),
    }),
    buildMessage({
      id: "local-bypass-message-002",
      threadId: "local-bypass-thread-002",
      from: "Product Hunt <hello@producthunt.com>",
      subject: "Trending products for builders",
      snippet: "AI assistants, dev tools, and startup launches from today.",
      textPlain: "AI assistants, dev tools, and startup launches from today.",
      unsubscribeUrl: "https://producthunt.com/unsubscribe",
      unread: true,
      inbox: true,
      sent: false,
      date: hoursAgo(5),
    }),
    buildMessage({
      id: "local-bypass-message-003",
      threadId: "local-bypass-thread-003",
      from: "Stripe <receipts+dev@stripe.com>",
      subject: "Receipt for your subscription",
      snippet: "Payment successful for your monthly plan.",
      textPlain: "Payment successful for your monthly plan.",
      unread: false,
      inbox: true,
      sent: false,
      date: hoursAgo(8),
    }),
    buildMessage({
      id: "local-bypass-message-004",
      threadId: "local-bypass-thread-004",
      from: "Acme Marketing <news@acme-mail.com>",
      subject: "New templates for your team",
      snippet: "Three campaign templates you can use this week.",
      textPlain: "Three campaign templates you can use this week.",
      unsubscribeUrl: "https://acme-mail.com/unsubscribe",
      unread: false,
      inbox: true,
      sent: false,
      date: hoursAgo(10),
    }),
    buildMessage({
      id: "local-bypass-message-005",
      threadId: "local-bypass-thread-005",
      from: "GitHub <notifications@github.com>",
      subject: "Pull request review requested",
      snippet: "A teammate requested your review on a repository update.",
      textPlain: "A teammate requested your review on a repository update.",
      unread: false,
      inbox: true,
      sent: false,
      date: hoursAgo(14),
    }),
    buildMessage({
      id: "local-bypass-message-006",
      threadId: "local-bypass-thread-006",
      from: "Launch Notes <digest@launchnotes.dev>",
      subject: "Weekly product updates from tools you use",
      snippet: "Release highlights from eight products in your stack.",
      textPlain: "Release highlights from eight products in your stack.",
      unsubscribeUrl: "https://launchnotes.dev/unsubscribe",
      unread: true,
      inbox: true,
      sent: false,
      date: hoursAgo(26),
    }),
    buildMessage({
      id: "local-bypass-message-007",
      threadId: "local-bypass-thread-007",
      from: "Founders Weekly <digest@foundersweekly.io>",
      subject: "Fundraising and GTM breakdowns",
      snippet: "Operator notes on pricing experiments and conversion.",
      textPlain: "Operator notes on pricing experiments and conversion.",
      unsubscribeUrl: "https://foundersweekly.io/unsubscribe",
      unread: true,
      inbox: true,
      sent: false,
      date: hoursAgo(30),
    }),
    buildMessage({
      id: "local-bypass-message-008",
      threadId: "local-bypass-thread-008",
      from: "Travel Deals <deals@travel-example.com>",
      subject: "Weekend flight deals",
      snippet: "Discounted flights from your nearest airports.",
      textPlain: "Discounted flights from your nearest airports.",
      unsubscribeUrl: "https://travel-example.com/unsubscribe",
      unread: false,
      inbox: true,
      sent: false,
      date: hoursAgo(54),
    }),
    buildMessage({
      id: "local-bypass-message-009",
      threadId: "local-bypass-thread-001",
      from: "Morning Brew <newsletter@morningbrew.com>",
      subject: "Yesterday's market recap",
      snippet: "A quick recap of yesterday's market activity.",
      textPlain: "A quick recap of yesterday's market activity.",
      unsubscribeUrl: "https://morningbrew.com/unsubscribe",
      unread: false,
      inbox: false,
      sent: false,
      date: hoursAgo(72),
    }),
    buildMessage({
      id: "local-bypass-message-010",
      threadId: "local-bypass-thread-009",
      from: "Dev Weekly <newsletter@devweekly.io>",
      subject: "TypeScript and React links",
      snippet: "The best engineering reads from this week.",
      textPlain: "The best engineering reads from this week.",
      unsubscribeUrl: "https://devweekly.io/unsubscribe",
      unread: true,
      inbox: true,
      sent: false,
      date: hoursAgo(80),
    }),
    buildMessage({
      id: "local-bypass-message-011",
      threadId: "local-bypass-thread-004",
      from: "Acme Marketing <news@acme-mail.com>",
      subject: "Customer stories: growth playbook",
      snippet: "How teams improved onboarding conversions.",
      textPlain: "How teams improved onboarding conversions.",
      unsubscribeUrl: "https://acme-mail.com/unsubscribe",
      unread: false,
      inbox: false,
      sent: false,
      date: hoursAgo(120),
    }),
    buildMessage({
      id: "local-bypass-message-012",
      threadId: "local-bypass-thread-009",
      from: "Dev Weekly <newsletter@devweekly.io>",
      subject: "Performance tuning guide",
      snippet: "A deep dive into frontend performance wins.",
      textPlain: "A deep dive into frontend performance wins.",
      unsubscribeUrl: "https://devweekly.io/unsubscribe",
      unread: false,
      inbox: false,
      sent: false,
      date: hoursAgo(200),
    }),
  ]);
}

function buildMessage(options: {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  textPlain: string;
  unread: boolean;
  inbox: boolean;
  sent: boolean;
  date: Date;
  unsubscribeUrl?: string;
}): ParsedMessage {
  const isoDate = options.date.toISOString();
  const labelIds = [
    options.inbox ? "INBOX" : null,
    options.unread ? "UNREAD" : null,
    options.sent ? "SENT" : null,
  ].filter(isDefined);

  return {
    id: options.id,
    threadId: options.threadId,
    labelIds,
    snippet: options.snippet,
    historyId: options.date.getTime().toString(),
    internalDate: options.date.getTime().toString(),
    subject: options.subject,
    date: isoDate,
    headers: {
      from: options.from,
      to: LOCAL_BYPASS_USER_EMAIL,
      subject: options.subject,
      date: isoDate,
      "message-id": `<${options.id}@local-bypass.test>`,
      "list-unsubscribe": options.unsubscribeUrl
        ? `<${options.unsubscribeUrl}>`
        : undefined,
    },
    textPlain: options.textPlain,
    textHtml: options.unsubscribeUrl
      ? `<p>${options.textPlain}</p><p><a href="${options.unsubscribeUrl}">Unsubscribe</a></p>`
      : `<p>${options.textPlain}</p>`,
    inline: [],
  };
}

function getThreadById(
  messages: ParsedMessage[],
  threadId: string,
): EmailThread | null {
  const threadMessages = messages.filter(
    (message) => message.threadId === threadId,
  );
  if (!threadMessages.length) return null;

  const orderedMessages = sortMessagesByDateAsc(threadMessages);
  const latestMessage = orderedMessages.at(-1);
  return {
    id: threadId,
    messages: orderedMessages,
    snippet: latestMessage?.snippet || "",
  };
}

function toThreads(messages: ParsedMessage[]): EmailThread[] {
  const threadMap = new Map<string, ParsedMessage[]>();

  for (const message of messages) {
    const existing = threadMap.get(message.threadId);
    if (existing) existing.push(message);
    else threadMap.set(message.threadId, [message]);
  }

  const threads = Array.from(threadMap.entries()).map(([threadId, entries]) => {
    const orderedMessages = sortMessagesByDateAsc(entries);
    const latestMessage = orderedMessages.at(-1);
    return {
      id: threadId,
      messages: orderedMessages,
      snippet: latestMessage?.snippet || "",
    };
  });

  return threads.sort(
    (a, b) =>
      getMessageTime(b.messages.at(-1) || getFallbackMessage()) -
      getMessageTime(a.messages.at(-1) || getFallbackMessage()),
  );
}

function paginateMessages(
  messages: ParsedMessage[],
  maxResults?: number,
  pageToken?: string,
) {
  const offset = parseOffset(pageToken);
  const limit = normalizeLimit(maxResults, 20);
  const pagedMessages = messages.slice(offset, offset + limit);
  const nextPageToken =
    offset + limit < messages.length ? String(offset + limit) : undefined;

  return { messages: pagedMessages, nextPageToken };
}

function paginateThreads(
  threads: EmailThread[],
  maxResults?: number,
  pageToken?: string,
) {
  const offset = parseOffset(pageToken);
  const limit = normalizeLimit(maxResults, 50);
  const pagedThreads = threads.slice(offset, offset + limit);
  const nextPageToken =
    offset + limit < threads.length ? String(offset + limit) : undefined;

  return { threads: pagedThreads, nextPageToken };
}

function filterMessages(
  messages: ParsedMessage[],
  options: {
    query?: string;
    before?: Date;
    after?: Date;
    inboxOnly?: boolean;
    unreadOnly?: boolean;
  },
) {
  return sortMessagesByDateDesc(messages).filter((message) => {
    if (options.query && !matchesTextQuery(message, options.query))
      return false;
    if (options.before && getMessageTime(message) >= options.before.getTime()) {
      return false;
    }
    if (options.after && getMessageTime(message) <= options.after.getTime()) {
      return false;
    }
    if (options.inboxOnly && !hasLabel(message, "INBOX")) return false;
    if (options.unreadOnly && !hasLabel(message, "UNREAD")) return false;
    return true;
  });
}

function matchesTextQuery(message: ParsedMessage, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const haystack = [
    message.headers.from,
    message.headers.to,
    message.headers.subject,
    message.snippet,
    message.textPlain || "",
    message.textHtml || "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function matchesSender(message: ParsedMessage, senderEmail: string) {
  return (
    normalizeEmailAddress(message.headers.from) ===
    normalizeEmailAddress(senderEmail)
  );
}

function hasLabel(message: ParsedMessage, label: string) {
  return message.labelIds?.includes(label) ?? false;
}

function sortMessagesByDateDesc(messages: ParsedMessage[]) {
  return [...messages].sort((a, b) => getMessageTime(b) - getMessageTime(a));
}

function sortMessagesByDateAsc(messages: ParsedMessage[]) {
  return [...messages].sort((a, b) => getMessageTime(a) - getMessageTime(b));
}

function getMessageTime(message: ParsedMessage) {
  if (message.internalDate) {
    const parsed = Number.parseInt(message.internalDate, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }

  const dateFromHeader = Date.parse(message.date);
  return Number.isNaN(dateFromHeader) ? 0 : dateFromHeader;
}

function parseOffset(pageToken?: string) {
  if (!pageToken) return 0;
  const parsed = Number.parseInt(pageToken, 10);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeLimit(value: number | undefined, fallback: number) {
  if (!value || Number.isNaN(value)) return fallback;
  return Math.max(1, Math.min(100, value));
}

function normalizeEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim().toLowerCase();
}

function getEmailDomain(value: string) {
  const [, domain] = normalizeEmailAddress(value).split("@");
  return domain || "";
}

function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}
