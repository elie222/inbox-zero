import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type {
  ImapFlow,
  FetchMessageObject,
  FetchQueryObject,
  MessageStructureObject,
  MessageAddressObject,
  SearchObject,
} from "imapflow";
import { simpleParser } from "mailparser";
import MailComposer from "nodemailer/lib/mail-composer";
import prisma from "@/utils/prisma";
import type { ICloudMessage } from "@/generated/prisma/client";
import type { ParsedMessage } from "@/utils/types";
import type {
  EmailProvider,
  EmailThread,
  MailboxSyncPage,
} from "@/utils/email/types";
import type { ICloudFolders } from "@/utils/icloud/folders";
import {
  decodeICloudFolderId,
  encodeICloudFolderId,
} from "@/utils/icloud/folders";
import { withICloudClient, assertSafeICloudMove } from "@/utils/icloud/client";
import type { getICloudConnection } from "@/utils/icloud/connection";
import { SafeError } from "@/utils/error";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { extractEmailAddress } from "@/utils/email";
import { mapWithConcurrency } from "@/utils/async";

const MAX_MESSAGE_BYTES = 30 * 1024 * 1024;
const metadataFields: FetchQueryObject = {
  uid: true,
  flags: true,
  envelope: true,
  internalDate: true,
  size: true,
  bodyStructure: true,
  headers: [
    "references",
    "in-reply-to",
    "message-id",
    "reply-to",
    "list-unsubscribe",
    "list-unsubscribe-post",
  ],
};
const systemLabels = {
  inbox: "INBOX",
  sent: "SENT",
  drafts: "DRAFT",
  archive: "ARCHIVE",
  trash: "TRASH",
  junk: "SPAM",
} as const;

