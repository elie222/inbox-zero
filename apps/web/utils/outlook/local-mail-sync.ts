import { redis } from "@/utils/redis";
import { WELL_KNOWN_FOLDERS } from "@/utils/outlook/constants";
import { RetryHandlerOptions } from "@microsoft/microsoft-graph-client";
import type { MailFolder, Message } from "@microsoft/microsoft-graph-types";
import { z } from "zod";
import { toLocalMailMessage } from "@/utils/email/local-mail-sync";
import type { Logger } from "@/utils/logger";
import { extractErrorInfo } from "@/utils/microsoft/retry";
import {
  LocalMailSyncPausedError,
  withLocalMailSyncBudget,
} from "@/utils/email/local-mail-sync-budget";
import type { OutlookClient } from "@/utils/outlook/client-types";
import { convertMessage } from "@/utils/outlook/message";

const metadataFields = [
  "id",
  "conversationId",
  "conversationIndex",
  "internetMessageId",
  "subject",
  "bodyPreview",
  "from",
  "toRecipients",
  "ccRecipients",
  "receivedDateTime",
  "lastModifiedDateTime",
  "changeKey",
  "isDraft",
  "isRead",
  "flag",
  "categories",
  "parentFolderId",
  "webLink",
  "hasAttachments",
] as const;
const folderFields = [
  "id",
  "parentFolderId",
  "displayName",
  "childFolderCount",
  "isHidden",
  "totalItemCount",
  "unreadItemCount",
] as const;
const cursorSchema = z.object({
  version: z.literal(1),
  provider: z.literal("microsoft"),
  emailAccountId: z.string().min(1),
  phase: z.enum(["folders", "changes", "backfill"]),
  folderId: z.string().min(1).optional(),
  after: z.number().int().optional(),
  before: z.number().int().optional(),
  link: z.string().url(),
});
const categoryCacheSchema = z.object({
  entries: z.array(z.tuple([z.string().min(1), z.string().min(1)])),
  nextLink: z.string().optional(),
});
type Cursor = z.infer<typeof cursorSchema>;
type BaseInput = {
  client: OutlookClient;
  logger: Logger;
  emailAccountId: string;
  limit: number;
  priority?: "backfill" | "current";
};
type FolderInput = BaseInput & {
  folderId: string;
  folderIds: Record<string, string>;
  cursor?: string;
};
type MetadataPatch = Pick<Message, (typeof metadataFields)[number]> & {
  id: string;
  internalDate?: string | null;
  // Uses the ordinary provider name fallback only after a complete catalog lookup.
  categoryIds?: string[];
};
type DeltaMessage = Message & { "@removed"?: { reason?: string } };
type Page<T> = {
  value: T[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
};

export async function resolveOutlookLocalMailFolderIds(
  input: Pick<BaseInput, "client" | "emailAccountId">,
) {
  if (!input.emailAccountId)
    throw new Error("Outlook local mail identity is required");
  const folderIds: Record<string, string> = {};
  for (const name of Object.keys(WELL_KNOWN_FOLDERS)) {
    const key = `local-mail-folder-id:${input.emailAccountId}:${name}`;
    let cached: { id: string | null } | null;
    try {
      cached = await redis.get<{ id: string | null }>(key);
    } catch {
      throw new LocalMailSyncPausedError();
    }
    if (!cached) {
      try {
        const folder = await withLocalMailSyncBudget(
          {
            emailAccountId: input.emailAccountId,
            provider: "microsoft",
            priority: "current",
            cost: 1,
          },
          (signal) =>
            input.client
              .getClient()
              .api(`/me/mailFolders/${name}`)
              .select("id")
              .header("Prefer", 'IdType="ImmutableId"')
              .options({ signal })
              .middlewareOptions([new RetryHandlerOptions(0, 0)])
              .get() as Promise<MailFolder>,
        );
        if (!folder.id)
          throw new Error("Outlook returned a folder without an ID");
        cached = { id: folder.id };
      } catch (error) {
        if (
          extractErrorInfo(error).status !== 404 ||
          ["drafts", "deleteditems", "junkemail"].includes(name)
        )
          throw error;
        cached = { id: null };
      }
      // Persist each completed lookup so throttled setup resumes without replay.
      try {
        await redis.set(key, cached, { ex: 86_400 });
      } catch {
        throw new LocalMailSyncPausedError();
      }
    }
    if (typeof cached.id === "string" && cached.id) folderIds[name] = cached.id;
  }
  if (!["drafts", "deleteditems", "junkemail"].every((name) => folderIds[name]))
    throw new Error("Outlook excluded folder identities are unavailable");
  return folderIds;
}

export async function getOutlookMailFoldersPage(
  input: BaseInput & { parentFolderId?: string; cursor?: string },
) {
  validateInput(input);
  const checkpoint = {
    version: 1 as const,
    provider: "microsoft" as const,
    emailAccountId: input.emailAccountId,
    phase: "folders" as const,
    folderId: input.parentFolderId,
  };
  const link = input.cursor
    ? decodeCursor(input.cursor, checkpoint).link
    : undefined;
  const path = input.parentFolderId
    ? `/me/mailFolders/${encodeURIComponent(input.parentFolderId)}/childFolders`
    : "/me/mailFolders";
  const response = await withLocalMailSyncBudget<Page<MailFolder>>(
    {
      ...input,
      provider: "microsoft",
      cost: 1,
      priority: input.priority ?? "backfill",
    },
    (signal) => {
      const request = input.client
        .getClient()
        .api(link ?? path)
        .header(
          "Prefer",
          `IdType="ImmutableId", odata.maxpagesize=${input.limit}`,
        );
      if (!link)
        request
          .select(folderFields.join(","))
          .top(input.limit)
          .query({ includeHiddenFolders: "true" });
      return request
        .options({ signal })
        .middlewareOptions([new RetryHandlerOptions(0, 0)])
        .get();
    },
  );
  validatePage(response);
  const folders = response.value.map((folder) => {
    if (!folder.id) throw new Error("Outlook returned a folder without an ID");
    return {
      id: folder.id,
      parentFolderId: folder.parentFolderId,
      displayName: folder.displayName,
      childFolderCount: folder.childFolderCount,
      isHidden: folder.isHidden,
      totalItemCount: folder.totalItemCount,
      unreadItemCount: folder.unreadItemCount,
    };
  });
  return {
    folders,
    nextCursor: response["@odata.nextLink"]
      ? encodeCursor({ ...checkpoint, link: response["@odata.nextLink"] })
      : undefined,
  };
}

export async function getOutlookMailFolderChangesPage(input: FolderInput) {
  validateInput(input);
  validateFolder(input);
  const checkpoint = {
    version: 1 as const,
    provider: "microsoft" as const,
    emailAccountId: input.emailAccountId,
    phase: "changes" as const,
    folderId: input.folderId,
  };
  const link = input.cursor
    ? decodeCursor(input.cursor, checkpoint).link
    : undefined;
  let response: Page<DeltaMessage>;
  try {
    response = await withLocalMailSyncBudget<Page<DeltaMessage>>(
      {
        ...input,
        provider: "microsoft",
        cost: 1,
        priority: input.priority ?? "current",
      },
      (signal) => {
        const request = input.client
          .getClient()
          .api(
            link ??
              `/me/mailFolders/${encodeURIComponent(input.folderId)}/messages/delta`,
          )
          .header(
            "Prefer",
            `IdType="ImmutableId", odata.maxpagesize=${input.limit}`,
          );
        // A date-filtered delta silently caps coverage at 5,000 messages.
        if (!link) request.select(metadataFields.join(",")).top(input.limit);
        return request
          .options({ signal })
          .middlewareOptions([new RetryHandlerOptions(0, 0)])
          .get();
      },
    );
  } catch (error) {
    if (!isExpiredState(error)) throw error;
    return { resetRequired: true as const };
  }
  validatePage(response);
  const nextLink = response["@odata.nextLink"];
  const deltaLink = response["@odata.deltaLink"];
  if ((!nextLink && !deltaLink) || (nextLink && deltaLink))
    throw new Error("Outlook delta response omitted an unambiguous cursor");
  const cursor = encodeCursor({
    ...checkpoint,
    link: (nextLink ?? deltaLink)!,
  });
  const categoryMap = await resolveLocalMailCategories(
    { ...input, priority: input.priority ?? "current" },
    response.value.filter((message) => !message["@removed"]),
  );
  const messages: MetadataPatch[] = [];
  const removed = new Set<string>();
  for (const message of response.value) {
    if (!message.id)
      throw new Error("Outlook returned a sync row without a message ID");
    if (message["@removed"]) removed.add(message.id);
    else messages.push(metadataPatch(message, categoryMap));
  }
  return {
    resetRequired: false as const,
    messages,
    removedMessageIds: [...removed],
    // A folder removal can be a move; the caller must resolve conflicting events.
    requiresReconciliationMessageIds: [
      ...new Set(
        messages
          .filter((message) => removed.has(message.id))
          .map((message) => message.id),
      ),
    ],
    attachmentMetadataAvailable: false as const,
    cursor,
    hasMore: Boolean(nextLink),
  };
}

export async function getOutlookMailBackfillPage(
  input: FolderInput & { after: Date; before: Date },
) {
  validateInput(input);
  validateFolder(input);
  const after = input.after.getTime();
  const before = input.before.getTime();
  if (!Number.isFinite(after) || !Number.isFinite(before) || before <= after)
    throw new Error("Invalid Outlook local mail bounds");
  const checkpoint = {
    version: 1 as const,
    provider: "microsoft" as const,
    emailAccountId: input.emailAccountId,
    phase: "backfill" as const,
    folderId: input.folderId,
    after,
    before,
  };
  const link = input.cursor
    ? decodeCursor(input.cursor, checkpoint).link
    : undefined;
  let response: Page<Message>;
  try {
    response = await withLocalMailSyncBudget<Page<Message>>(
      {
        ...input,
        provider: "microsoft",
        cost: 1,
        priority: input.priority ?? "backfill",
      },
      (signal) => {
        const request = input.client
          .getClient()
          .api(
            link ??
              `/me/mailFolders/${encodeURIComponent(input.folderId)}/messages`,
          )
          .header(
            "Prefer",
            `IdType="ImmutableId", odata.maxpagesize=${input.limit}`,
          );
        if (!link)
          request
            .select([...metadataFields, "body"].join(","))
            .filter(dateFilter(after, before))
            .orderby("receivedDateTime desc")
            .top(input.limit);
        return request
          .options({ signal })
          .middlewareOptions([new RetryHandlerOptions(0, 0)])
          .get();
      },
    );
  } catch (error) {
    if (!isExpiredState(error)) throw error;
    return { resetRequired: true as const };
  }
  validatePage(response);
  const retained = response.value.filter((message) => {
    const timestamp = messageTimestamp(message);
    return (
      timestamp >= after &&
      timestamp < before &&
      !message.isDraft &&
      !isExcludedFolder(message.parentFolderId, input.folderIds)
    );
  });
  const categoryMap = await resolveLocalMailCategories(
    { ...input, priority: input.priority ?? "backfill" },
    retained,
  );
  const messages = retained.map((message) =>
    bodyMessage(message, { ...input, categoryMap }),
  );
  return {
    resetRequired: false as const,
    messages,
    nextCursor: response["@odata.nextLink"]
      ? encodeCursor({ ...checkpoint, link: response["@odata.nextLink"] })
      : undefined,
  };
}

export async function getOutlookLocalMailMessage(
  input: Omit<FolderInput, "folderId" | "cursor" | "limit"> & {
    messageId: string;
  },
) {
  if (!input.emailAccountId || !input.messageId)
    throw new Error("Outlook local mail identity is required");
  let message: Message;
  try {
    message = await withLocalMailSyncBudget<Message>(
      {
        ...input,
        provider: "microsoft",
        cost: 1,
        priority: input.priority ?? "current",
      },
      (signal) =>
        input.client
          .getClient()
          .api(`/me/messages/${encodeURIComponent(input.messageId)}`)
          .select([...metadataFields, "body"].join(","))
          .header("Prefer", 'IdType="ImmutableId"')
          .options({ signal })
          .middlewareOptions([new RetryHandlerOptions(0, 0)])
          .get(),
    );
  } catch (error) {
    if (extractErrorInfo(error).status !== 404) throw error;
    return { status: "notFound" as const };
  }
  if (message.id !== input.messageId)
    throw new Error("Outlook returned an unexpected message ID");
  // Backfill retains neither drafts nor the excluded folders, so a message that
  // moved into one is gone as far as local mail is concerned.
  if (
    message.isDraft ||
    isExcludedFolder(message.parentFolderId, input.folderIds)
  )
    return { status: "notFound" as const };
  const categoryMap = await resolveLocalMailCategories(
    { ...input, priority: input.priority ?? "current" },
    [message],
  );
  return {
    status: "found" as const,
    ...bodyMessage(message, { ...input, categoryMap }),
  };
}

async function resolveLocalMailCategories(
  input: Pick<BaseInput, "client" | "emailAccountId" | "priority">,
  messages: Message[],
) {
  const names = new Set(
    messages.flatMap((message) => message.categories ?? []),
  );
  if (!names.size) return new Map<string, string>();
  const key = `local-mail-categories:${input.emailAccountId}`;
  let cached: z.infer<typeof categoryCacheSchema> | null;
  try {
    const value = await redis.get(key);
    cached = value === null ? null : categoryCacheSchema.parse(value);
  } catch {
    throw new LocalMailSyncPausedError();
  }
  let categoryMap = new Map(cached?.entries);
  if (cached && !cached.nextLink) {
    if ([...names].every((name) => categoryMap.has(name))) return categoryMap;
    // Newly assigned categories can precede the shared catalog cache expiry.
    cached = null;
    categoryMap = new Map();
  }
  const link = cached?.nextLink;
  if (link) validateCategoryLink(link);
  const response = await withLocalMailSyncBudget<
    Page<{ id?: string; displayName?: string }>
  >(
    {
      emailAccountId: input.emailAccountId,
      provider: "microsoft",
      priority: input.priority ?? "current",
      cost: 1,
    },
    (signal) => {
      const request = input.client
        .getClient()
        .api(link ?? "/me/outlook/masterCategories");
      if (!link) request.select("id,displayName").top(100);
      return request
        .options({ signal })
        .middlewareOptions([new RetryHandlerOptions(0, 0)])
        .get();
    },
  );
  validatePage(response);
  for (const category of response.value) {
    if (
      typeof category.id !== "string" ||
      !category.id ||
      typeof category.displayName !== "string" ||
      !category.displayName ||
      (categoryMap.has(category.displayName) &&
        categoryMap.get(category.displayName) !== category.id)
    )
      throw new Error("Outlook category identities are unavailable");
    categoryMap.set(category.displayName, category.id);
  }
  const nextLink = response["@odata.nextLink"];
  if (nextLink) validateCategoryLink(nextLink);
  else {
    // Match ordinary provider reads for categories absent from a complete catalog.
    // Cache misses until expiry so an orphaned name cannot refetch every page.
    for (const name of names)
      if (!categoryMap.has(name)) categoryMap.set(name, name);
  }
  try {
    await redis.set(
      key,
      { entries: [...categoryMap], ...(nextLink ? { nextLink } : {}) },
      { ex: 300 },
    );
  } catch {
    throw new LocalMailSyncPausedError();
  }
  // One catalog page per operation preserves quota admission and resumability.
  if (nextLink) throw new LocalMailSyncPausedError(1000);
  return categoryMap;
}

function validateCategoryLink(link: string) {
  const url = new URL(link);
  if (
    url.origin !== "https://graph.microsoft.com" ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname.toLowerCase() !== "/v1.0/me/outlook/mastercategories"
  )
    throw new Error("Invalid Outlook category cursor");
  for (const [key, value] of url.searchParams) {
    if (["$skiptoken", "$skip"].includes(key) && value) continue;
    if (
      key === "$top" &&
      /^\d+$/.test(value) &&
      Number(value) >= 1 &&
      Number(value) <= 100
    )
      continue;
    if (
      key === "$select" &&
      value.split(",").sort().join(",") === "displayName,id"
    )
      continue;
    throw new Error("Invalid Outlook category cursor");
  }
  if (!url.searchParams.has("$skiptoken") && !url.searchParams.has("$skip"))
    throw new Error("Invalid Outlook category cursor");
}

function metadataPatch(
  message: Message,
  categoryMap: Map<string, string>,
): MetadataPatch {
  if (!message.id)
    throw new Error("Outlook returned a sync row without a message ID");
  const patch = Object.fromEntries(
    metadataFields.flatMap((field) =>
      message[field] === undefined ? [] : [[field, message[field]]],
    ),
  ) as Pick<Message, (typeof metadataFields)[number]>;
  const result: MetadataPatch = { ...patch, id: message.id };
  if (message.categories !== undefined)
    result.categoryIds = (message.categories ?? []).map((name) => {
      const id = categoryMap.get(name);
      if (!id) throw new Error("Outlook category identities are unavailable");
      return id;
    });
  if (message.receivedDateTime === null) result.internalDate = null;
  else if (message.receivedDateTime !== undefined)
    result.internalDate = String(messageTimestamp(message));
  return result;
}
function bodyMessage(
  message: Message,
  input: {
    folderIds: Record<string, string>;
    categoryMap?: Map<string, string>;
  },
) {
  if (!message.id)
    throw new Error("Outlook returned a sync row without a message ID");
  const converted = convertMessage(message, input.folderIds, input.categoryMap);
  const content = message.body?.content ?? undefined;
  const type = message.body?.contentType?.toLowerCase();
  return {
    message: toLocalMailMessage({
      ...converted,
      internalDate: String(messageTimestamp(message)),
      textPlain: type === "text" ? content : undefined,
      textHtml: type === "html" ? content : undefined,
      attachments: undefined,
      inline: [],
    }),
    changeKey: message.changeKey ?? undefined,
    hasAttachments: message.hasAttachments ?? undefined,
    attachmentMetadataAvailable: false as const,
  };
}
function messageTimestamp(message: Message) {
  const timestamp = message.receivedDateTime
    ? Date.parse(message.receivedDateTime)
    : Number.NaN;
  if (!Number.isFinite(timestamp))
    throw new Error("Outlook returned an invalid sync message date");
  return timestamp;
}
function validateInput(input: BaseInput) {
  if (
    !input.emailAccountId ||
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100
  )
    throw new Error(
      "Outlook local mail requires account identity and a limit between 1 and 100",
    );
}
function validateFolder(input: FolderInput) {
  if (
    ["drafts", "junkemail", "deleteditems"].some(
      (name) => !input.folderIds[name],
    )
  )
    throw new Error("Outlook excluded folder identities are unavailable");
  if (!input.folderId || isExcludedFolder(input.folderId, input.folderIds))
    throw new Error("Outlook local mail folder is outside retained scope");
}
function isExcludedFolder(
  folderId: string | null | undefined,
  folderIds: Record<string, string>,
) {
  return Boolean(
    folderId &&
      [folderIds.drafts, folderIds.junkemail, folderIds.deleteditems].includes(
        folderId,
      ),
  );
}
function isExpiredState(error: unknown) {
  const { status, code } = extractErrorInfo(error);
  return (
    status === 410 ||
    code === "SyncStateNotFound" ||
    code === "resyncRequired" ||
    code === "ErrorInvalidSyncStateData"
  );
}
function dateFilter(after: number, before: number) {
  if (after === -8_640_000_000_000_000)
    return `receivedDateTime lt ${new Date(before).toISOString()}`;
  return `receivedDateTime ge ${new Date(after).toISOString()} and receivedDateTime lt ${new Date(before).toISOString()}`;
}
function encodeCursor(cursor: Cursor) {
  validateLink(cursor);
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
function decodeCursor(value: string, expected: Omit<Cursor, "link">) {
  try {
    const cursor = cursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    if (
      cursor.emailAccountId !== expected.emailAccountId ||
      cursor.phase !== expected.phase ||
      cursor.folderId !== expected.folderId ||
      cursor.after !== expected.after ||
      cursor.before !== expected.before
    )
      throw new Error("scope mismatch");
    validateLink(cursor);
    return cursor;
  } catch {
    throw new Error("Invalid Outlook local mail cursor");
  }
}
function validateLink(cursor: Cursor) {
  const url = new URL(cursor.link);
  const invalid = () => {
    throw new Error("Invalid Outlook local mail cursor");
  };
  if (
    url.origin !== "https://graph.microsoft.com" ||
    url.username ||
    url.password ||
    url.hash
  )
    invalid();
  const suffix =
    cursor.phase === "folders"
      ? "childFolders"
      : cursor.phase === "changes"
        ? "messages/delta"
        : "messages";
  if (cursor.phase === "folders" && cursor.folderId === undefined) {
    if (!/^\/v1\.0\/me\/mailFolders$/i.test(url.pathname)) invalid();
  } else {
    const match =
      /^\/v1\.0\/me\/mailFolders(?:\/([^/]+)|\('([^']+)'\))\/(.+)$/i.exec(
        url.pathname,
      );
    if (
      !match ||
      decodeURIComponent(match[1] ?? match[2]!) !== cursor.folderId ||
      match[3]?.toLowerCase() !== suffix.toLowerCase()
    )
      invalid();
  }
  const fields =
    cursor.phase === "folders"
      ? folderFields
      : cursor.phase === "backfill"
        ? [...metadataFields, "body"]
        : metadataFields;
  for (const [key, value] of url.searchParams) {
    if (["$skiptoken", "$deltatoken", "$skip"].includes(key)) {
      if (!value) invalid();
    } else if (key === "$top") {
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100)
        invalid();
    } else if (key === "$select") {
      if (value.split(",").sort().join(",") !== [...fields].sort().join(","))
        invalid();
    } else if (key === "$filter" && cursor.phase === "backfill") {
      if (value !== dateFilter(cursor.after!, cursor.before!)) invalid();
    } else if (key === "$orderby" && cursor.phase === "backfill") {
      if (value !== "receivedDateTime desc") invalid();
    } else if (key === "includeHiddenFolders" && cursor.phase === "folders") {
      if (value !== "true") invalid();
    } else invalid();
  }
  if (cursor.phase === "changes") {
    if (
      !url.searchParams.has("$skiptoken") &&
      !url.searchParams.has("$deltatoken")
    )
      invalid();
  } else if (
    !url.searchParams.has("$skiptoken") &&
    !url.searchParams.has("$skip")
  )
    invalid();
}
function validatePage<T>(response: Page<T>) {
  if (!Array.isArray(response.value))
    throw new Error("Outlook local mail response omitted its records");
}
