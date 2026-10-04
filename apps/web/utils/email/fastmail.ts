import { enqueueFastmailSync } from "@/utils/fastmail/queue";
import { mailSplitToThreadsQuery } from "@/utils/split-inbox/split-query";
import {
  getFastmailFilters,
  saveFastmailFilter,
  deleteFastmailFilter,
} from "@/utils/fastmail/filters";
import { ActionType } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { escapeHtml } from "@/utils/string";
import type { Attachment as MailAttachment } from "nodemailer/lib/mailer";
import { z } from "zod";
import { normalizeContactCandidates } from "@/utils/email/contact";
import { toLocalMailMessage } from "@/utils/email/local-mail-sync";
import { SafeError } from "@/utils/error";
import { InvalidMailboxSyncCursorError } from "@/utils/email/mailbox-sync";
import type { SendEmailBody } from "@/utils/types/mail";
import type { ParsedMessage } from "@/utils/types";
import type {
  FastmailClient,
  JMAPMethodResponse,
} from "@/utils/fastmail/client";
import { getAccessTokenFromClient } from "@/utils/fastmail/client";
import { parseFastmailSearchQuery } from "@/utils/fastmail/search-query";
import { FastmailMailbox } from "@/utils/fastmail/constants";
import type { InboxZeroLabel } from "@/utils/label";
import type { ThreadsQuery } from "@/utils/threads/validation";
import type {
  OutlookSystemFolder,
  OutlookFolder,
} from "@/utils/outlook/folders";
import type {
  EmailProvider,
  EmailThread,
  EmailLabel,
  EmailFilter,
  EmailSignature,
  SentMessagePage,
} from "@/utils/email/types";
import { createScopedLogger, type Logger } from "@/utils/logger";
import {
  splitRecipientList,
  isValidEmail,
  extractEmailAddress,
  extractNameFromEmail,
} from "@/utils/email";

/**
 * Standard properties to fetch for Email/get requests
 * Extracted as constant to avoid duplication and ensure consistency
 */
const fastmailCursorSchema = z.object({
  accountId: z.string(),
  emailAccountId: z.string(),
  after: z.number(),
  before: z.number().optional(),
  state: z.string().min(1),
  position: z.string().optional(),
});

const ROLE_LABELS: Record<string, OutlookSystemFolder> = {
  inbox: "INBOX",
  sent: "SENT",
  drafts: "DRAFT",
  trash: "TRASH",
  junk: "SPAM",
  archive: "ARCHIVE",
};

const EMAIL_PROPERTIES = [
  "id",
  "threadId",
  "mailboxIds",
  "keywords",
  "from",
  "to",
  "cc",
  "bcc",
  "subject",
  "receivedAt",
  "sentAt",
  "preview",
  "hasAttachment",
  "messageId",
  "inReplyTo",
  "references",
  "replyTo",
  "bodyStructure",
  "bodyValues",
  "textBody",
  "htmlBody",
  "attachments",
  "header:List-Unsubscribe",
  "header:List-Unsubscribe-Post:asText",
] as const;

// JMAP Email type
interface JMAPEmail {
  attachments?: JMAPBodyPart[];
  bcc?: JMAPEmailAddress[];
  blobId: string;
  bodyStructure?: JMAPBodyPart;
  bodyValues?: Record<string, { value: string; isEncodingProblem: boolean }>;
  cc?: JMAPEmailAddress[];
  from?: JMAPEmailAddress[];
  hasAttachment: boolean;
  "header:List-Unsubscribe"?: string;
  "header:List-Unsubscribe-Post:asText"?: string;
  htmlBody?: JMAPBodyPart[];
  id: string;
  inReplyTo?: string[];
  keywords: Record<string, boolean>;
  mailboxIds: Record<string, boolean>;
  messageId?: string[];
  preview: string;
  receivedAt: string;
  references?: string[];
  replyTo?: JMAPEmailAddress[];
  sender?: JMAPEmailAddress[];
  sentAt?: string;
  size: number;
  subject?: string;
  textBody?: JMAPBodyPart[];
  threadId: string;
  to?: JMAPEmailAddress[];
}

interface JMAPEmailAddress {
  email: string;
  name?: string;
}

interface JMAPBodyPart {
  blobId?: string;
  charset?: string;
  cid?: string;
  disposition?: string;
  name?: string;
  partId?: string;
  size: number;
  subParts?: JMAPBodyPart[];
  type: string;
}

interface JMAPMailbox {
  id: string;
  isSubscribed: boolean;
  name: string;
  parentId?: string;
  role?: string;
  sortOrder: number;
  totalEmails: number;
  totalThreads: number;
  unreadEmails: number;
  unreadThreads: number;
}

interface JMAPIdentity {
  bcc?: JMAPEmailAddress[];
  email: string;
  htmlSignature?: string;
  id: string;
  mayDelete: boolean;
  name: string;
  replyTo?: JMAPEmailAddress[];
  textSignature?: string;
}

// Cache for mailbox lookups
interface MailboxCache {
  byId: Map<string, JMAPMailbox>;
  byName: Map<string, JMAPMailbox>;
  byRole: Map<string, JMAPMailbox>;
}

// JMAP response data types (simplified - JMAP has complex generic response types)
interface JMAPGetResponse<T> {
  accountId: string;
  list: T[];
  notFound?: string[];
  state: string;
}

interface JMAPQueryResponse {
  accountId: string;
  canCalculateChanges?: boolean;
  ids: string[];
  position: number;
  queryState: string;
  total?: number;
}

interface JMAPSetResponse<T> {
  accountId: string;
  created?: Record<string, T>;
  destroyed?: string[];
  newState: string;
  notCreated?: Record<string, { type: string; description?: string }>;
  notDestroyed?: Record<string, { type: string; description?: string }>;
  notUpdated?: Record<string, { type: string; description?: string }>;
  oldState?: string;
  updated?: Record<string, T | null>;
}

/**
 * JMAP /changes response for tracking incremental updates
 * @see https://jmap.io/spec-core.html#changes
 */
interface JMAPChangesResponse {
  accountId: string;
  created: string[];
  destroyed: string[];
  hasMoreChanges: boolean;
  newState: string;
  oldState: string;
  updated: string[];
}

// Helper to extract typed response data from JMAP method responses
// JMAP responses are [methodName, data, callId] tuples where data structure varies by method
function getResponseData<T>(response: JMAPMethodResponse): T {
  return response[1] as T;
}

/**
 * Checks if an error is a JMAP error of a specific type
 * Used to determine if we should retry with a different approach
 */
function isJMAPErrorType(error: unknown, errorType: string): boolean {
  if (
    error instanceof Error &&
    error.message.includes(`JMAP error: ${errorType}`)
  ) {
    return true;
  }
  return false;
}

/**
 * Calculates the next page token for JMAP position-based pagination
 * @param position - Current position in the result set
 * @param returnedCount - Number of items returned in this page
 * @param limit - Requested page size
 * @param total - Total count from server (may be undefined if not requested/supported)
 * @returns Next page token or undefined if no more pages
 */
function calculateNextPageToken(
  position: number,
  returnedCount: number,
  limit: number,
  total: number | undefined,
): string | undefined {
  const nextPosition = position + returnedCount;

  if (total !== undefined) {
    // Server provided total - use it definitively
    return nextPosition < total ? String(nextPosition) : undefined;
  }

  // No total provided - use heuristic: full page means more may exist
  return returnedCount >= limit ? String(nextPosition) : undefined;
}

/**
 * Fastmail email provider implementation using the JMAP protocol.
 *
 * JMAP (JSON Meta Application Protocol) is a modern, efficient protocol for
 * accessing mail, calendars, and contacts. Fastmail helped create the JMAP
 * specification and uses it as their primary API.
 *
 * Key differences from Gmail:
 * - Uses mailboxes (folders) instead of labels - messages can be in multiple mailboxes
 * - No built-in filter/rules API - Fastmail uses Sieve for server-side filtering
 * - Push notifications use EventSource instead of Pub/Sub webhooks
 *
 * @see https://jmap.io/spec-mail.html for JMAP Mail specification
 * @see https://www.fastmail.com/dev/ for Fastmail API documentation
 */
export class FastmailProvider implements EmailProvider {
  readonly name = "fastmail" as const;
  private readonly client: FastmailClient;
  private readonly emailAccountId?: string;
  private readonly logger: Logger;
  private mailboxCache: MailboxCache | null = null;
  private readonly inboxZeroLabels: Map<string, string> = new Map();

  readonly localMailSyncStrategy = "account-history" as const;

  archiveMessages: EmailProvider["archiveMessages"] = async (ids, labelId) => {
    const inbox = await this.requireMailbox("inbox");
    const archive = await this.requireMailbox("archive");
    await this.patchMessages(ids, {
      [`mailboxIds/${inbox.id}`]: null,
      [`mailboxIds/${archive.id}`]: true,
      ...(labelId ? { [`mailboxIds/${labelId}`]: true } : {}),
    });
  };

  bulkArchiveThreads: EmailProvider["bulkArchiveThreads"] = async (threads) => {
    const succeededThreadIds: string[] = [];
    const failedThreadIds: string[] = [];
    for (const thread of threads) {
      try {
        await this.archiveMessages(
          thread.messageIds.length
            ? thread.messageIds
            : await this.getThreadEmailIds(thread.threadId),
        );
        succeededThreadIds.push(thread.threadId);
      } catch {
        failedThreadIds.push(thread.threadId);
      }
    }
    return { succeededThreadIds, failedThreadIds };
  };

  deleteFolder: EmailProvider["deleteFolder"] = async (id) =>
    this.deleteLabel(id);