export class ICloudProvider implements EmailProvider {
  readonly name = "icloud";
  readonly localMailSyncStrategy = "folder-delta";
  private readonly emailAccountId: string;
  private readonly connection: Awaited<ReturnType<typeof getICloudConnection>>;
  constructor(
    emailAccountId: string,
    connection: Awaited<ReturnType<typeof getICloudConnection>>,
  ) {
    this.emailAccountId = emailAccountId;
    this.connection = connection;
  }
  toJSON() {
    return { name: this.name, type: "ICloudProvider" };
  }
  getAccessToken() {
    return "";
  }
  private run<T>(operation: (client: ImapFlow) => Promise<T>) {
    return withICloudClient(this.connection, operation);
  }
  private role(role: keyof ICloudFolders) {
    const path = this.connection.folders[role];
    if (!path)
      throw new SafeError(
        `Choose the iCloud ${role} folder in Accounts first.`,
      );
    return path;
  }
  private async locate(messageId: string) {
    const row = await prisma.iCloudMessage.findFirst({
      where: {
        id: messageId,
        emailAccountId: this.emailAccountId,
        deletedAt: null,
      },
    });
    if (!row)
      throw new SafeError(
        "This iCloud message is no longer available. Refresh the mailbox.",
        404,
      );
    return row;
  }
  private async inFolder<T>(
    client: ImapFlow,
    row: Pick<ICloudMessage, "folder" | "uidValidity">,
    readOnly: boolean,
    operation: () => Promise<T>,
  ) {
    const lock = await client.getMailboxLock(row.folder, { readOnly });
    try {
      if (
        !client.mailbox ||
        String(client.mailbox.uidValidity) !== row.uidValidity
      )
        throw new SafeError(
          "The iCloud folder changed. Refresh the mailbox before continuing.",
          404,
        );
      return await operation();
    } finally {
      lock.release();
    }
  }
  private async index(
    client: ImapFlow,
    folder: string,
    item: FetchMessageObject,
  ): Promise<ParsedMessage> {
    if (!client.mailbox) throw new SafeError("No iCloud folder selected.");
    const uidValidity = String(client.mailbox.uidValidity);
    const parsed = await simpleParser(
      item.source ?? item.headers ?? Buffer.alloc(0),
    );
    const envelope = item.envelope;
    const messageIdHeader = parsed.messageId ?? envelope?.messageId;
    const references = Array.isArray(parsed.references)
      ? parsed.references
      : parsed.references?.match(/<[^>]+>/g);
    const rootMessageId =
      references?.[0] ??
      parsed.inReplyTo ??
      envelope?.inReplyTo ??
      messageIdHeader;
    const internalDate =
      item.internalDate instanceof Date
        ? item.internalDate
        : new Date(item.internalDate || 0);
    const key = {
      emailAccountId: this.emailAccountId,
      folder,
      uidValidity,
      uid: item.uid,
    };
    // Reserve a destination before copying so a concurrent folder scan cannot
    // create a second identity while the server's COPYUID is being persisted.
    const pendingMoves = await prisma.iCloudMessage.findMany({
      where: { emailAccountId: this.emailAccountId, moveDestination: folder },
    });
    if (pendingMoves.some((move) => !move.moveUid || !move.moveUidValidity))
      throw new SafeError(
        "An iCloud move into this folder is unconfirmed. Check the source and destination before continuing.",
      );
    const moved = pendingMoves.find(
      (move) =>
        move.moveUid === item.uid && move.moveUidValidity === uidValidity,
    );
    const row =
      moved ??
      (await prisma.iCloudMessage.upsert({
        where: { emailAccountId_folder_uidValidity_uid: key },
        create: {
          ...key,
          internalDate,
          messageIdHeader,
          rootMessageId,
          threadId: createHash("sha256")
            .update(rootMessageId ?? `${folder}:${uidValidity}:${item.uid}`)
            .digest("hex"),
        },
        update: { deletedAt: null },
      }));
    const labels: string[] = [];
    for (const [role, path] of Object.entries(this.connection.folders))
      if (path === folder)
        labels.push(systemLabels[role as keyof ICloudFolders]);
    if (!item.flags?.has("\\Seen")) labels.push("UNREAD");
    if (item.flags?.has("\\Flagged")) labels.push("STARRED");
    if (item.flags?.has("\\Draft") && !labels.includes("DRAFT"))
      labels.push("DRAFT");
    const subject = parsed.subject ?? envelope?.subject ?? "";
    const address = (value: MessageAddressObject[] | undefined) =>
      value
        ?.map((entry) => entry.address || "")
        .filter(Boolean)
        .join(", ") ?? "";
    const headers = {
      from: parsed.from?.text ?? address(envelope?.from),
      to:
        (Array.isArray(parsed.to)
          ? parsed.to.map((a) => a.text).join(", ")
          : parsed.to?.text) ?? address(envelope?.to),
      cc:
        (Array.isArray(parsed.cc)
          ? parsed.cc.map((a) => a.text).join(", ")
          : parsed.cc?.text) ?? address(envelope?.cc),
      subject,
      date: (parsed.date ?? internalDate).toISOString(),
      "message-id": messageIdHeader,
      "in-reply-to": parsed.inReplyTo ?? envelope?.inReplyTo,
      references: Array.isArray(parsed.references)
        ? parsed.references.join(" ")
        : parsed.references,
      "reply-to": parsed.replyTo?.text,
      "list-unsubscribe": String(parsed.headers.get("list-unsubscribe") ?? ""),
      "list-unsubscribe-post": String(
        parsed.headers.get("list-unsubscribe-post") ?? "",
      ),
    };
    const attachments = parsed.attachments.map((a, index) => ({
      attachmentId: String(index),
      filename: a.filename ?? "attachment",
      mimeType: a.contentType,
      size: a.size,
      headers: {
        "content-type": a.contentType,
        "content-description": a.filename ?? "",
        "content-transfer-encoding": "base64",
        "content-id": a.contentId ?? "",
      },
    }));
    return {
      id: row.id,
      threadId: row.threadId,
      historyId: String(item.modseq ?? ""),
      date: headers.date,
      internalDate: String(internalDate.getTime()),
      headers,
      subject,
      labelIds: labels,
      parentFolderId: encodeICloudFolderId(folder),
      snippet: (parsed.text ?? "").slice(0, 200),
      ...(item.source
        ? { textPlain: parsed.text, textHtml: parsed.html || undefined }
        : {}),
      attachments: attachments.filter(
        (_, i) => parsed.attachments[i].contentDisposition !== "inline",
      ),
      inline: attachments.filter(
        (_, i) => parsed.attachments[i].contentDisposition === "inline",
      ),
      hasAttachment: item.source
        ? attachments.length > 0
        : hasImapAttachment(item.bodyStructure),
    };
  }
  async getFolders() {
    return this.run(async (client) =>
      (await client.list({ statusQuery: { messages: true, unseen: true } }))
        .filter((folder) => !folder.flags.has("\\Noselect"))
        .map((folder) => ({
          id: encodeICloudFolderId(folder.path),
          displayName: folder.path,
          childFolders: [],
          totalItemCount: folder.status?.messages,
          unreadItemCount: folder.status?.unseen,
          systemType: Object.entries(this.connection.folders).find(
            ([, path]) => path === folder.path,
          )?.[0]
            ? systemLabels[
                Object.entries(this.connection.folders).find(
                  ([, path]) => path === folder.path,
                )![0] as keyof ICloudFolders
              ]
            : undefined,
        })),
    );
  }
  async getFolderCounts() {
    return (await this.getFolders()).map((f) => ({
      id: f.id,
      name: f.displayName,
      total: f.totalItemCount ?? 0,
      unread: f.unreadItemCount ?? 0,
      systemType: f.systemType,
    }));
  }
  async getMessage(messageId: string) {
    const row = await this.locate(messageId);
    return this.run((client) =>
      this.inFolder(client, row, true, async () => {
        const info = await client.fetchOne(
          String(row.uid),
          { uid: true, size: true },
          { uid: true },
        );
        if (!info)
          throw new SafeError(
            "The iCloud message was moved or removed. Refresh the mailbox.",
            404,
          );
        if ((info.size ?? 0) > MAX_MESSAGE_BYTES)
          throw new SafeError("This message is too large to load safely.");
        const item = await client.fetchOne(
          String(row.uid),
          { ...metadataFields, source: true },
          { uid: true },
        );
        if (!item)
          throw new SafeError(
            "The iCloud message is no longer available.",
            404,
          );
        return this.index(client, row.folder, item);
      }),
    );
  }
  async getMessagesBatch(messageIds: string[]) {
    return mapWithConcurrency(messageIds, 3, (id) => this.getMessage(id));
  }
  async getMessagesWithPagination(
    options: Parameters<EmailProvider["getMessagesWithPagination"]>[0],
  ) {
    const folder = options.folderId
      ? decodeICloudFolderId(options.folderId)
      : this.role("inbox");
    if (options.query)
      throw new SafeError("Use iCloud's message search for text queries.");
    const limit = Math.min(Math.max(options.maxResults ?? 50, 1), 100);
    return this.run(async (client) => {
      const lock = await client.getMailboxLock(folder, { readOnly: true });
      try {
        const validity = String(
          client.mailbox ? client.mailbox.uidValidity : "",
        );
        const cursor = options.pageToken
          ? decodePageToken(options.pageToken, folder, validity)
          : null;
        const query: SearchObject = {
          all: true,
          deleted: false,
          ...(options.unreadOnly ? { seen: false } : {}),
          ...(options.after ? { since: options.after } : {}),
          ...(options.before ? { before: options.before } : {}),
          ...(!options.includeDrafts ? { draft: false } : {}),
        };
        const found = await searchICloud(client, query);
        const uids = (found || [])
          .filter((uid) => !cursor || uid < cursor.uid)
          .sort((a, b) => b - a);
        const selected = uids.slice(0, limit);
        const messages: ParsedMessage[] = [];
        if (selected.length)
          for (const item of await client.fetchAll(selected, metadataFields, {
            uid: true,
          }))
            messages.push(await this.index(client, folder, item));
        messages.sort(
          (a, b) => Number(b.internalDate) - Number(a.internalDate),
        );
        return {
          messages,
          nextPageToken:
            uids.length > limit
              ? encodePageToken({ folder, validity, uid: selected.at(-1)! })
              : undefined,
        };
      } finally {
        lock.release();
      }
    });
  }
  async getMailboxSyncPage(
    options: Parameters<EmailProvider["getMailboxSyncPage"]>[0],
  ): Promise<MailboxSyncPage> {
    const folder = options.folderId
      ? decodeICloudFolderId(options.folderId)
      : this.role("inbox");
    return this.run(async (client) => {
      const lock = await client.getMailboxLock(folder, { readOnly: true });
      try {
        const validity = String(
          client.mailbox ? client.mailbox.uidValidity : "",
        );
        let cursor: { folder: string; validity: string; uid: number } | null =
          null;
        try {
          if (options.cursor)
            cursor = decodePageToken(options.cursor, folder, validity);
        } catch {
          return {
            cursor: "",
            reset: true,
            hasMore: false,
            deletedMessageIds: [],
            upsertedMessages: [],
          };
        }
        const found = await searchICloud(client, { all: true, deleted: false });
        const allUids = found || [];
        const known = await prisma.iCloudMessage.findMany({
          where: {
            emailAccountId: this.emailAccountId,
            folder,
          },
          select: {
            id: true,
            uid: true,
            uidValidity: true,
            deletedAt: true,
            moveDestination: true,
          },
        });
        const live = new Set(allUids);
        const removed = known
          .filter(
            (row) =>
              !row.moveDestination &&
              (row.deletedAt ||
                row.uidValidity !== validity ||
                !live.has(row.uid)),
          )
          .map((row) => row.id);
        if (removed.length)
          await prisma.iCloudMessage.updateMany({
            where: {
              id: { in: removed },
              emailAccountId: this.emailAccountId,
              folder,
              moveDestination: null,
              deletedAt: null,
            },
            data: { deletedAt: new Date() },
          });
        const deleted = removed.length
          ? await prisma.iCloudMessage.findMany({
              where: {
                id: { in: removed },
                emailAccountId: this.emailAccountId,
                folder,
                deletedAt: { not: null },
              },
              select: { id: true },
            })
          : [];
        const pending = allUids
          .filter((uid) => uid > (cursor?.uid ?? 0))
          .sort((a, b) => a - b);
        const selected = pending.slice(0, Math.min(options.limit, 100));
        const messages: ParsedMessage[] = [];
        if (selected.length)
          for (const item of await client.fetchAll(selected, metadataFields, {
            uid: true,
          }))
            messages.push(await this.index(client, folder, item));
        const hasMore = pending.length > selected.length;
        return {
          cursor: encodePageToken({
            folder,
            validity,
            uid: hasMore ? selected.at(-1)! : 0,
          }),
          reset: false,
          hasMore,
          deletedMessageIds: deleted.map((row) => row.id),
          upsertedMessages: messages,
        };
      } finally {
        lock.release();
      }
    });
  }
  async getThread(
    threadId: string,
    options?: Parameters<EmailProvider["getThread"]>[1],
  ): Promise<EmailThread> {
    let rows = await prisma.iCloudMessage.findMany({
      where: { emailAccountId: this.emailAccountId, threadId, deletedAt: null },
      orderBy: { internalDate: "asc" },
    });
    if (!rows.length)
      throw new SafeError(
        "This iCloud conversation is no longer available.",
        404,
      );
    const root = rows[0].rootMessageId;
    if (root)
      await this.run(async (client) => {
        for (const folder of (await client.list()).filter(
          (f) => !f.flags.has("\\Noselect"),
        )) {
          const lock = await client.getMailboxLock(folder.path, {
            readOnly: true,
          });
          try {
            const uids = await searchICloud(client, {
              or: [
                { header: { "message-id": root } },
                { header: { references: root } },
                { header: { "in-reply-to": root } },
              ],
            });
            if (uids.length > 500)
              throw new SafeError(
                "This conversation is too large to load in one request.",
              );
            if (Array.isArray(uids) && uids.length)
              for (const item of await client.fetchAll(uids, metadataFields, {
                uid: true,
              }))
                await this.index(client, folder.path, item);
          } finally {
            lock.release();
          }
        }
      });
    rows = await prisma.iCloudMessage.findMany({
      where: { emailAccountId: this.emailAccountId, threadId, deletedAt: null },
      orderBy: { internalDate: "asc" },
    });
    const found = await mapWithConcurrency(rows, 3, async (row) => {
      try {
        return await this.getMessage(row.id);
      } catch (error) {
        if (!(error instanceof SafeError) || error.statusCode !== 404)
          throw error;
        await prisma.iCloudMessage.updateMany({
          where: {
            id: row.id,
            emailAccountId: this.emailAccountId,
            moveDestination: null,
          },
          data: { deletedAt: new Date() },
        });
        return null;
      }
    });
    const messages = found.filter((message) => message !== null);
    const visible = options?.includeDrafts
      ? messages
      : messages.filter((m) => !m.labelIds?.includes("DRAFT"));
    return {
      id: threadId,
      messages: visible,
      snippet: visible.at(-1)?.snippet ?? "",
    };
  }
  async getThreadMessages(threadId: string) {
    return (await this.getThread(threadId)).messages;
  }
  async getThreadMessagesInInbox(threadId: string) {
    return (await this.getThreadMessages(threadId)).filter((m) =>
      m.labelIds?.includes("INBOX"),
    );
  }
  async getLatestMessageInThread(threadId: string) {
    return (await this.getThreadMessages(threadId)).at(-1) ?? null;
  }
  async getLatestMessageFromThreadSnapshot(
    thread: Pick<EmailThread, "id" | "messages">,
  ) {
    return (
      [...thread.messages]
        .filter((m) => !m.labelIds?.includes("DRAFT"))
        .sort((a, b) => Number(a.internalDate) - Number(b.internalDate))
        .at(-1) ?? null
    );
  }
  async getPreviousConversationMessages(ids: string[]) {
    return this.getMessagesBatch(ids);
  }
  async getOriginalMessage(id: string | undefined) {
    return id ? this.getMessage(id) : null;
  }
  isSentMessage(message: ParsedMessage) {
    return Boolean(message.labelIds?.includes("SENT"));
  }
  isReplyInThread(message: ParsedMessage) {
    return Boolean(
      message.headers["in-reply-to"] || message.headers.references,
    );
  }

