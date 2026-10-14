import { createHash } from "node:crypto";
import type { gmail_v1 } from "@googleapis/gmail";
import type { ImapFlow } from "imapflow";
import addressparser from "nodemailer/lib/addressparser";
import { z } from "zod";
import {
  observationSchema,
  type Observation,
  type ObservationState,
} from "./changes";

export const googleStateSchema = z.object({
  historyId: z.string().optional(),
  pageToken: z.string().optional(),
  newMessages: z.record(z.string(), z.number()).default({}),
  checkpointAt: z.number().optional(),
  pageStartedAt: z.number().optional(),
  queued: z
    .record(
      z.string(),
      z.array(
        z.object({
          added: z.array(z.string()),
          removed: z.array(z.string()),
          beforeAt: z.number(),
        }),
      ),
    )
    .default({}),
});
export const imapStateSchema = z.object({
  catalog: z.string().optional(),
  folders: z
    .record(
      z.string(),
      z.object({
        validity: z.string(),
        messages: z.record(z.string(), observationSchema),
      }),
    )
    .default({}),
});

export async function readGoogleCorrections({
  api,
  state,
  observations,
  targets,
  now,
}: {
  api: gmail_v1.Gmail;
  state: z.infer<typeof googleStateSchema>;
  observations: ObservationState;
  targets: Record<string, string>;
  now: number;
}) {
  if (!state.historyId) {
    state.historyId =
      (
        await api.users.getProfile(
          { userId: "me" },
          { timeout: 20_000, retry: false },
        )
      ).data.historyId ?? undefined;
    if (!state.historyId) throw new Error("Google history checkpoint missing");
    state.checkpointAt = now;
    return { reset: true, current: [] as Observation[] };
  }
  {
    let history: gmail_v1.Schema$ListHistoryResponse;
    try {
      history = (
        await api.users.history.list(
          {
            userId: "me",
            startHistoryId: state.historyId,
            pageToken: state.pageToken,
            maxResults: 100,
          },
          { timeout: 20_000, retry: false },
        )
      ).data;
    } catch (error) {
      if ((error as { code?: number }).code !== 404) throw error;
      state.historyId = undefined;
      state.pageToken = undefined;
      state.queued = {};
      state.newMessages = {};
      return readGoogleCorrections({ api, state, observations, targets, now });
    }
    const beforeAt = state.pageStartedAt ?? state.checkpointAt ?? now;
    for (const record of history.history ?? []) {
      for (const item of record.messagesAdded ?? [])
        if (item.message?.id) {
          state.newMessages[item.message.id] = now;
          state.queued[item.message.id] ??= [];
        }
      const ids = new Set(
        [...(record.labelsAdded ?? []), ...(record.labelsRemoved ?? [])]
          .filter((event) =>
            event.labelIds?.some(
              (id) => targets[id] || id === "UNREAD" || id === "STARRED",
            ),
          )
          .map((event) => event.message?.id)
          .filter((id): id is string => !!id),
      );
      for (const id of ids) {
        const added = (record.labelsAdded ?? [])
          .filter((e) => e.message?.id === id)
          .flatMap((e) => e.labelIds ?? []);
        const removed = (record.labelsRemoved ?? [])
          .filter((e) => e.message?.id === id)
          .flatMap((e) => e.labelIds ?? []);
        state.queued[id] = [
          ...(state.queued[id] ?? []),
          { added, removed, beforeAt },
        ];
      }
    }
    state.pageToken = history.nextPageToken ?? undefined;
    if (!state.pageToken && history.historyId)
      state.historyId = history.historyId;
    state.pageStartedAt = state.pageToken ? beforeAt : undefined;
    state.checkpointAt = now;
  }
  // Read all pages before interpreting a move; a later page can contain its source removal.
  if (state.pageToken) return { reset: false, current: [] as Observation[] };
  const ids = new Set([
    ...Object.keys(state.queued).slice(0, 40),
    ...Object.values(observations.pending)
      .slice(0, 40)
      .map((p) => p.after.messageId),
  ]);
  const deadline = Date.now() + 90_000;
  const current: Observation[] = [];
  for (const id of ids) {
    if (Date.now() >= deadline) break;
    let message: gmail_v1.Schema$Message;
    try {
      message = (
        await api.users.messages.get(
          {
            userId: "me",
            id,
            format: "metadata",
            metadataHeaders: ["From", "To", "Cc", "Subject"],
          },
          { timeout: 20_000, retry: false },
        )
      ).data;
    } catch (error) {
      if ((error as { code?: number }).code === 404) {
        const previous = observations.observed[id];
        if (previous)
          current.push({ ...previous, targets: [], observedAt: now });
        delete state.queued[id];
        delete state.newMessages[id];
        continue;
      }
      throw error;
    }
    // A concurrent move needs its history before we can reconstruct the prior labels.
    if (
      message.historyId &&
      BigInt(message.historyId) > BigInt(state.historyId)
    )
      continue;
    const header = (name: string) =>
      message.payload?.headers?.find((h) => h.name?.toLowerCase() === name)
        ?.value ?? "";
    const item: Observation = {
      key: id,
      messageId: id,
      threadId: message.threadId ?? id,
      sender: addresses(header("from"))[0] ?? "",
      recipients: addresses(`${header("to")},${header("cc")}`),
      subject: header("subject").slice(0, 80),
      targets: googleTargets(message.labelIds ?? [], targets),
      isRead: !(message.labelIds ?? []).includes("UNREAD"),
      isFlagged: (message.labelIds ?? []).includes("STARRED"),
      observedAt: now,
    };
    if (state.newMessages[id]) {
      // Capture arrival state once, then allow subsequent manual moves to teach.
      observations.observed[id] = item;
      delete observations.pending[id];
      delete state.newMessages[id];
    } else if (!observations.observed[id]) {
      const beforeLabels = new Set(message.labelIds ?? []);
      for (const record of [...(state.queued[id] ?? [])].reverse()) {
        for (const label of record.added) beforeLabels.delete(label);
        for (const label of record.removed) beforeLabels.add(label);
      }
      observations.observed[id] = {
        ...item,
        targets: googleTargets([...beforeLabels], targets),
        observedAt: state.queued[id]?.[0]?.beforeAt ?? now - 1,
      };
    }
    current.push(item);
    delete state.queued[id];
  }
  return { reset: false, current };
}