  getAttachmentStream: EmailProvider["getAttachmentStream"] = async (
    _messageId,
    attachmentId,
    signal,
  ) => {
    const url = this.client.session.downloadUrl
      .replace("{accountId}", encodeURIComponent(this.client.accountId))
      .replace("{blobId}", encodeURIComponent(attachmentId))
      .replace("{name}", "attachment")
      .replace("{type}", "application%2Foctet-stream");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.getAccessToken()}` },
      signal: signal ?? AbortSignal.timeout(30_000),
    });
    if (!response.ok || !response.body)
      throw new SafeError(`Attachment download failed: ${response.status}`);
    return response.body;
  };

  getFolderCounts: EmailProvider["getFolderCounts"] = async () => {
    this.mailboxCache = null;
    const cache = await this.ensureMailboxCache();
    return [...cache.byId.values()].map((mailbox) => ({
      id: mailbox.id,
      name: mailbox.name,
      total: mailbox.totalEmails,
      unread: mailbox.unreadEmails,
      systemType: mailbox.role ? ROLE_LABELS[mailbox.role] : undefined,
    }));
  };

  getForwardingAddresses: EmailProvider["getForwardingAddresses"] =
    async () => {
      throw new SafeError(
        "Fastmail does not expose forwarding settings through its public API.",
      );
    };

  getInboxStats: EmailProvider["getInboxStats"] = async () => {
    this.mailboxCache = null;
    const inbox = await this.requireMailbox("inbox");
    return { total: inbox.totalEmails, unread: inbox.unreadEmails };
  };

  getLatestMessageFromThreadSnapshot: EmailProvider["getLatestMessageFromThreadSnapshot"] =
    async (thread) =>
      thread.messages
        .filter((message) => !message.labelIds?.includes("DRAFT"))
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0] ?? null;

  getLatestMessageInThread: EmailProvider["getLatestMessageInThread"] = async (
    id,
  ) => this.getLatestMessageFromThreadSnapshot(await this.getThread(id));

  getMessagesWithAttachments: EmailProvider["getMessagesWithAttachments"] =
    async (options) => this.queryEmails({ hasAttachment: true }, options);

  getThreadsWithLabel: EmailProvider["getThreadsWithLabel"] = async ({
    labelId,
    maxResults,
  }) =>
    (await this.searchThreads({ query: "", labelIds: [labelId], maxResults }))
      .threads;

  markMessagesReadState: EmailProvider["markMessagesReadState"] = async (
    ids,
    read,
  ) => this.patchMessages(ids, { "keywords/$seen": read ? true : null });

  markMessagesStarredState: EmailProvider["markMessagesStarredState"] = async (
    ids,
    starred,
  ) => this.patchMessages(ids, { "keywords/$flagged": starred ? true : null });

  markNotSpam: EmailProvider["markNotSpam"] = async (id) => {
    const inbox = await this.requireMailbox("inbox");
    const junk = await this.requireMailbox("junk");
    await this.patchMessages(await this.getThreadEmailIds(id), {
      [`mailboxIds/${inbox.id}`]: true,
      [`mailboxIds/${junk.id}`]: null,
    });
  };

  renameFolder: EmailProvider["renameFolder"] = async (id, name) =>
    this.updateLabel(id, { name });

  starMessage: EmailProvider["starMessage"] = async (id) =>
    this.markMessagesStarredState([id], true);

  trashMessages: EmailProvider["trashMessages"] = async (ids) => {
    const trash = await this.requireMailbox("trash");
    const inbox = await this.requireMailbox("inbox");
    await this.patchMessages(ids, {
      [`mailboxIds/${trash.id}`]: true,
      [`mailboxIds/${inbox.id}`]: null,
    });
  };

  unarchiveMessages: EmailProvider["unarchiveMessages"] = async (ids) => {
    const inbox = await this.requireMailbox("inbox");
    const archive = await this.requireMailbox("archive");
    await this.patchMessages(ids, {
      [`mailboxIds/${inbox.id}`]: true,
      [`mailboxIds/${archive.id}`]: null,
    });
  };

  unarchiveThread: EmailProvider["unarchiveThread"] = async (id) =>
    this.unarchiveMessages(await this.getThreadEmailIds(id));

  untrashMessages: EmailProvider["untrashMessages"] = async (ids) => {
    const trash = await this.requireMailbox("trash");
    const inbox = await this.requireMailbox("inbox");
    await this.patchMessages(ids, {
      [`mailboxIds/${inbox.id}`]: true,
      [`mailboxIds/${trash.id}`]: null,
    });
  };

  untrashThread: EmailProvider["untrashThread"] = async (id) =>
    this.untrashMessages(await this.getThreadEmailIds(id));

  updateLabel: EmailProvider["updateLabel"] = async (id, update) => {
    if (update.color)
      throw new SafeError(
        "Fastmail mailbox colors are not available through JMAP.",
      );
    await this.client.request([
      [
        "Mailbox/set",
        {
          accountId: this.client.accountId,
          update: {
            [id]: {
              ...(update.name === undefined ? {} : { name: update.name }),
              ...(update.labelListVisibility === undefined
                ? {}
                : { isSubscribed: update.labelListVisibility !== "labelHide" }),
            },
          },
        },
        "0",
      ],
    ]);
    this.mailboxCache = null;
  };

  private async requireMailbox(role: string) {
    const mailbox = await this.getMailboxByRole(role);
    if (!mailbox) throw new SafeError(`Fastmail ${role} mailbox not found`);
    return mailbox;
  }

  private async patchMessages(ids: string[], patch: Record<string, unknown>) {
    const limit = this.batchLimit("maxObjectsInSet");
    const unique = [...new Set(ids)];
    for (let offset = 0; offset < unique.length; offset += limit) {
      await this.client.request([
        [
          "Email/set",
          {
            accountId: this.client.accountId,
            update: Object.fromEntries(
              unique.slice(offset, offset + limit).map((id) => [id, patch]),
            ),
          },
          "0",
        ],
      ]);
    }
  }

  private batchLimit(key: "maxObjectsInGet" | "maxObjectsInSet") {
    const core = this.client.session?.capabilities?.[
      "urn:ietf:params:jmap:core"
    ] as Record<string, number> | undefined;
    return Math.max(1, Math.min(core?.[key] ?? 256, 256));
  }

  private async queryEmails(
    filter: Record<string, unknown>,
    options: { maxResults?: number; pageToken?: string } = {},
    collapseThreads = false,
  ) {
    await this.ensureMailboxCache();
    const anchor = options.pageToken?.startsWith("anchor:")
      ? options.pageToken.slice(7)
      : undefined;
    const position = anchor
      ? 0
      : options.pageToken
        ? Number(options.pageToken)
        : 0;
    if (
      !Number.isSafeInteger(position) ||
      position < 0 ||
      (anchor !== undefined && !anchor)
    )
      throw new SafeError("Invalid Fastmail page token");
    const limit = Math.max(
      1,
      Math.min(options.maxResults ?? 50, this.batchLimit("maxObjectsInGet")),
    );
    const response = await this.client
      .request([
        [
          "Email/query",
          {
            accountId: this.client.accountId,
            filter,
            ...(anchor ? { anchor, anchorOffset: 1 } : { position }),
            limit,
            collapseThreads,
            sort: [{ property: "receivedAt", isAscending: false }],
            calculateTotal: true,
          },
          "0",
        ],
        [
          "Email/get",
          {
            accountId: this.client.accountId,
            "#ids": { resultOf: "0", name: "Email/query", path: "/ids" },
            properties: [...EMAIL_PROPERTIES],
            fetchAllBodyValues: true,
          },
          "1",
        ],
      ])
      .catch((error: unknown) => {
        if (anchor && isJMAPErrorType(error, "anchorNotFound"))
          throw new InvalidMailboxSyncCursorError();
        throw error;
      });
    const query = getResponseData<JMAPQueryResponse>(
      response.methodResponses[0],
    );
    const result = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[1],
    );
    return {
      messages: result.list.map((email) => ({
        ...this.parseJMAPEmail(email),
        historyId: result.state,
      })),
      nextPageToken:
        query.ids.length &&
        (query.total === undefined
          ? query.ids.length === limit
          : query.position + query.ids.length < query.total)
          ? `anchor:${query.ids.at(-1)}`
          : undefined,
    };
  }

  searchMessages: EmailProvider["searchMessages"] = async (options) => {
    const conditions: Record<string, unknown>[] = [];
    const search = options.mailboxSearch;
    const text = search?.text;
    let queryIncludesSpamTrash = false;
    if (text)
      conditions.push({
        [text.field === "any" ? "text" : text.field]: text.value,
      });
    else if (options.query) {
      const cache = await this.ensureMailboxCache();
      const parsed = parseFastmailSearchQuery(options.query, [
        ...cache.byId.values(),
      ]);
      conditions.push(parsed.filter);
      queryIncludesSpamTrash = parsed.includeSpamTrash;
    }
    if (options.fromEmail) conditions.push({ from: options.fromEmail });
    const read =
      search?.read ??
      (options.readState ? options.readState === "read" : undefined);
    if (read !== undefined)
      conditions.push({ [read ? "hasKeyword" : "notKeyword"]: "$seen" });
    if (search?.starred !== undefined)
      conditions.push({
        [search.starred ? "hasKeyword" : "notKeyword"]: "$flagged",
      });
    if (search?.hasAttachment !== undefined)
      conditions.push({ hasAttachment: search.hasAttachment });
    const mailbox = options.folder ?? search?.mailbox;
    if (mailbox === "starred") conditions.push({ hasKeyword: "$flagged" });
    else if (mailbox && mailbox !== "all") {
      const role = mailbox === "spam" ? "junk" : mailbox;
      const folder = await this.getMailboxByRole(role);
      if (!folder) return { messages: [] };
      conditions.push({ inMailbox: folder.id });
    }
    for (const id of options.labelIds ?? []) conditions.push({ inMailbox: id });
    if (options.labelName) {
      const label = await this.getMailboxByName(options.labelName);
      if (!label) return { messages: [] };
      conditions.push({ inMailbox: label.id });
    }
    const excludedRoles = [...(search?.excludedRoles ?? [])];
    if (
      !options.includeSpamTrash &&
      !queryIncludesSpamTrash &&
      mailbox !== "spam" &&
      mailbox !== "trash"
    )
      excludedRoles.push("spam", "trash");
    for (const role of new Set(excludedRoles)) {
      const folder = await this.getMailboxByRole(
        role === "spam" ? "junk" : role === "draft" ? "drafts" : role,
      );
      if (folder)
        conditions.push({
          operator: "NOT",
          conditions: [{ inMailbox: folder.id }],
        });
    }
    return this.queryEmails(
      conditions.length ? { operator: "AND", conditions } : {},
      options,
    );
  };

  searchThreads: EmailProvider["searchThreads"] = async (options) => {
    const page = await this.searchMessages(options);
    return {
      threads: await Promise.all(
        [...new Set(page.messages.map((message) => message.threadId))].map(
          (id) => this.getThread(id),
        ),
      ),
      nextPageToken: page.nextPageToken,
    };
  };

  searchContacts: EmailProvider["searchContacts"] = async (query) => {
    const capability = "urn:ietf:params:jmap:contacts";
    const accountId = this.client.session.primaryAccounts[capability];
    if (!accountId)
      throw new SafeError(
        "Allow contacts access on your Fastmail API token to search contacts.",
      );
    const response = await this.client.request([
      [
        "ContactCard/query",
        { accountId, filter: { text: query }, limit: 10 },
        "0",
      ],
      [
        "ContactCard/get",
        {
          accountId,
          "#ids": { resultOf: "0", name: "ContactCard/query", path: "/ids" },
          properties: ["name", "emails"],
        },
        "1",
      ],
    ]);
    const cards = getResponseData<
      JMAPGetResponse<{
        name?: { full?: string; components?: { value: string }[] };
        emails?: Record<string, { address: string }>;
      }>
    >(response.methodResponses[1]).list;
    return normalizeContactCandidates(
      cards.flatMap((card) =>
        Object.values(card.emails ?? {}).map((email) => ({
          emailAddress: email.address,
          name:
            card.name?.full ??
            card.name?.components?.map((part) => part.value).join(" "),
        })),
      ),
    );
  };

  getMailboxSyncPage: EmailProvider["getMailboxSyncPage"] = async (options) => {
    if (!options.cursor) {
      const baseline = await this.getEmailChanges(null);
      return {
        cursor: baseline.newState,
        deletedMessageIds: [],
        hasMore: false,
        reset: false,
        upsertedMessages: [],
      };
    }
    try {
      const changes = await this.getEmailChanges(options.cursor);
      const messages = await this.getMessagesBatch([
        ...new Set([...changes.created, ...changes.updated]),
      ]);
      const matches = (message: ParsedMessage) =>
        (!options.after ||
          Number(message.internalDate) >= options.after.getTime()) &&
        (!options.folderId || message.labelIds?.includes(options.folderId));
      return {
        cursor: changes.newState,
        deletedMessageIds: changes.destroyed,
        removedMessageIds: messages
          .filter((message) => !matches(message))
          .map((message) => message.id),
        hasMore: changes.hasMoreChanges,
        reset: false,
        upsertedMessages: messages.filter(matches),
      };
    } catch (error) {
      if (
        !isJMAPErrorType(error, "cannotCalculateChanges") &&
        !isJMAPErrorType(error, "invalidState")
      )
        throw error;
      return {
        cursor: "",
        deletedMessageIds: [],
        hasMore: false,
        reset: true,
        upsertedMessages: [],
      };
    }
  };

  syncLocalMail: EmailProvider["syncLocalMail"] = async (request, context) => {
    const binding = {
      accountId: this.client.accountId,
      emailAccountId: context.emailAccountId,
    };
    if (request.phase === "capabilities")
      return {
        status: "ok",
        phase: request.phase,
        result: {
          strategy: this.localMailSyncStrategy,
          excludedFolderIds: [],
          maxHydrationMessages: 25,
        },
      };
    if (!("after" in request))
      return { status: "unsupported", strategy: this.localMailSyncStrategy };
    const bounds = { after: request.after, before: request.before };
    const encode = (state: string, position?: string) =>
      Buffer.from(
        JSON.stringify({ ...binding, ...bounds, state, position }),
      ).toString("base64url");
    const decode = (value: string) => {
      const cursor = fastmailCursorSchema.parse(
        JSON.parse(Buffer.from(value, "base64url").toString()),
      );
      if (
        cursor.accountId !== binding.accountId ||
        cursor.emailAccountId !== binding.emailAccountId ||
        cursor.after !== bounds.after ||
        cursor.before !== bounds.before
      )
        throw new SafeError("Fastmail sync cursor scope mismatch");
      return cursor;
    };
    if (request.phase === "history-baseline")
      return {
        status: "ok",
        phase: request.phase,
        result: { cursor: encode((await this.getEmailChanges(null)).newState) },
      };
    if (request.phase === "history-backfill") {
      const cursor = request.cursor
        ? decode(request.cursor)
        : {
            state: (await this.getEmailChanges(null)).newState,
            position: undefined,
          };
      const page = await this.getMessagesWithPagination({
        after: new Date(request.after),
        before: new Date(request.before),
        maxResults: request.limit,
        pageToken: cursor.position,
      });
      return {
        status: "ok",
        phase: request.phase,
        result: {
          messageIds: page.messages.map((message) => message.id),
          nextCursor: page.nextPageToken
            ? encode(cursor.state, page.nextPageToken)
            : undefined,
          historyCursor: encode(cursor.state),
        },
      };
    }
    if (request.phase === "history-changes") {
      try {
        const changes = await this.getEmailChanges(
          decode(request.cursor).state,
        );
        return {
          status: "ok",
          phase: request.phase,
          result: {
            resetRequired: false,
            messageIds: [...new Set([...changes.created, ...changes.updated])],
            confirmedDeletedMessageIds: changes.destroyed,
            cursor: encode(changes.newState),
            hasMore: changes.hasMoreChanges,
          },
        };
      } catch (error) {
        if (
          isJMAPErrorType(error, "cannotCalculateChanges") ||
          isJMAPErrorType(error, "invalidState")
        )
          return { status: "reset-required", phase: request.phase };
        throw error;
      }
    }
    if (request.phase === "history-hydrate") {
      const found = await this.getMessagesBatch(request.messageIds);
      const inScope = (message: ParsedMessage) => {
        const time = Number(message.internalDate);
        return (
          time >= request.after &&
          (request.before === undefined || time < request.before) &&
          !message.labelIds?.some((label) =>
            ["SPAM", "TRASH", "DRAFT"].includes(label),
          )
        );
      };
      return {
        status: "ok",
        phase: request.phase,
        result: {
          messages: found.filter(inScope).map(toLocalMailMessage),
          removedMessageIds: found
            .filter((message) => !inScope(message))
            .map((message) => message.id),
          confirmedDeletedMessageIds: request.messageIds.filter(
            (id) => !found.some((message) => message.id === id),
          ),
        },
      };
    }
    return { status: "unsupported", strategy: this.localMailSyncStrategy };
  };

  createDraft: EmailProvider["createDraft"] = async (params) => {
    const reply = params.replyToMessageId
      ? await this.getMessage(params.replyToMessageId)
      : undefined;
    const created = await this.createJmapDraft({
      ...params,
      replyToEmail: reply
        ? {
            threadId: reply.threadId,
            headerMessageId: reply.headers["message-id"],
            references: reply.headers.references,
          }
        : undefined,
    });
    return { id: created.id };
  };

  getDraftReferenceForMessage: EmailProvider["getDraftReferenceForMessage"] =
    async (messageId) => {
      const message = await this.getMessage(messageId);
      if (!message.labelIds?.includes("DRAFT")) return null;
      const mapping = this.emailAccountId
        ? await prisma.fastmailDraft.findUnique({
            where: {
              emailAccountId_messageId: {
                emailAccountId: this.emailAccountId,
                messageId,
              },
            },
          })
        : null;
      return { id: mapping?.id ?? messageId, version: message.historyId };
    };

  updateDraft = async (
    id: string,
    params: Parameters<EmailProvider["updateDraft"]>[1] &
      Pick<SendEmailBody, "from" | "replyTo">,
  ) => {
    const emailAccountId = this.requireEmailAccountId();
    const mapping = await prisma.fastmailDraft.upsert({
      where: { emailAccountId_id: { emailAccountId, id } },
      create: { emailAccountId, id, messageId: id },
      update: {},
    });
    const old = await this.getMessage(mapping.messageId);
    if (!old.labelIds?.includes("DRAFT"))
      throw new SafeError("This message is no longer a draft.");
    const attachments =
      params.attachments ?? (await this.downloadAttachments(old));
    const replacement = await this.createJmapDraft({
      to: params.to ?? old.headers.to,
      cc: params.cc ?? old.headers.cc,
      bcc: params.bcc ?? old.headers.bcc,
      subject: params.subject ?? old.subject ?? "",
      messageHtml:
        params.messageHtml ?? old.textHtml ?? escapeHtml(old.textPlain),
      attachments,
      from: params.from ?? old.headers.from,
      replyTo: params.replyTo ?? old.headers["reply-to"],
      replyToEmail: {
        threadId: old.threadId,
        headerMessageId: old.headers["in-reply-to"],
        references: old.headers.references,
      },
    });
    const claimed = await prisma.fastmailDraft.updateMany({
      where: { emailAccountId, id, version: mapping.version },
      data: { messageId: replacement.id, version: { increment: 1 } },
    });
    if (!claimed.count) {
      await this.destroyEmail(replacement.id);
      throw new SafeError(
        "This draft changed in another session. Reload it before editing.",
      );
    }
    await this.destroyEmail(mapping.messageId);
  };

  sendDraft: EmailProvider["sendDraft"] = async (id) => {
    const message = await this.getDraft(id);
    if (!message?.labelIds?.includes("DRAFT"))
      throw new SafeError("Draft not found or already sent.");
    await this.submitMessage(message.id, message.headers.from);
    return { messageId: message.id, threadId: message.threadId };
  };

  private requireEmailAccountId() {
    if (!this.emailAccountId)
      throw new Error("Fastmail account context is required");
    return this.emailAccountId;
  }

  private async resolveDraftId(id: string) {
    if (!this.emailAccountId) return id;
    const mapping = await prisma.fastmailDraft.findUnique({
      where: { emailAccountId_id: { emailAccountId: this.emailAccountId, id } },
    });
    return mapping?.messageId ?? id;
  }

  private async destroyEmail(id: string, state?: string) {
    const response = await this.client.request([
      [
        "Email/set",
        {
          accountId: this.client.accountId,
          destroy: [id],
          ...(state ? { ifInState: state } : {}),
        },
        "0",
      ],
    ]);
    const result = getResponseData<JMAPSetResponse<never>>(
      response.methodResponses[0],
    );
    if (!result.destroyed?.includes(id))
      throw new SafeError(
        result.notDestroyed?.[id]?.description ??
          "Could not confirm draft deletion",
      );
  }

  private async getIdentity(from?: string) {
    const response = await this.client.request([
      ["Identity/get", { accountId: this.client.accountId }, "0"],
    ]);
    const identities = getResponseData<JMAPGetResponse<JMAPIdentity>>(
      response.methodResponses[0],
    ).list;
    const address = from ? extractEmailAddress(from).toLowerCase() : undefined;
    const identity = address
      ? identities.find((item) => item.email.toLowerCase() === address)
      : identities[0];
    if (!identity)
      throw new SafeError("Choose a verified Fastmail sending identity.");
    return identity;
  }

  private async createJmapDraft(body: SendEmailBody, plainText?: string) {
    const drafts = await this.requireMailbox("drafts");
    const identity = await this.getIdentity(body.from);
    const attachments = await Promise.all(
      (body.attachments ?? []).map(async (attachment) => {
        const uploaded = await this.uploadBlob(
          attachment.content,
          attachment.contentType,
        );
        return {
          blobId: uploaded.blobId,
          size: uploaded.size,
          type: attachment.contentType,
          name: attachment.filename,
          disposition: attachment.disposition ?? "attachment",
          cid: attachment.contentId,
        };
      }),
    );
    const content: Record<string, unknown> = {
      mailboxIds: { [drafts.id]: true },
      keywords: { $draft: true, $seen: true },
      from: [{ email: identity.email, name: identity.name }],
      to: jmapAddresses(body.to),
      cc: jmapAddresses(body.cc),
      bcc: jmapAddresses(body.bcc),
      replyTo: jmapAddresses(body.replyTo),
      subject: body.subject,
      attachments,
      bodyValues: { body: { value: plainText ?? body.messageHtml } },
      ...(plainText === undefined
        ? { htmlBody: [{ partId: "body", type: "text/html" }] }
        : { textBody: [{ partId: "body", type: "text/plain" }] }),
    };
    if (body.replyToEmail?.headerMessageId)
      content.inReplyTo = [
        body.replyToEmail.headerMessageId.replace(/^<|>$/g, ""),
      ];
    if (body.replyToEmail?.references)
      content.references = body.replyToEmail.references
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => id.replace(/^<|>$/g, ""));
    const response = await this.client.request([
      [
        "Email/set",
        { accountId: this.client.accountId, create: { email: content } },
        "0",
      ],
    ]);
    const created = getResponseData<
      JMAPSetResponse<{ id: string; threadId: string }>
    >(response.methodResponses[0]).created?.email;
    if (!created?.id) throw new SafeError("Could not create Fastmail draft.");
    return created;
  }

  private async submitMessage(id: string, from?: string) {
    const identity = await this.getIdentity(from);
    const sent = await this.requireMailbox("sent");
    const drafts = await this.requireMailbox("drafts");
    const response = await this.client
      .request([
        [
          "EmailSubmission/set",
          {
            accountId: this.client.accountId,
            create: { submission: { identityId: identity.id, emailId: id } },
            onSuccessUpdateEmail: {
              "#submission": {
                "keywords/$draft": null,
                [`mailboxIds/${drafts.id}`]: null,
                [`mailboxIds/${sent.id}`]: true,
              },
            },
          },
          "0",
        ],
      ])
      .catch((error: unknown) => {
        if (typeof error === "object" && error !== null) {
          if (
            "status" in error &&
            [401, 403, 429].includes(Number(error.status))
          )
            throw error;
          if (
            "jmapMethod" in error &&
            error.jmapMethod === "EmailSubmission/set"
          )
            throw error;
        }
        // The server may have accepted the submission before the connection failed.
        // An ordinary Error keeps the durable send marked uncertain, preventing retries.
        throw new Error(
          "Fastmail did not confirm sending. Check Sent before retrying.",
          { cause: error },
        );
      });
    const result = getResponseData<JMAPSetResponse<{ id: string }>>(
      response.methodResponses[0],
    );
    if (result.notCreated?.submission) {
      throw new SafeError(
        result.notCreated.submission.description ??
          "Fastmail rejected sending.",
      );
    }
    if (!result.created?.submission?.id) {
      throw new Error(
        "Fastmail did not confirm sending. Check Sent before retrying.",
      );
    }
  }

  private async downloadAttachments(
    message: ParsedMessage,
  ): Promise<NonNullable<SendEmailBody["attachments"]>> {
    const unique = new Map(
      [...(message.attachments ?? []), ...(message.inline ?? [])].map(
        (attachment) => [attachment.attachmentId, attachment],
      ),
    );
    return Promise.all(
      [...unique.values()].map(async (attachment) => ({
        filename: attachment.filename,
        contentType: attachment.mimeType,
        content: (await this.getAttachment(message.id, attachment.attachmentId))
          .data,
        disposition: attachment.headers["content-id"]
          ? ("inline" as const)
          : ("attachment" as const),
        contentId: attachment.headers["content-id"] || undefined,
      })),
    );
  }

  async getOrCreateFolderIdByName(folderName: string): Promise<string> {
    return this.getOrCreateOutlookFolderIdByName(folderName);
  }

  /**
   * Creates a new FastmailProvider instance
   * @param client - Initialized Fastmail JMAP client
   * @param logger - Optional logger instance for debugging
   */
  constructor(
    client: FastmailClient,
    logger?: Logger,
    emailAccountId?: string,
  ) {
    this.emailAccountId = emailAccountId;
    this.client = client;
    this.logger = (logger || createScopedLogger("fastmail-provider")).with({
      provider: "fastmail",
    });
  }

  /**
   * Returns a JSON representation of this provider for logging purposes
   * @returns Object with provider name and type
   */
  toJSON() {
    return { name: this.name, type: "FastmailProvider" };
  }

  /**
   * Uploads a blob (file content) to Fastmail for use as an attachment.
   * @param content - Base64-encoded file content
   * @param contentType - MIME type of the file
   * @returns The blob ID and size for use in email attachments
   */
  private async uploadBlob(
    content: string,
    contentType: string,
  ): Promise<{ blobId: string; size: number }> {
    // Decode base64 content to binary
    const binaryString = atob(content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Build upload URL with account ID
    const uploadUrl = this.client.session.uploadUrl.replace(
      "{accountId}",
      encodeURIComponent(this.client.accountId),
    );

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.client.accessToken}`,
        "Content-Type": contentType,
      },
      body: bytes,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error("Failed to upload blob", {
        status: response.status,
      });
      this.logger.trace("JMAP upload error response", { error: errorText });
      throw new Error(`Failed to upload blob: ${response.status}`);
    }

    const result = await response.json();
    return {
      blobId: result.blobId,
      size: result.size,
    };
  }

  /**
   * Ensures the mailbox cache is populated and returns it.
   * The cache stores mailboxes indexed by ID, role, and name for fast lookups.
   * @returns The populated mailbox cache
   */
  private async ensureMailboxCache(): Promise<MailboxCache> {
    if (this.mailboxCache) return this.mailboxCache;

    try {
      const response = await this.client.request([
        [
          "Mailbox/get",
          {
            accountId: this.client.accountId,
            properties: [
              "id",
              "name",
              "parentId",
              "role",
              "sortOrder",
              "totalEmails",
              "unreadEmails",
              "totalThreads",
              "unreadThreads",
              "isSubscribed",
            ],
          },
          "0",
        ],
      ]);

      const mailboxes = getResponseData<JMAPGetResponse<JMAPMailbox>>(
        response.methodResponses[0],
      ).list;

      this.mailboxCache = {
        byId: new Map(mailboxes.map((m) => [m.id, m])),
        byRole: new Map(
          mailboxes.filter((m) => m.role).map((m) => [m.role!, m]),
        ),
        byName: new Map(mailboxes.map((m) => [m.name.toLowerCase(), m])),
      };

      return this.mailboxCache;
    } catch (error) {
      this.logger.error("Failed to fetch mailbox cache", { error });
      throw error;
    }
  }

  private async getMailboxByRole(role: string): Promise<JMAPMailbox | null> {
    const cache = await this.ensureMailboxCache();
    return cache.byRole.get(role) || null;
  }

  private async getMailboxById(id: string): Promise<JMAPMailbox | null> {
    const cache = await this.ensureMailboxCache();
    return cache.byId.get(id) || null;
  }

  private async getMailboxByName(name: string): Promise<JMAPMailbox | null> {
    const cache = await this.ensureMailboxCache();
    return cache.byName.get(name.toLowerCase()) || null;
  }

  private parseEmailAddress(addr: JMAPEmailAddress[] | undefined): string {
    if (!addr || addr.length === 0) return "";
    return addr
      .map((a) => (a.name ? `${a.name} <${a.email}>` : a.email))
      .join(", ");
  }

  private parseJMAPEmail(email: JMAPEmail): ParsedMessage {
    const textPlain =
      email.bodyValues && email.textBody?.[0]?.partId
        ? email.bodyValues[email.textBody[0].partId]?.value
        : undefined;
    const textHtml =
      email.bodyValues && email.htmlBody?.[0]?.partId
        ? email.bodyValues[email.htmlBody[0].partId]?.value
        : undefined;

    // Convert mailboxIds to labelIds
    const labelIds = Object.keys(email.mailboxIds || {});

    // Add mailbox role-based labels (SENT, INBOX) using cached mailbox data
    // This ensures compatibility with Gmail-style label checks
    if (this.mailboxCache) {
      for (const mailboxId of Object.keys(email.mailboxIds || {})) {
        const mailbox = this.mailboxCache.byId.get(mailboxId);
        const role = mailbox?.role && ROLE_LABELS[mailbox.role];
        if (role) labelIds.push(role);
      }
    }

    // Add keyword-based labels
    // Only mark as UNREAD if keywords exist and $seen is explicitly false or missing
    // If keywords object doesn't exist, we don't have read state information
    if (email.keywords && !email.keywords.$seen) {
      labelIds.push("UNREAD");
    }
    if (email.keywords?.$flagged) {
      labelIds.push("STARRED");
    }
    if (email.keywords?.$draft) {
      labelIds.push("DRAFT");
    }

    const attachments =
      email.attachments?.map((att) => ({
        filename: att.name || "attachment",
        mimeType: att.type,
        size: att.size,
        attachmentId: att.blobId || "",
        headers: {
          "content-type": att.type,
          "content-description": att.name || "",
          "content-transfer-encoding": "base64",
          "content-id": att.cid || "",
        },
      })) || [];

    return {
      id: email.id,
      threadId: email.threadId,
      labelIds,
      snippet: email.preview || "",
      historyId: "", // JMAP doesn't have historyId in the same way
      attachments: attachments.filter(
        (attachment) => !attachment.headers["content-id"],
      ),
      inline: attachments.filter(
        (attachment) => !!attachment.headers["content-id"],
      ),
      hasAttachment: email.hasAttachment,
      headers: {
        subject: email.subject || "",
        from: this.parseEmailAddress(email.from),
        to: this.parseEmailAddress(email.to),
        cc: this.parseEmailAddress(email.cc),
        bcc: this.parseEmailAddress(email.bcc),
        date: email.sentAt || email.receivedAt,
        "message-id": email.messageId?.[0],
        "reply-to": this.parseEmailAddress(email.replyTo),
        "in-reply-to": email.inReplyTo?.[0],
        references: email.references?.join(" "),
        "list-unsubscribe": email["header:List-Unsubscribe"],
        "list-unsubscribe-post": email["header:List-Unsubscribe-Post:asText"],
      },
      textPlain,
      textHtml,
      calendarContent: flattenParts(email.bodyStructure)
        .filter((part) => part.type === "text/calendar")
        .map((part) =>
          part.partId ? email.bodyValues?.[part.partId]?.value : undefined,
        )
        .find(Boolean),
      isMeetingInvitation: flattenParts(email.bodyStructure).some(
        (part) => part.type === "text/calendar",
      ),
      subject: email.subject || "",
      date: email.sentAt || email.receivedAt,
      internalDate: String(Date.parse(email.receivedAt)),
    };
  }

  /**
   * Retrieves email threads from a specific folder or the inbox.
   * @param folderId - Optional mailbox ID to fetch threads from. Defaults to inbox.
   * @returns Array of email threads with their messages
   */
  async getThreads(folderId?: string): Promise<EmailThread[]> {
    return (
      await this.getThreadsWithQuery({
        query: folderId ? { folderId } : { type: "inbox" },
      })
    ).threads;
  }

  async getThread(
    threadId: string,
    options?: Parameters<EmailProvider["getThread"]>[1],
  ): Promise<EmailThread> {
    options?.signal?.throwIfAborted();
    const messages = (
      await this.getMessagesBatch(await this.getThreadEmailIds(threadId))
    )
      .filter(
        (message) =>
          options?.includeDrafts || !message.labelIds?.includes("DRAFT"),
      )
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    return { id: threadId, messages, snippet: messages.at(-1)?.snippet ?? "" };
  }

  async getLabels(): Promise<EmailLabel[]> {
    const cache = await this.ensureMailboxCache();

    return Array.from(cache.byId.values())
      .filter((mailbox) => !mailbox.role || mailbox.role === "archive")
      .map((mailbox) => ({
        id: mailbox.id,
        name: mailbox.name,
        type: mailbox.role ? "system" : "user",
        threadsTotal: mailbox.totalThreads,
      }));
  }

  async getLabelById(labelId: string): Promise<EmailLabel | null> {
    if (labelId === "UNREAD") {
      const result = await this.client.request([
        [
          "Email/query",
          {
            accountId: this.client.accountId,
            filter: { notKeyword: "$seen" },
            limit: 0,
            collapseThreads: true,
            calculateTotal: true,
          },
          "0",
        ],
      ]);
      return {
        id: labelId,
        name: "Unread",
        type: "system",
        threadsTotal:
          getResponseData<JMAPQueryResponse>(result.methodResponses[0]).total ??
          0,
      };
    }
    const roles: Record<string, string> = {
      INBOX: "inbox",
      SENT: "sent",
      DRAFT: "drafts",
      TRASH: "trash",
      SPAM: "junk",
      ARCHIVE: "archive",
    };
    const mailbox = roles[labelId]
      ? await this.getMailboxByRole(roles[labelId])
      : await this.getMailboxById(labelId);
    if (!mailbox) return null;

    return {
      id: mailbox.id,
      name: mailbox.name,
      type: mailbox.role ? "system" : "user",
      threadsTotal: mailbox.totalThreads,
    };
  }

  async getLabelByName(name: string): Promise<EmailLabel | null> {
    const mailbox = await this.getMailboxByName(name);
    if (!mailbox) return null;

    return {
      id: mailbox.id,
      name: mailbox.name,
      type: mailbox.role ? "system" : "user",
      threadsTotal: mailbox.totalThreads,
    };
  }

  /**
   * Retrieves a single email message by its ID.
   * @param messageId - The JMAP email ID
   * @returns The parsed email message
   * @throws Error if the message is not found
   */
  async getMessage(messageId: string): Promise<ParsedMessage> {
    const message = (await this.getMessagesBatch([messageId]))[0];
    if (!message) throw new SafeError("Email not found");
    return message;
  }

  async getMessageByRfc822MessageId(
    rfc822MessageId: string,
  ): Promise<ParsedMessage | null> {
    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: { header: ["message-id", rfc822MessageId] },
          limit: 1,
        },
        "0",
      ],
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: [
            "id",
            "threadId",
            "mailboxIds",
            "keywords",
            "from",
            "to",
            "cc",
            "bcc",
            "subject",
            "receivedAt",
            "sentAt",
            "preview",
            "hasAttachment",
            "messageId",
            "inReplyTo",
            "references",
            "replyTo",
            "bodyStructure",
            "bodyValues",
            "textBody",
            "htmlBody",
            "attachments",
          ],
          fetchAllBodyValues: true,
        },
        "1",
      ],
    ]);

    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[1],
    ).list;
    if (emails.length === 0) {
      return null;
    }

    return this.parseJMAPEmail(emails[0]);
  }

  async getSentMessages(maxResults = 20): Promise<ParsedMessage[]> {
    const mailbox = await this.getMailboxByRole("sent");
    if (!mailbox) return [];
    return (
      await this.queryEmails(
        { inMailbox: mailbox.id },
        { maxResults: maxResults },
      )
    ).messages;
  }

  async getInboxMessages(maxResults = 20): Promise<ParsedMessage[]> {
    const mailbox = await this.getMailboxByRole("inbox");
    if (!mailbox) return [];
    return (
      await this.queryEmails(
        { inMailbox: mailbox.id },
        { maxResults: maxResults },
      )
    ).messages;
  }

  async getSentMessageIds(options: {
    maxResults: number;
    after?: Date;
    before?: Date;
    pageToken?: string;
  }): Promise<SentMessagePage> {
    const sentMailbox = await this.getMailboxByRole(FastmailMailbox.SENT);
    if (!sentMailbox) return { messages: [] };

    const position = Number.parseInt(options.pageToken || "0", 10) || 0;
    const filter: Record<string, unknown> = { inMailbox: sentMailbox.id };
    if (options.after) {
      filter.after = options.after.toISOString();
    }
    if (options.before) {
      filter.before = options.before.toISOString();
    }

    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter,
          sort: [{ property: "receivedAt", isAscending: false }],
          limit: options.maxResults,
          position,
          calculateTotal: true,
        },
        "0",
      ],
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: ["id", "threadId"],
        },
        "1",
      ],
    ]);

    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[1],
    ).list;
    const query = getResponseData<JMAPQueryResponse>(
      response.methodResponses[0],
    );
    return {
      messages: emails.map((e) => ({ id: e.id, threadId: e.threadId })),
      nextPageToken: calculateNextPageToken(
        position,
        emails.length,
        options.maxResults,
        query.total,
      ),
    };
  }

  async getSentThreadsExcluding(options: {
    excludeToEmails?: string[];
    excludeFromEmails?: string[];
    maxResults?: number;
  }): Promise<EmailThread[]> {
    const sent = await this.requireMailbox("sent");
    const conditions: Record<string, unknown>[] = [{ inMailbox: sent.id }];
    for (const email of options.excludeToEmails ?? [])
      conditions.push({ operator: "NOT", conditions: [{ to: email }] });
    for (const email of options.excludeFromEmails ?? [])
      conditions.push({ operator: "NOT", conditions: [{ from: email }] });
    const page = await this.queryEmails(
      { operator: "AND", conditions },
      options,
      true,
    );
    return Promise.all(
      page.messages.map((message) => this.getThread(message.threadId)),
    );
  }

  async archiveThread(threadId: string, _ownerEmail: string): Promise<void> {
    await this.archiveMessages(await this.getThreadEmailIds(threadId));
  }

  async archiveThreadWithLabel(
    threadId: string,
    _ownerEmail: string,
    labelId?: string,
  ): Promise<void> {
    await this.archiveMessages(await this.getThreadEmailIds(threadId), labelId);
  }

  async archiveMessage(messageId: string): Promise<void> {
    await this.archiveMessages([messageId]);
  }

  async bulkArchiveFromSenders(
    fromEmails: string[],
    _ownerEmail: string,
    _emailAccountId: string,
  ): Promise<void> {
    await this.moveSendersFromInbox(fromEmails, "archive");
  }

  async bulkTrashFromSenders(
    fromEmails: string[],
    _ownerEmail: string,
    _emailAccountId: string,
  ): Promise<void> {
    await this.moveSendersFromInbox(fromEmails, "trash");
  }

  private async moveSendersFromInbox(
    senders: string[],
    destination: "archive" | "trash",
  ) {
    const inbox = await this.requireMailbox("inbox");
    const target = await this.requireMailbox(destination);
    for (const sender of new Set(senders)) {
      if (!isValidEmail(sender))
        throw new SafeError("Invalid sender email address.");
      let previous = "";
      while (true) {
        const response = await this.client.request([
          [
            "Email/query",
            {
              accountId: this.client.accountId,
              filter: { inMailbox: inbox.id, from: sender },
              limit: this.batchLimit("maxObjectsInSet"),
            },
            "0",
          ],
        ]);
        const ids = getResponseData<JMAPQueryResponse>(
          response.methodResponses[0],
        ).ids;
        if (!ids.length) break;
        const fingerprint = ids.join(",");
        if (previous === fingerprint)
          throw new SafeError(
            "Fastmail did not apply the previous move. Retry after refreshing.",
          );
        previous = fingerprint;
        await this.patchMessages(ids, {
          [`mailboxIds/${inbox.id}`]: null,
          [`mailboxIds/${target.id}`]: true,
        });
      }
    }
  }

  async trashThread(
    threadId: string,
    _ownerEmail: string,
    _actionSource: "user" | "automation",
  ): Promise<void> {
    await this.trashMessages(await this.getThreadEmailIds(threadId));
  }

  async labelMessage({
    messageId,
    labelId,
    labelName,
  }: {
    messageId: string;
    labelId: string;
    labelName: string | null;
  }): Promise<{ usedFallback?: boolean; actualLabelId?: string }> {
    const log = this.logger.with({
      action: "labelMessage",
      messageId,
      labelId,
      labelName,
    });

    try {
      // In JMAP, "labeling" means adding to a mailbox
      await this.client.request([
        [
          "Email/set",
          {
            accountId: this.client.accountId,
            update: {
              [messageId]: {
                [`mailboxIds/${labelId}`]: true,
              },
            },
          },
          "0",
        ],
      ]);

      return {};
    } catch (error) {
      // Only retry with labelName if the error is specifically about invalid/unknown label ID
      // Don't retry on network errors, permission errors, etc.
      const isInvalidLabelError =
        isJMAPErrorType(error, "invalidArguments") ||
        isJMAPErrorType(error, "notFound");

      if (labelName && isInvalidLabelError) {
        log.warn("Label not found by ID, trying by name", {
          labelId,
          labelName,
        });
        const mailbox = await this.getMailboxByName(labelName);
        if (mailbox) {
          await this.client.request([
            [
              "Email/set",
              {
                accountId: this.client.accountId,
                update: {
                  [messageId]: {
                    [`mailboxIds/${mailbox.id}`]: true,
                  },
                },
              },
              "0",
            ],
          ]);

          return { usedFallback: true, actualLabelId: mailbox.id };
        }
      }
      throw error;
    }
  }

  async getDraft(id: string): Promise<ParsedMessage | null> {
    const messages = await this.getMessagesBatch([
      await this.resolveDraftId(id),
    ]);
    return messages[0]?.labelIds?.includes("DRAFT") ? messages[0] : null;
  }

  async deleteDraft(id: string, version?: string): Promise<boolean> {
    const messageId = await this.resolveDraftId(id);
    await this.destroyEmail(messageId, version);
    if (this.emailAccountId)
      await prisma.fastmailDraft.deleteMany({
        where: { emailAccountId: this.emailAccountId, id },
      });
    return true;
  }

  async draftEmail(
    email: ParsedMessage,
    args: Parameters<EmailProvider["draftEmail"]>[1],
    _userEmail: string,
  ) {
    const created = await this.createJmapDraft({
      to: args.to ?? email.headers["reply-to"] ?? email.headers.from,
      cc: args.cc,
      bcc: args.bcc,
      subject: args.subject ?? `Re: ${email.subject ?? ""}`,
      messageHtml: args.content,
      attachments: mailerAttachments(args.attachments),
      replyToEmail: {
        threadId: email.threadId,
        headerMessageId: email.headers["message-id"],
        references: email.headers.references,
      },
    });
    return { draftId: created.id };
  }

  async replyToEmail(
    email: ParsedMessage,
    content: string,
    options?: Parameters<EmailProvider["replyToEmail"]>[2],
  ) {
    return this.sendEmailWithHtml({
      to: email.headers["reply-to"] || email.headers.from,
      subject: `Re: ${email.subject ?? ""}`,
      messageHtml: content,
      from: options?.from,
      replyTo: options?.replyTo,
      attachments: mailerAttachments(options?.attachments),
      replyToEmail: {
        threadId: email.threadId,
        headerMessageId: email.headers["message-id"],
        references: email.headers.references,
      },
    });
  }

  async sendEmail(args: Parameters<EmailProvider["sendEmail"]>[0]) {
    const draft = await this.createJmapDraft(
      {
        ...args,
        messageHtml: "",
        attachments: mailerAttachments(args.attachments),
      },
      args.messageText,
    );
    await this.submitMessage(draft.id);
    return { messageId: draft.id };
  }

  async sendEmailWithHtml(
    body: SendEmailBody,
  ): Promise<{ messageId: string; threadId: string }> {
    const forwarded = body.replyToEmail?.forwardedMessageId
      ? await this.getMessage(body.replyToEmail.forwardedMessageId)
      : undefined;
    const sendBody = {
      ...body,
      attachments: forwarded
        ? [
            ...(await this.downloadAttachments(forwarded)),
            ...(body.attachments ?? []),
          ]
        : body.attachments,
    };
    if (body.providerDraftId) {
      await this.updateDraft(body.providerDraftId, sendBody);
      return this.sendDraft(body.providerDraftId);
    }
    const draft = await this.createJmapDraft(sendBody);
    await this.submitMessage(draft.id, body.from);
    const threadId =
      draft.threadId ?? (await this.getMessage(draft.id)).threadId;
    return { messageId: draft.id, threadId };
  }

  async forwardEmail(
    email: ParsedMessage,
    args: Parameters<EmailProvider["forwardEmail"]>[1],
  ) {
    return this.sendEmailWithHtml({
      ...args,
      subject: `Fwd: ${email.subject ?? ""}`,
      messageHtml: `${args.content ?? ""}<br><br>${email.textHtml ?? escapeHtml(email.textPlain)}`,
      attachments: await this.downloadAttachments(email),
    });
  }

  async markSpam(threadId: string): Promise<void> {
    const junk = await this.requireMailbox("junk");
    const inbox = await this.requireMailbox("inbox");
    await this.patchMessages(await this.getThreadEmailIds(threadId), {
      [`mailboxIds/${junk.id}`]: true,
      [`mailboxIds/${inbox.id}`]: null,
    });
  }

  async markRead(threadId: string): Promise<void> {
    await this.markReadThread(threadId, true);
  }

  async markReadThread(threadId: string, read: boolean): Promise<void> {
    await this.markMessagesReadState(
      await this.getThreadEmailIds(threadId),
      read,
    );
  }

  async blockUnsubscribedEmail(messageId: string): Promise<void> {
    // Archive the message (remove from inbox)
    await this.archiveMessage(messageId);
  }

  async getThreadMessages(threadId: string): Promise<ParsedMessage[]> {
    const thread = await this.getThread(threadId);
    return thread.messages;
  }

  async getThreadMessagesInInbox(threadId: string): Promise<ParsedMessage[]> {
    const inbox = await this.getMailboxByRole(FastmailMailbox.INBOX);
    if (!inbox) return [];

    const messages = await this.getThreadMessages(threadId);
    return messages.filter((m) => m.labelIds?.includes(inbox.id));
  }

  async getPreviousConversationMessages(
    messageIds: string[],
  ): Promise<ParsedMessage[]> {
    return this.getMessagesBatch(messageIds);
  }

  async removeThreadLabel(threadId: string, labelId: string): Promise<void> {
    await this.patchMessages(await this.getThreadEmailIds(threadId), {
      [`mailboxIds/${labelId}`]: null,
    });
  }

  async removeThreadLabels(
    threadId: string,
    labelIds: string[],
  ): Promise<void> {
    if (labelIds.length === 0) return;

    for (const labelId of labelIds) {
      await this.removeThreadLabel(threadId, labelId);
    }
  }

  /**
   * Creates a new mailbox (label/folder) in the Fastmail account.
   * @param name - Display name for the new mailbox
   * @param _description - Unused, for interface compatibility
   * @returns The created email label
   */
  async createLabel(name: string, _description?: string): Promise<EmailLabel> {
    const response = await this.client.request([
      [
        "Mailbox/set",
        {
          accountId: this.client.accountId,
          create: {
            newMailbox: {
              name,
              isSubscribed: true,
            },
          },
        },
        "0",
      ],
    ]);

    const created = getResponseData<
      JMAPSetResponse<{ id: string; threadId?: string }>
    >(response.methodResponses[0]).created?.newMailbox;
    if (!created?.id) {
      throw new Error("Failed to create mailbox");
    }

    // Invalidate cache
    this.mailboxCache = null;

    return {
      id: created.id,
      name,
      type: "user",
    };
  }

  async deleteLabel(labelId: string): Promise<void> {
    await this.client.request([
      [
        "Mailbox/set",
        {
          accountId: this.client.accountId,
          destroy: [labelId],
        },
        "0",
      ],
    ]);

    // Invalidate cache
    this.mailboxCache = null;
  }

  async getOrCreateInboxZeroLabel(key: InboxZeroLabel): Promise<EmailLabel> {
    const labelName = `InboxZero/${key}`;

    // Check cache first
    const cachedId = this.inboxZeroLabels.get(key);
    if (cachedId) {
      const label = await this.getLabelById(cachedId);
      if (label) return label;
    }

    // Try to find existing
    const existing = await this.getLabelByName(labelName);
    if (existing) {
      this.inboxZeroLabels.set(key, existing.id);
      return existing;
    }

    // Create new
    const created = await this.createLabel(labelName);
    this.inboxZeroLabels.set(key, created.id);
    return created;
  }

  async getOriginalMessage(
    originalMessageId: string | undefined,
  ): Promise<ParsedMessage | null> {
    if (!originalMessageId) return null;
    return this.getMessageByRfc822MessageId(originalMessageId);
  }

  async getFiltersList(): Promise<EmailFilter[]> {
    return (await getFastmailFilters(this.requireEmailAccountId())).map(
      (rule) => ({
        id: rule.id,
        criteria: { from: rule.from ?? undefined },
        action: {
          addLabelIds: rule.actions.flatMap((action) =>
            action.type === ActionType.LABEL && action.labelId
              ? [action.labelId]
              : [],
          ),
          removeLabelIds: rule.actions.some(
            (action) => action.type === ActionType.ARCHIVE,
          )
            ? ["INBOX"]
            : [],
        },
      }),
    );
  }

  async createFilter(options: Parameters<EmailProvider["createFilter"]>[0]) {
    const inbox = await this.requireMailbox("inbox");
    if (options.removeLabelIds?.some((id) => id !== inbox.id && id !== "INBOX"))
      throw new SafeError(
        "Fastmail managed filters support archiving and adding labels.",
      );
    await saveFastmailFilter(
      this.requireEmailAccountId(),
      options.from,
      options.addLabelIds ?? [],
      !!options.removeLabelIds?.length,
    );
    return { status: 200 };
  }

  async createAutoArchiveFilter(
    options: Parameters<EmailProvider["createAutoArchiveFilter"]>[0],
  ) {
    const labelId =
      options.gmailLabelId ??
      (options.labelName
        ? await this.getOrCreateFolderIdByName(options.labelName)
        : undefined);
    await saveFastmailFilter(
      this.requireEmailAccountId(),
      options.from,
      labelId ? [labelId] : [],
      true,
    );
    return { status: 200 };
  }

  async deleteFilter(id: string) {
    await deleteFastmailFilter(this.requireEmailAccountId(), id);
    return { status: 200 };
  }

  async getMessagesWithPagination(
    options: Parameters<EmailProvider["getMessagesWithPagination"]>[0],
  ) {
    const conditions: Record<string, unknown>[] = [];
    if (options.query) {
      const cache = await this.ensureMailboxCache();
      conditions.push(
        parseFastmailSearchQuery(options.query, [...cache.byId.values()])
          .filter,
      );
    }
    if (options.after) conditions.push({ after: options.after.toISOString() });
    if (options.before)
      conditions.push({ before: options.before.toISOString() });
    if (options.unreadOnly) conditions.push({ notKeyword: "$seen" });
    if (options.folderId) conditions.push({ inMailbox: options.folderId });
    if (options.inboxOnly)
      conditions.push({ inMailbox: (await this.requireMailbox("inbox")).id });
    if (!options.includeDrafts) conditions.push({ notKeyword: "$draft" });
    return this.queryEmails(
      conditions.length ? { operator: "AND", conditions } : {},
      options,
    );
  }

  async getMessagesFromSender(options: {
    senderEmail: string;
    maxResults?: number;
    pageToken?: string;
    before?: Date;
    after?: Date;
  }) {
    return this.queryEmails(
      {
        from: options.senderEmail,
        ...(options.before ? { before: options.before.toISOString() } : {}),
        ...(options.after ? { after: options.after.toISOString() } : {}),
      },
      options,
    );
  }

  async getThreadsWithParticipant(options: {
    participantEmail: string;
    maxThreads?: number;
  }): Promise<EmailThread[]> {
    const page = await this.queryEmails(
      {
        operator: "OR",
        conditions: [
          { from: options.participantEmail },
          { to: options.participantEmail },
          { cc: options.participantEmail },
        ],
      },
      { maxResults: options.maxThreads ?? 5 },
      true,
    );
    return Promise.all(
      page.messages.map((message) => this.getThread(message.threadId)),
    );
  }

  async getDrafts(options?: { maxResults?: number }): Promise<ParsedMessage[]> {
    const mailbox = await this.getMailboxByRole("drafts");
    if (!mailbox) return [];
    return (
      await this.queryEmails(
        { inMailbox: mailbox.id },
        { maxResults: options?.maxResults ?? 50 },
      )
    ).messages;
  }

  async getMessagesBatch(messageIds: string[]): Promise<ParsedMessage[]> {
    if (!messageIds.length) return [];
    await this.ensureMailboxCache();
    const messages: ParsedMessage[] = [];
    const ids = [...new Set(messageIds)];
    const limit = this.batchLimit("maxObjectsInGet");
    for (let offset = 0; offset < ids.length; offset += limit) {
      const response = await this.client.request([
        [
          "Email/get",
          {
            accountId: this.client.accountId,
            ids: ids.slice(offset, offset + limit),
            properties: [...EMAIL_PROPERTIES],
            fetchAllBodyValues: true,
          },
          "0",
        ],
      ]);
      const result = getResponseData<JMAPGetResponse<JMAPEmail>>(
        response.methodResponses[0],
      );
      messages.push(
        ...result.list.map((email) => ({
          ...this.parseJMAPEmail(email),
          historyId: result.state,
        })),
      );
    }
    return messages;
  }

  getAccessToken(): string {
    return getAccessTokenFromClient(this.client);
  }

  async checkIfReplySent(senderEmail: string): Promise<boolean> {
    const log = this.logger.with({
      action: "checkIfReplySent",
      sender: senderEmail,
    });

    try {
      const sent = await this.getMailboxByRole(FastmailMailbox.SENT);
      if (!sent) return true;

      const response = await this.client.request([
        [
          "Email/query",
          {
            accountId: this.client.accountId,
            filter: {
              inMailbox: sent.id,
              to: senderEmail,
            },
            limit: 1,
          },
          "0",
        ],
      ]);

      const ids = getResponseData<JMAPQueryResponse>(
        response.methodResponses[0],
      ).ids;
      const hasSent = ids.length > 0;
      log.info("Checked for sent reply", { hasSent });
      return hasSent;
    } catch (error) {
      log.error("Error checking if reply was sent", { error });
      return false; // Default to false on error to avoid silently skipping replies
    }
  }

  async countReceivedMessages(
    senderEmail: string,
    threshold: number,
  ): Promise<number> {
    const log = this.logger.with({
      action: "countReceivedMessages",
      sender: senderEmail,
      threshold,
    });

    try {
      const response = await this.client.request([
        [
          "Email/query",
          {
            accountId: this.client.accountId,
            filter: { from: senderEmail },
            limit: threshold,
          },
          "0",
        ],
      ]);

      const ids = getResponseData<JMAPQueryResponse>(
        response.methodResponses[0],
      ).ids;
      const count = ids.length;
      log.info("Received message count", { count });
      return count;
    } catch (error) {
      log.error("Error counting received messages", { error });
      return 0;
    }
  }

  /**
   * Downloads an email attachment by its blob ID.
   * @param messageId - The email message ID (unused, for interface compatibility)
   * @param attachmentId - The JMAP blob ID of the attachment
   * @returns Object with base64-encoded data and size in bytes
   */
  async getAttachment(
    _messageId: string,
    attachmentId: string,
  ): Promise<{ data: string; size: number }> {
    // JMAP uses blob download URL
    const downloadUrl = this.client.session.downloadUrl
      .replace("{accountId}", encodeURIComponent(this.client.accountId))
      .replace("{blobId}", encodeURIComponent(attachmentId))
      .replace("{name}", "attachment")
      .replace("{type}", encodeURIComponent("application/octet-stream"));

    const response = await fetch(downloadUrl, {
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${this.client.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download attachment: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    // Convert ArrayBuffer to base64 using Buffer (efficient O(n) encoding)
    const base64 = Buffer.from(buffer).toString("base64");

    return {
      data: base64,
      size: buffer.byteLength,
    };
  }

  async getThreadsWithQuery(options: {
    query?: ThreadsQuery;
    maxResults?: number;
    pageToken?: string;
  }): Promise<{ threads: EmailThread[]; nextPageToken?: string }> {
    const query = options.query ?? {};
    const page = await this.queryEmails(
      await this.threadFilter(query),
      {
        ...options,
        maxResults: options.maxResults ?? query.limit ?? undefined,
      },
      true,
    );
    return {
      threads: await Promise.all(
        page.messages.map((message) =>
          this.getThread(message.threadId, {
            includeDrafts: query.type === "draft",
          }),
        ),
      ),
      nextPageToken: page.nextPageToken,
    };
  }
  private async threadFilter(
    query: ThreadsQuery,
  ): Promise<Record<string, unknown>> {
    const conditions: Record<string, unknown>[] = [];
    if (query.q) conditions.push({ text: query.q });
    if (query.fromEmail) conditions.push({ from: query.fromEmail });
    if (query.after) conditions.push({ after: query.after.toISOString() });
    if (query.before) conditions.push({ before: query.before.toISOString() });
    if (query.isUnread) conditions.push({ notKeyword: "$seen" });
    if (query.type === "starred") conditions.push({ hasKeyword: "$flagged" });
    const roles: Record<string, string> = {
      inbox: "inbox",
      sent: "sent",
      draft: "drafts",
      trash: "trash",
      spam: "junk",
      archive: "archive",
    };
    if (query.type && roles[query.type]) {
      const mailbox = await this.getMailboxByRole(roles[query.type]);
      if (!mailbox) return { operator: "NOT", conditions: [{}] };
      conditions.push({ inMailbox: mailbox.id });
    }
    for (const id of [
      query.folderId,
      query.labelId,
      ...(query.labelIds ?? []),
    ].filter(Boolean))
      conditions.push(await this.labelCondition(id!));
    if (query.anyLabelIds?.length)
      conditions.push({
        operator: "OR",
        conditions: await Promise.all(
          query.anyLabelIds.map((id) => this.labelCondition(id)),
        ),
      });
    for (const name of query.excludeLabelNames ?? []) {
      const mailbox = await this.getMailboxByName(name);
      if (mailbox)
        conditions.push({
          operator: "NOT",
          conditions: [{ inMailbox: mailbox.id }],
        });
    }
    if (query.anyOf?.length)
      conditions.push({
        operator: "OR",
        conditions: await Promise.all(
          query.anyOf.map(async (leaf) => {
            if (leaf.labelId) return this.labelCondition(leaf.labelId);
            if (leaf.fromEmail) return { from: leaf.fromEmail };
            if (leaf.before) return { before: leaf.before.toISOString() };
            if (leaf.isUnread) return { notKeyword: "$seen" };
            throw new SafeError(
              "Focused inbox categories are unavailable for Fastmail.",
            );
          }),
        ),
      });
    if (query.category || query.inboxSection)
      throw new SafeError(
        "Provider categories are unavailable for Fastmail. Use folder, sender, or unread conditions.",
      );
    for (const split of query.excludeSplits ?? []) {
      const splitQuery = mailSplitToThreadsQuery({
        ...split,
        filters: split.filters.map((filter) => ({
          ...filter,
          value: filter.value ?? null,
        })),
      });
      conditions.push({
        operator: "NOT",
        conditions: [await this.threadFilter(splitQuery)],
      });
    }
    return conditions.length ? { operator: "AND", conditions } : {};
  }

  private async labelCondition(id: string): Promise<Record<string, unknown>> {
    if (id === "UNREAD") return { notKeyword: "$seen" };
    if (id === "STARRED") return { hasKeyword: "$flagged" };
    if (id.startsWith("CATEGORY_"))
      throw new SafeError("Fastmail does not expose provider categories.");
    const role = (
      {
        INBOX: "inbox",
        SENT: "sent",
        DRAFT: "drafts",
        SPAM: "junk",
        TRASH: "trash",
        ARCHIVE: "archive",
      } as Record<string, string>
    )[id];
    if (!role) return { inMailbox: id };
    const mailbox = await this.getMailboxByRole(role);
    return mailbox
      ? { inMailbox: mailbox.id }
      : { operator: "NOT", conditions: [{}] };
  }

  async hasPreviousCommunicationsWithSenderOrDomain(options: {
    from: string;
    date: Date;
    messageId: string;
  }): Promise<boolean> {
    const { from, date } = options;

    // Extract email from "Name <email>" format
    const emailMatch = from.match(/<([^>]+)>/) || [null, from];
    const email = emailMatch[1] || from;
    const domain = email.split("@")[1];

    // Validate domain exists to avoid invalid JMAP filter
    if (!domain) {
      this.logger.trace("Could not extract domain from email address", {
        from,
        email,
      });
      return false;
    }

    // Check for previous emails from this sender before this date
    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: {
            operator: "OR",
            conditions: [
              { from: email, before: date.toISOString() },
              { from: `@${domain}`, before: date.toISOString() },
            ],
          },
          limit: 1,
        },
        "0",
      ],
    ]);

    const ids = getResponseData<JMAPQueryResponse>(
      response.methodResponses[0],
    ).ids;
    return ids.length > 0;
  }

  async getThreadsFromSenderWithSubject(
    sender: string,
    limit: number,
  ): Promise<Array<{ id: string; snippet: string; subject: string }>> {
    const response = await this.client.request([
      [
        "Email/query",
        {
          accountId: this.client.accountId,
          filter: { from: sender },
          sort: [{ property: "receivedAt", isAscending: false }],
          limit,
          collapseThreads: true,
        },
        "0",
      ],
      [
        "Email/get",
        {
          accountId: this.client.accountId,
          "#ids": {
            resultOf: "0",
            name: "Email/query",
            path: "/ids",
          },
          properties: ["id", "threadId", "subject", "preview"],
        },
        "1",
      ],
    ]);

    const emails = getResponseData<JMAPGetResponse<JMAPEmail>>(
      response.methodResponses[1],
    ).list;

    // Dedupe by thread
    const seen = new Set<string>();
    return emails
      .filter((e) => {
        if (seen.has(e.threadId)) return false;
        seen.add(e.threadId);
        return true;
      })
      .map((e) => ({
        id: e.threadId,
        snippet: e.preview || "",
        subject: e.subject || "",
      }));
  }

  /**
   * Get email changes since a given state token.
   * Uses JMAP's Email/changes endpoint for efficient incremental sync.
   * @param sinceState - The state token from the last sync (stored in lastSyncedHistoryId)
   * @returns Object containing new state, arrays of created/updated/destroyed IDs, and hasMoreChanges flag
   */
  async getEmailChanges(sinceState: string | null): Promise<{
    newState: string;
    created: string[];
    updated: string[];
    destroyed: string[];
    hasMoreChanges: boolean;
  }> {
    this.logger.info("Getting email changes", { sinceState });

    // If no previous state, get current state only (first sync)
    if (!sinceState) {
      this.logger.info("No previous state, fetching current state");
      const response = await this.client.request([
        [
          "Email/get",
          {
            accountId: this.client.accountId,
            ids: [],
            properties: ["id"],
          },
          "0",
        ],
      ]);

      const result = getResponseData<JMAPGetResponse<JMAPEmail>>(
        response.methodResponses[0],
      );

      return {
        newState: result.state,
        created: [],
        updated: [],
        destroyed: [],
        hasMoreChanges: false,
      };
    }

    const response = await this.client.request([
      [
        "Email/changes",
        {
          accountId: this.client.accountId,
          sinceState,
          maxChanges: 100, // Limit to avoid overwhelming processing
        },
        "0",
      ],
    ]);

    const changes = getResponseData<JMAPChangesResponse>(
      response.methodResponses[0],
    );

    this.logger.info("Got email changes", {
      created: changes.created.length,
      updated: changes.updated.length,
      destroyed: changes.destroyed.length,
      hasMoreChanges: changes.hasMoreChanges,
    });

    return {
      newState: changes.newState,
      created: changes.created,
      updated: changes.updated,
      destroyed: changes.destroyed,
      hasMoreChanges: changes.hasMoreChanges,
    };
  }

  async processHistory(_options: {
    emailAddress: string;
    historyId?: number;
    startHistoryId?: number;
    subscriptionId?: string;
    resourceData?: {
      id: string;
      conversationId?: string;
    };
    logger?: Logger;
  }): Promise<void> {
    await enqueueFastmailSync(this.requireEmailAccountId());
  }

  async watchEmails(): Promise<{
    expirationDate: Date;
    subscriptionId?: string;
  } | null> {
    // Account discovery in the daemon owns the persistent subscription.
    await enqueueFastmailSync(this.requireEmailAccountId());
    return null;
  }

  async unwatchEmails(_subscriptionId?: string): Promise<void> {
    // Removing the linked account stops its stream at the next daemon refresh.
  }

  isReplyInThread(message: ParsedMessage): boolean {
    // Check if this message has in-reply-to or references headers
    return !!(message.headers["in-reply-to"] || message.headers.references);
  }

  isSentMessage(message: ParsedMessage): boolean {
    // Check if the message is in the sent mailbox by checking the cached mailbox roles
    // Note: This requires the mailbox cache to be populated beforehand
    if (!this.mailboxCache || !message.labelIds) {
      return false;
    }

    // Check if any of the message's labelIds (mailbox IDs) correspond to the sent mailbox
    for (const id of message.labelIds) {
      const mailbox = this.mailboxCache.byId.get(id);
      if (mailbox?.role === FastmailMailbox.SENT) {
        return true;
      }
    }
    return false;
  }

  async getFolders(): Promise<OutlookFolder[]> {
    const cache = await this.ensureMailboxCache();

    // Build folder tree structure
    const rootFolders: OutlookFolder[] = [];
    const folderMap = new Map<string, OutlookFolder>();

    // First pass: create all folder objects
    for (const mailbox of cache.byId.values()) {
      const folder: OutlookFolder = {
        id: mailbox.id,
        displayName: mailbox.name,
        childFolders: [],
        childFolderCount: 0,
      };
      folderMap.set(mailbox.id, folder);
    }

    // Second pass: build tree structure
    for (const mailbox of cache.byId.values()) {
      const folder = folderMap.get(mailbox.id)!;
      if (mailbox.parentId) {
        const parent = folderMap.get(mailbox.parentId);
        if (parent) {
          parent.childFolders.push(folder);
          parent.childFolderCount = parent.childFolders.length;
        } else {
          rootFolders.push(folder);
        }
      } else {
        rootFolders.push(folder);
      }
    }

    return rootFolders;
  }

  async moveThreadToFolder(
    threadId: string,
    _ownerEmail: string,
    folderName: string,
  ): Promise<void> {
    const mailbox = await this.getMailboxByName(folderName);
    if (!mailbox) throw new SafeError("Fastmail folder not found");
    await this.patchMessages(await this.getThreadEmailIds(threadId), {
      mailboxIds: { [mailbox.id]: true },
    });
  }

  async getOrCreateOutlookFolderIdByName(folderName: string): Promise<string> {
    const existing = await this.getMailboxByName(folderName);
    if (existing) return existing.id;

    const created = await this.createLabel(folderName);
    return created.id;
  }

  private async getThreadEmailIds(threadId: string): Promise<string[]> {
    const response = await this.client.request([
      [
        "Thread/get",
        { accountId: this.client.accountId, ids: [threadId] },
        "0",
      ],
    ]);
    return getResponseData<JMAPGetResponse<{ emailIds: string[] }>>(
      response.methodResponses[0],
    ).list.flatMap((thread) => thread.emailIds);
  }

  async getSignatures(): Promise<EmailSignature[]> {
    const response = await this.client.request([
      [
        "Identity/get",
        {
          accountId: this.client.accountId,
        },
        "0",
      ],
    ]);

    const identities = getResponseData<JMAPGetResponse<JMAPIdentity>>(
      response.methodResponses[0],
    ).list;

    return identities.map((identity, index) => ({
      email: identity.email,
      signature: identity.htmlSignature || identity.textSignature || "",
      isDefault: index === 0,
      displayName: identity.name,
    }));
  }
}

function jmapAddresses(value?: string) {
  return splitRecipientList(value ?? "").map((recipient) => {
    const email = extractEmailAddress(recipient);
    if (!email) throw new SafeError("Invalid email recipient");
    return { email, name: extractNameFromEmail(recipient) || undefined };
  });
}

function mailerAttachments(
  attachments?: MailAttachment[],
): SendEmailBody["attachments"] {
  return attachments?.map((attachment) => {
    const content = attachment.content;
    if (typeof content !== "string" && !Buffer.isBuffer(content))
      throw new SafeError("Attachment content must be provided directly.");
    return {
      filename: attachment.filename || "attachment",
      contentType: attachment.contentType ?? "application/octet-stream",
      content: Buffer.isBuffer(content)
        ? content.toString("base64")
        : Buffer.from(
            content,
            attachment.encoding === "base64" ? "base64" : "utf8",
          ).toString("base64"),
      disposition: attachment.cid ? "inline" : "attachment",
      contentId: attachment.cid,
    };
  });
}

function flattenParts(part?: JMAPBodyPart): JMAPBodyPart[] {
  return part ? [part, ...(part.subParts ?? []).flatMap(flattenParts)] : [];
}