  private async flags(ids: string[], flag: string, value: boolean) {
    for (const id of ids) {
      const row = await this.locate(id);
      await this.run((client) =>
        this.inFolder(client, row, false, async () => {
          const ok = await (value
            ? client.messageFlagsAdd(String(row.uid), [flag], { uid: true })
            : client.messageFlagsRemove(String(row.uid), [flag], {
                uid: true,
              }));
          if (!ok)
            throw new SafeError("iCloud did not confirm the flag change.");
        }),
      );
    }
  }
  async markMessagesReadState(ids: string[], read: boolean) {
    await this.flags(ids, "\\Seen", read);
  }
  async markMessagesStarredState(ids: string[], starred: boolean) {
    await this.flags(ids, "\\Flagged", starred);
  }
  async starMessage(id: string) {
    await this.markMessagesStarredState([id], true);
  }
  async markReadThread(id: string, read: boolean) {
    await this.markMessagesReadState(
      (await this.getThreadMessages(id)).map((m) => m.id),
      read,
    );
  }
  async markRead(id: string) {
    await this.markReadThread(id, true);
  }

  private async move(id: string, folder: string) {
    let row = await this.locate(id);
    if (row.folder === folder) return;
    await this.run((client) =>
      this.inFolder(client, row, false, async () => {
        assertSafeICloudMove(client);
        if (!client.capabilities.has("UIDPLUS"))
          throw new SafeError(
            "iCloud must support UIDPLUS for safely tracked folder moves.",
          );
        if (!row.moveDestination) {
          const claimed = await prisma.iCloudMessage.updateMany({
            where: {
              id: row.id,
              emailAccountId: this.emailAccountId,
              moveDestination: null,
            },
            data: { moveDestination: folder },
          });
          if (!claimed.count)
            throw new SafeError(
              "A folder move is already in progress for this message.",
            );
          const copy = await client.messageCopy(String(row.uid), folder, {
            uid: true,
          });
          const newUid = copy ? copy.uidMap?.get(row.uid) : undefined;
          if (!copy || !newUid || !copy.uidValidity)
            throw new SafeError(
              "iCloud did not confirm the copy. Check both folders before attempting another move.",
            );
          row = await prisma.iCloudMessage.update({
            where: { id: row.id },
            data: {
              moveUid: newUid,
              moveUidValidity: String(copy.uidValidity),
            },
          });
        }
        if (
          row.moveDestination !== folder ||
          !row.moveUid ||
          !row.moveUidValidity
        )
          throw new SafeError(
            "An earlier folder move is unconfirmed. Check the source and destination folders before continuing.",
          );
        await this.run((destinationClient) =>
          this.inFolder(
            destinationClient,
            { folder, uidValidity: row.moveUidValidity! },
            true,
            async () => {
              const destination = await destinationClient.fetchOne(
                String(row.moveUid),
                { uid: true },
                { uid: true },
              );
              if (!destination)
                throw new SafeError(
                  "The destination copy is no longer available. The source message has been kept.",
                );
            },
          ),
        );
        const source = await client.fetchOne(
          String(row.uid),
          { uid: true },
          { uid: true },
        );
        if (
          source &&
          !(await client.messageDelete(String(row.uid), { uid: true }))
        )
          throw new SafeError(
            "The copied message remains in the source folder. Refresh before retrying.",
          );
        await prisma.iCloudMessage.update({
          where: { id: row.id },
          data: {
            folder,
            uid: row.moveUid,
            uidValidity: row.moveUidValidity,
            moveDestination: null,
            moveUid: null,
            moveUidValidity: null,
            deletedAt: null,
          },
        });
      }),
    );
  }
  async archiveMessages(ids: string[]) {
    for (const id of ids) await this.move(id, this.role("archive"));
  }
  async archiveMessage(id: string) {
    await this.archiveMessages([id]);
  }
  async trashMessages(ids: string[]) {
    for (const id of ids) await this.move(id, this.role("trash"));
  }
  async unarchiveMessages(ids: string[]) {
    for (const id of ids) await this.move(id, this.role("inbox"));
  }
  async untrashMessages(ids: string[]) {
    await this.unarchiveMessages(ids);
  }
  async moveThreadToFolder(id: string, _email: string, folder: string) {
    for (const m of await this.getThreadMessages(id)) {
      if (m.labelIds?.some((label) => label === "SENT" || label === "DRAFT"))
        continue;
      await this.move(
        m.id,
        folder.startsWith("imap:") ? decodeICloudFolderId(folder) : folder,
      );
    }
  }
  async archiveThread(id: string) {
    for (const m of await this.getThreadMessagesInInbox(id))
      await this.archiveMessage(m.id);
  }
  async archiveThreadWithLabel(id: string, _email: string, label?: string) {
    if (label)
      throw new SafeError(
        "iCloud supports folder moves, not label-only actions.",
      );
    await this.archiveThread(id);
  }
  async unarchiveThread(id: string) {
    await this.moveThreadToFolder(id, "", this.role("inbox"));
  }
  async trashThread(id: string) {
    await this.moveThreadToFolder(id, "", this.role("trash"));
  }
  async untrashThread(id: string) {
    await this.unarchiveThread(id);
  }
  async markMessageSpam(messageId: string): Promise<void> {
    await this.move(messageId, this.role("junk"));
  }
  async markSpam(id: string) {
    await this.moveThreadToFolder(id, "", this.role("junk"));
  }
  async markNotSpam(id: string) {
    await this.unarchiveThread(id);
  }
  async bulkArchiveThreads(
    threads: Parameters<EmailProvider["bulkArchiveThreads"]>[0],
  ) {
    const succeededThreadIds: string[] = [],
      failedThreadIds: string[] = [];
    for (const t of threads)
      try {
        await this.archiveMessages(t.messageIds);
        succeededThreadIds.push(t.threadId);
      } catch {
        failedThreadIds.push(t.threadId);
      }
    return { succeededThreadIds, failedThreadIds };
  }
  async getLabels() {
    return [];
  }
  async getLabelById(_id: string) {
    return null;
  }
  async getLabelByName(_name: string) {
    return null;
  }
  async getInboxMessages(maxResults?: number) {
    return (await this.getMessagesWithPagination({ maxResults })).messages;
  }
  async getSentMessages(maxResults?: number) {
    return (
      await this.getMessagesWithPagination({
        folderId: encodeICloudFolderId(this.role("sent")),
        maxResults,
      })
    ).messages;
  }
  async getDrafts(options?: { maxResults?: number }) {
    return (
      await this.getMessagesWithPagination({
        folderId: encodeICloudFolderId(this.role("drafts")),
        maxResults: options?.maxResults,
        includeDrafts: true,
      })
    ).messages;
  }
  async getInboxStats() {
    return this.run(async (client) => {
      const s = await client.status(this.role("inbox"), {
        messages: true,
        unseen: true,
      });
      if (!s) throw new SafeError("iCloud did not return folder counts.");
      return { total: s.messages ?? 0, unread: s.unseen ?? 0 };
    });
  }
  async countMessages(options: { folderId?: string; labelId?: string }) {
    if (options.labelId) return 0;
    return this.run(async (client) => {
      const status = await client.status(
        options.folderId
          ? decodeICloudFolderId(options.folderId)
          : this.role("inbox"),
        { messages: true },
      );
      if (!status) throw new SafeError("iCloud did not return folder counts.");
      return status.messages ?? 0;
    });
  }