export async function readICloudCorrections({
  client,
  state,
  targets,
  now,
}: {
  client: ImapFlow;
  state: z.infer<typeof imapStateSchema>;
  targets: Record<string, string>;
  now: number;
}) {
  const folders = (await client.list()).filter(
    (f) => !f.flags.has("\\Noselect") && targets[f.path],
  );
  const catalog = folders
    .map((f) => f.path)
    .sort()
    .join("\n");
  let reset = state.catalog !== catalog;
  const updated: z.infer<typeof imapStateSchema>["folders"] = {};
  const combined = new Map<string, Observation>();
  for (const folder of folders) {
    const junk = targets[folder.path] === "@junk";
    const lock = await client.getMailboxLock(folder.path, { readOnly: !junk });
    try {
      if (!client.mailbox) throw new Error("iCloud folder not selected");
      if (junk) {
        const unread = await client.search({ seen: false }, { uid: true });
        if (Array.isArray(unread))
          for (let offset = 0; offset < unread.length; offset += 250)
            await client.messageFlagsAdd(
              unread.slice(offset, offset + 250),
              ["\\Seen"],
              { uid: true },
            );
      }
      const validity = String(client.mailbox.uidValidity);
      const old = state.folders[folder.path];
      if (old && old.validity !== validity) reset = true;
      const found = await client.search({ all: true }, { uid: true });
      const uids = Array.isArray(found) ? found : [];
      const messages: Record<string, Observation> = {};
      const missing: number[] = [];
      for (const uid of uids) {
        if (old?.validity === validity && old.messages[uid])
          messages[uid] = { ...old.messages[uid] };
        else missing.push(uid);
      }
      for (let offset = 0; offset < missing.length; offset += 250) {
        const batch = await client.fetchAll(
          missing.slice(offset, offset + 250),
          { uid: true, envelope: true, size: true, internalDate: true },
          { uid: true },
        );
        for (const item of batch) {
          const messageId = item.envelope?.messageId;
          // Without a stable RFC Message-ID, a copy cannot be distinguished from new mail.
          if (!messageId || !item.internalDate || item.size == null) continue;
          const key = createHash("sha256")
            .update(
              JSON.stringify([
                messageId.trim(),
                new Date(item.internalDate).getTime(),
                item.size,
              ]),
            )
            .digest("hex");
          const from =
            item.envelope?.from
              ?.map((a) => a.address?.toLowerCase())
              .filter((a): a is string => !!a) ?? [];
          const recipients = [
            ...(item.envelope?.to ?? []),
            ...(item.envelope?.cc ?? []),
          ]
            .map((a) => a.address?.toLowerCase())
            .filter((a): a is string => !!a);
          messages[item.uid] = {
            key,
            messageId: `imap-correction:${key}`,
            threadId: `imap-correction:${key}`,
            sender: from[0] ?? "",
            subject: item.envelope?.subject?.slice(0, 80) ?? "",
            rfcMessageId: messageId.trim(),
            recipients,
            targets: [targets[folder.path]],
            observedAt: now,
          };
        }
      }
      if (targets[folder.path] === "@inbox") {
        // Cached envelopes stay valid, but read and flag state can change every poll.
        for (const message of Object.values(messages)) {
          message.isRead = undefined;
          message.isFlagged = undefined;
        }
        for (let offset = 0; offset < uids.length; offset += 250) {
          const batch = await client.fetchAll(
            uids.slice(offset, offset + 250),
            { uid: true, flags: true },
            { uid: true },
          );
          for (const item of batch) {
            const message = messages[item.uid];
            if (!message || !item.flags) continue;
            message.isRead = item.flags.has("\\Seen");
            message.isFlagged = item.flags.has("\\Flagged");
          }
        }
      }
      updated[folder.path] = { validity, messages };
      for (const message of Object.values(messages)) {
        const existing = combined.get(message.key);
        if (existing)
          existing.targets = [
            ...new Set([
              ...existing.targets,
              targets[folder.path],
              "@ambiguous",
            ]),
          ];
        else
          combined.set(message.key, {
            ...message,
            targets: [targets[folder.path]],
            observedAt: now,
          });
      }
    } finally {
      lock.release();
    }
  }
  state.folders = updated;
  state.catalog = catalog;
  return { reset, current: [...combined.values()] };
}

function googleTargets(labels: string[], targets: Record<string, string>) {
  if (labels.includes("SENT") || labels.includes("DRAFT")) return ["@excluded"];
  const result = [
    ...new Set(labels.flatMap((id) => (targets[id] ? [targets[id]] : []))),
  ];
  return result.length ? result : ["@archive"];
}

function addresses(value: string): string[] {
  return addressparser(value, { flatten: true }).flatMap((item) =>
    "address" in item && item.address ? [item.address.toLowerCase()] : [],
  );
}