  async getSignatures() {
    return [];
  }
  async getContactPhotos() {
    return {};
  }
  async searchContacts() {
    return [];
  }
  async getFiltersList() {
    return [];
  }
  async getForwardingAddresses() {
    return [];
  }
  async watchEmails() {
    return null;
  }
  async unwatchEmails() {}
  async syncLocalMail() {
    return {
      status: "unsupported" as const,
      strategy: "folder-delta" as const,
    };
  }

  async searchMessages(
    options: Parameters<EmailProvider["searchMessages"]>[0] & {
      before?: Date;
      after?: Date;
    },
  ): ReturnType<EmailProvider["searchMessages"]> {
    const search = options.mailboxSearch;
    const role = search?.mailbox ?? options.folder ?? "all";
    const roleKey = role === "spam" ? "junk" : role;
    const folder = options.folderId
      ? decodeICloudFolderId(options.folderId)
      : roleKey !== "all" && roleKey !== "starred"
        ? this.role(roleKey as keyof ICloudFolders)
        : undefined;
    if (options.labelIds?.length || options.labelName)
      throw new SafeError(
        "iCloud search supports folders rather than labels.",
        400,
      );
    const query: SearchObject = {
      all: true,
      deleted: false,
      ...(options.query ? { text: options.query } : {}),
      ...(options.fromEmail ? { from: options.fromEmail } : {}),
      ...(options.after ? { since: options.after } : {}),
      ...(options.before ? { before: options.before } : {}),
      ...(search?.read !== undefined ? { seen: search.read } : {}),
      ...(options.readState ? { seen: options.readState === "read" } : {}),
      ...(search?.starred !== undefined ? { flagged: search.starred } : {}),
      ...(role === "starred" ? { flagged: true } : {}),
      ...(search?.text
        ? {
            [search.text.field === "any" ? "text" : search.text.field]:
              search.text.value,
          }
        : {}),
    };
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          query,
          folder,
          role,
          includeSpamTrash: options.includeSpamTrash,
        }),
      )
      .digest("hex");
    const limit = Math.min(Math.max(options.maxResults ?? 50, 1), 100);
    return this.run(async (client) => {
      const paths = folder
        ? [folder]
        : (await client.list())
            .filter(
              (f) =>
                !f.flags.has("\\Noselect") &&
                (options.includeSpamTrash ||
                  ![
                    this.connection.folders.junk,
                    this.connection.folders.trash,
                  ].includes(f.path)),
            )
            .map((f) => f.path)
            .sort();
      let start = 0;
      let beforeUid: number | undefined;
      let validity: string | undefined;
      if (options.pageToken) {
        const saved = JSON.parse(
          Buffer.from(options.pageToken, "base64url").toString("utf8"),
        );
        if (
          saved.fingerprint !== fingerprint ||
          !Number.isInteger(saved.index) ||
          saved.index < 0 ||
          saved.index >= paths.length ||
          paths[saved.index] !== saved.folder ||
          !Number.isSafeInteger(saved.uid) ||
          saved.uid < 0
        )
          throw new SafeError(
            "This iCloud search changed. Start the search again.",
          );
        start = saved.index;
        beforeUid = saved.uid || undefined;
        validity = saved.validity;
      }
      const messages: ParsedMessage[] = [];
      let nextPageToken: string | undefined;
      for (let index = start; index < paths.length; index++) {
        const path = paths[index];
        const lock = await client.getMailboxLock(path, { readOnly: true });
        try {
          if (!client.mailbox)
            throw new SafeError("The iCloud folder is unavailable.");
          const currentValidity = String(client.mailbox.uidValidity);
          if (index === start && validity && validity !== currentValidity)
            throw new SafeError(
              "The iCloud folder changed. Start the search again.",
            );
          const ids = (await searchICloud(client, query))
            .filter((uid) => index !== start || !beforeUid || uid < beforeUid)
            .sort((a, b) => b - a);
          const selected = ids.slice(0, limit - messages.length);
          if (selected.length)
            for (const item of await client.fetchAll(selected, metadataFields, {
              uid: true,
            }))
              messages.push(await this.index(client, path, item));
          if (messages.length >= limit) {
            const moreInFolder = ids.length > selected.length;
            const nextIndex = moreInFolder ? index : index + 1;
            if (nextIndex < paths.length)
              nextPageToken = Buffer.from(
                JSON.stringify({
                  fingerprint,
                  index: nextIndex,
                  folder: paths[nextIndex],
                  uid: moreInFolder ? selected.at(-1)! : 0,
                  validity: moreInFolder ? currentValidity : undefined,
                }),
              ).toString("base64url");
            break;
          }
        } finally {
          lock.release();
        }
      }
      messages.sort((a, b) => Number(b.internalDate) - Number(a.internalDate));
      return { messages, nextPageToken };
    });
  }
  async searchThreads(options: Parameters<EmailProvider["searchThreads"]>[0]) {
    const result = await this.searchMessages(options);
    return {
      threads: groupMessages(result.messages),
      nextPageToken: result.nextPageToken,
    };
  }
  async getThreads(folderId?: string) {
    return groupMessages(
      (await this.getMessagesWithPagination({ folderId })).messages,
    );
  }
  async getThreadsWithQuery({
    query,
    maxResults,
    pageToken,
  }: {
    query?: ThreadsQuery;
    maxResults?: number;
    pageToken?: string;
  }) {
    if (query?.q)
      return this.searchThreads({ query: query.q, maxResults, pageToken });
    if (
      query?.labelId ||
      query?.labelIds?.length ||
      query?.anyOf?.length ||
      query?.anyLabelIds?.length ||
      query?.excludeSplits?.length ||
      query?.category ||
      query?.inboxSection
    )
      throw new SafeError(
        "This split uses filters that iCloud does not support.",
        400,
      );
    const type = query?.type ?? "inbox";
    const role = type === "spam" ? "junk" : type === "draft" ? "drafts" : type;
    const folderId =
      query?.folderId ??
      encodeICloudFolderId(this.role(role as keyof ICloudFolders));
    const result = await this.getMessagesWithPagination({
      folderId,
      maxResults,
      pageToken,
      after: query?.after ?? undefined,
      before: query?.before ?? undefined,
      unreadOnly: query?.isUnread ?? false,
      includeDrafts: role === "drafts",
    });
    return {
      threads: groupMessages(result.messages),
      nextPageToken: result.nextPageToken,
    };
  }
  async getMessagesFromSender(
    options: Parameters<EmailProvider["getMessagesFromSender"]>[0],
  ) {
    return this.searchMessages({
      query: "",
      fromEmail: options.senderEmail,
      maxResults: options.maxResults,
      pageToken: options.pageToken,
      before: options.before,
      after: options.after,
    });
  }
  async getMessagesWithAttachments(options: {
    maxResults?: number;
    pageToken?: string;
  }) {
    const r = await this.searchMessages({ query: "", ...options });
    return {
      messages: await this.getMessagesBatch(
        r.messages.filter((m) => m.hasAttachment).map((m) => m.id),
      ),
      nextPageToken: r.nextPageToken,
    };
  }
  async getThreadsWithLabel() {
    return [];
  }
  async getThreadsWithParticipant(options: {
    participantEmail: string;
    maxThreads?: number;
  }) {
    return (
      await this.searchThreads({
        query: options.participantEmail,
        maxResults: options.maxThreads,
      })
    ).threads;
  }
  async getThreadsFromSenderWithSubject(sender: string, limit: number) {
    return (
      await this.getMessagesFromSender({
        senderEmail: sender,
        maxResults: limit,
      })
    ).messages.map((m) => ({
      id: m.threadId,
      snippet: m.snippet,
      subject: m.subject,
    }));
  }
  async getMessageByRfc822MessageId(id: string) {
    return this.run(async (client) => {
      for (const folder of (await client.list()).filter(
        (f) => !f.flags.has("\\Noselect"),
      )) {
        const lock = await client.getMailboxLock(folder.path, {
          readOnly: true,
        });
        try {
          const uids = await client.search(
            { header: { "message-id": id } },
            { uid: true },
          );
          if (Array.isArray(uids) && uids.length) {
            const item = await client.fetchOne(
              String(uids[0]),
              metadataFields,
              { uid: true },
            );
            if (item) return this.index(client, folder.path, item);
          }
        } finally {
          lock.release();
        }
      }
      return null;
    });
  }
  async getSentMessageIds(
    options: Parameters<EmailProvider["getSentMessageIds"]>[0],
  ) {
    const r = await this.getMessagesWithPagination({
      folderId: encodeICloudFolderId(this.role("sent")),
      ...options,
    });
    return {
      messages: r.messages.map((m) => ({ id: m.id, threadId: m.threadId })),
      nextPageToken: r.nextPageToken,
    };
  }
  async getSentThreadsExcluding(
    options: Parameters<EmailProvider["getSentThreadsExcluding"]>[0],
  ) {
    return groupMessages(
      (await this.getSentMessages(options.maxResults)).filter(
        (m) =>
          !options.excludeToEmails?.includes(
            extractEmailAddress(m.headers.to),
          ) &&
          !options.excludeFromEmails?.includes(
            extractEmailAddress(m.headers.from),
          ),
      ),
    );
  }
  async countReceivedMessages(sender: string, threshold: number) {
    let count = 0;
    let pageToken: string | undefined;
    do {
      const page = await this.getMessagesFromSender({
        senderEmail: sender,
        maxResults: Math.min(threshold - count, 100),
        pageToken,
      });
      count += page.messages.length;
      pageToken = page.nextPageToken;
    } while (pageToken && count < threshold);
    return count;
  }
  async checkIfReplySent(sender: string) {
    return (
      (
        await this.searchMessages({
          query: sender,
          folderId: encodeICloudFolderId(this.role("sent")),
          maxResults: 1,
        })
      ).messages.length > 0
    );
  }
  async hasPreviousCommunicationsWithSenderOrDomain(options: {
    from: string;
    date: Date;
    messageId: string;
  }) {
    const r = await this.getMessagesFromSender({
      senderEmail: options.from,
      before: options.date,
      maxResults: 100,
    });
    return r.messages.some(
      (m) =>
        m.id !== options.messageId &&
        Number(m.internalDate) < options.date.getTime(),
    );
  }

  async getAttachment(messageId: string, attachmentId: string) {
    const row = await this.locate(messageId);
    return this.run((client) =>
      this.inFolder(client, row, true, async () => {
        const size = await client.fetchOne(
          String(row.uid),
          { size: true },
          { uid: true },
        );
        if (!size || (size.size ?? 0) > MAX_MESSAGE_BYTES)
          throw new SafeError("Attachment unavailable or message too large.");
        const item = await client.fetchOne(
          String(row.uid),
          { source: true },
          { uid: true },
        );
        if (item === false || !item?.source)
          throw new SafeError("Attachment unavailable.");
        if (!/^(0|[1-9]\d*)$/.test(attachmentId))
          throw new SafeError("Invalid attachment.");
        const attachment = (await simpleParser(item.source)).attachments[
          Number(attachmentId)
        ];
        if (!attachment) throw new SafeError("Attachment unavailable.");
        return {
          data: attachment.content.toString("base64"),
          size: attachment.size,
        };
      }),
    );
  }
  async getAttachmentStream(messageId: string, attachmentId: string) {
    const a = await this.getAttachment(messageId, attachmentId);
    return Readable.toWeb(
      Readable.from([Buffer.from(a.data, "base64")]),
    ) as ReadableStream<Uint8Array>;
  }
  async createDraft(params: Parameters<EmailProvider["createDraft"]>[0]) {
    if (params.forwardedMessageId)
      throw new SafeError(
        "Forwarded iCloud attachments are not supported yet.",
      );
    const reply = params.replyToMessageId
      ? await this.getMessage(params.replyToMessageId)
      : null;
    const raw = await new MailComposer({
      from: this.connection.username,
      to: params.to,
      subject: params.subject,
      html: params.messageHtml,
      inReplyTo: reply?.headers["message-id"],
      references: reply
        ? [reply.headers.references, reply.headers["message-id"]]
            .filter(Boolean)
            .join(" ")
        : undefined,
    })
      .compile()
      .build();
    const folder = this.role("drafts");
    return this.run(async (client) => {
      const result = await client.append(folder, raw, ["\\Draft", "\\Seen"]);
      if (result === false || !result.uid || !result.uidValidity)
        throw new SafeError(
          "iCloud did not confirm the draft. Check Drafts before retrying.",
        );
      const lock = await client.getMailboxLock(folder, { readOnly: true });
      try {
        const item = await client.fetchOne(String(result.uid), metadataFields, {
          uid: true,
        });
        if (!item)
          throw new SafeError(
            "The saved draft could not be read. Check Drafts before retrying.",
          );
        return { id: (await this.index(client, folder, item)).id };
      } finally {
        lock.release();
      }
    });
  }
  async draftEmail(
    email: ParsedMessage,
    args: Parameters<EmailProvider["draftEmail"]>[1],
  ) {
    if (args.attachments?.length)
      throw new SafeError("iCloud draft attachments are not supported yet.");
    const d = await this.createDraft({
      to: args.to ?? email.headers["reply-to"] ?? email.headers.from,
      subject: args.subject ?? `Re: ${email.subject}`,
      messageHtml: args.content,
      replyToMessageId: email.id,
    });
    return { draftId: d.id };
  }
  async getDraft(id: string) {
    const m = await this.getMessage(id);
    return m.labelIds?.includes("DRAFT") ? m : null;
  }
  async getDraftReferenceForMessage(id: string) {
    const m = await this.getDraft(id);
    return m ? { id: m.id } : null;
  }
  async deleteDraft(id: string) {
    const d = await this.getDraft(id);
    if (!d) return false;
    await this.trashMessages([id]);
    return true;
  }
  async getDraftAttachments(id: string) {
    const draft = await this.getDraft(id);
    if (!draft) return null;
    return {
      messageId: id,
      attachments: [...(draft.attachments ?? []), ...draft.inline].map((a) => ({
        id: a.attachmentId,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
        disposition: "attachment" as const,
        messageId: id,
        providerAttachmentId: a.attachmentId,
      })),
    };
  }
  async getOrCreateFolderIdByName(name: string) {
    return this.run(async (client) => {
      const folders = await client.list();
      if (!folders.some((f) => f.path === name))
        await client.mailboxCreate(name);
      return encodeICloudFolderId(name);
    });
  }
  async renameFolder() {
    throw new SafeError(
      "Rename iCloud folders in Mail, then update the folder mapping here.",
    );
  }
  async deleteFolder() {
    throw new SafeError("Delete iCloud folders in Mail.");
  }

  addDraftAttachment = unsupportedAttachments;
  removeDraftAttachment = unsupportedAttachments;
  startDraftAttachmentUpload = unsupportedAttachments;
  updateDraft = unsupportedDraftUpdate;
  createLabel = unsupportedLabels;
  deleteLabel = unsupportedLabels;
  updateLabel = unsupportedLabels;
  getOrCreateInboxZeroLabel = unsupportedLabels;
  labelMessage = unsupportedLabels;
  removeThreadLabel = unsupportedLabels;
  removeThreadLabels = unsupportedLabels;
  createFilter = unsupportedFilters;
  createAutoArchiveFilter = unsupportedFilters;
  deleteFilter = unsupportedFilters;
  blockUnsubscribedEmail = unsupportedFilters;
  bulkArchiveFromSenders = unsupportedBulk;
  bulkArchiveSenderOrThrow = unsupportedBulk;
  bulkTrashFromSenders = unsupportedBulk;
  sendEmail = sendingDisabled;
  sendEmailWithHtml = sendingDisabled;
  sendDraft = sendingDisabled;
  replyToEmail = sendingDisabled;
  forwardEmail = sendingDisabled;
}

function encodePageToken(value: {
  folder: string;
  validity: string;
  uid: number;
}) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function decodePageToken(
  value: string,
  folder: string,
  validity: string,
): { folder: string; validity: string; uid: number } {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (
    parsed.folder !== folder ||
    parsed.validity !== validity ||
    !Number.isSafeInteger(parsed.uid) ||
    parsed.uid < 0
  )
    throw new SafeError("The iCloud folder changed. Refresh its contents.");
  return parsed;
}
function groupMessages(messages: ParsedMessage[]): EmailThread[] {
  const grouped = new Map<string, ParsedMessage[]>();
  for (const message of messages)
    grouped.set(message.threadId, [
      ...(grouped.get(message.threadId) ?? []),
      message,
    ]);
  return [...grouped].map(([id, items]) => ({
    id,
    messages: items.sort(
      (a, b) => Number(a.internalDate) - Number(b.internalDate),
    ),
    snippet: items.at(-1)?.snippet ?? "",
  }));
}
async function unsupportedLabels(): Promise<never> {
  throw new SafeError(
    "iCloud supports folder moves, not Gmail-style labels.",
    400,
  );
}
async function unsupportedFilters(): Promise<never> {
  throw new SafeError(
    "iCloud server rules are not available through IMAP.",
    400,
  );
}
async function unsupportedAttachments(): Promise<never> {
  throw new SafeError(
    "Editing iCloud draft attachments is not supported yet.",
    400,
  );
}
async function unsupportedDraftUpdate(): Promise<never> {
  throw new SafeError("Edit saved iCloud drafts in Mail for now.", 400);
}
async function unsupportedBulk(): Promise<never> {
  throw new SafeError(
    "Use explicit message or folder actions for iCloud.",
    400,
  );
}
async function sendingDisabled(): Promise<never> {
  throw new SafeError(
    "Sending from iCloud is disabled. Use Mail to review and send drafts.",
  );
}

function hasImapAttachment(part: MessageStructureObject | undefined): boolean {
  if (!part) return false;
  if (
    part.disposition?.toLowerCase() === "attachment" ||
    part.dispositionParameters?.filename ||
    part.parameters?.name
  )
    return true;
  return part.childNodes?.some(hasImapAttachment) ?? false;
}

async function searchICloud(
  client: ImapFlow,
  query: SearchObject,
): Promise<number[]> {
  const result = await client.search(query, { uid: true });
  if (!Array.isArray(result))
    throw new SafeError("iCloud could not complete the mailbox search.");
  return result;
}
