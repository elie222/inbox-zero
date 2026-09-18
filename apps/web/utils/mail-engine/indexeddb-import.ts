import type { DraftContent } from "@inboxzero/mail-core/drafts";
import type { MetadataChange } from "@inboxzero/mail-core/commands";
import type { MailStore } from "@inboxzero/mail-core/ports/mail-store";
import type {
  StoredMailMutation,
  StoredReplyDraft,
} from "@/utils/email-cache/database";
import { isActiveMailMutationStatus } from "@/utils/email-cache/mail-mutations";

export type ImportableDraft = {
  sourceId: string;
  accountId: string;
  draftId: string;
  content: DraftContent;
};

export type ImportableMutation = {
  sourceId: string;
  accountId: string;
  commandId: string;
  targets: Array<{ accountId: string; messageId: string }>;
  change: MetadataChange;
};

export function mapReplyDraftsForImport(
  drafts: StoredReplyDraft[],
): ImportableDraft[] {
  return drafts.flatMap((draft) => {
    if (!draft.content) return [];
    const to = draft.content.values.to ? [draft.content.values.to] : [];
    return [
      {
        sourceId: `draft:${draft.emailAccountId}:${draft.threadId}:${draft.messageId}`,
        accountId: draft.emailAccountId,
        draftId: draftIdFor(draft),
        content: {
          to,
          cc: draft.content.values.cc ? [draft.content.values.cc] : [],
          bcc: draft.content.values.bcc ? [draft.content.values.bcc] : [],
          subject: draft.content.values.subject ?? "",
          editableHtml: draft.content.draft.editableHtml,
          quotedHtml: draft.content.draft.quotedHtml,
          attachmentIds: draft.content.attachments.map(
            (attachment) => attachment.id,
          ),
        },
      },
    ];
  });
}

export function mapMailMutationsForImport(
  mutations: StoredMailMutation[],
): ImportableMutation[] {
  return mutations.flatMap((mutation) => {
    if (!isActiveMailMutationStatus(mutation.status)) return [];
    const change = mutationChange(mutation);
    if (!change) return [];
    return [
      {
        sourceId: `mutation:${mutation.id}`,
        accountId: mutation.emailAccountId,
        commandId: mutation.id.slice(0, 128),
        targets: mutation.messageIds.map((messageId) => ({
          accountId: mutation.emailAccountId,
          messageId,
        })),
        change,
      },
    ];
  });
}

export async function importLocalUserWork(input: {
  store: MailStore;
  drafts: ImportableDraft[];
  mutations: ImportableMutation[];
}): Promise<{ imported: number; skipped: number; failed: number }> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  for (const draft of input.drafts) {
    const saved = await input.store.saveDraft({
      key: { accountId: draft.accountId, draftId: draft.draftId },
      expectedRevision: null,
      content: draft.content,
    });
    if (saved.status === "saved") imported += 1;
    else if (saved.status === "conflict") skipped += 1;
    else failed += 1;
  }
  for (const mutation of input.mutations) {
    if (mutation.targets.length === 0) {
      skipped += 1;
      continue;
    }
    const admitted = await input.store.admitMetadata({
      accountId: mutation.accountId,
      commandId: mutation.commandId,
      targets: mutation.targets,
      change: mutation.change,
    });
    if (admitted.status === "queued") imported += 1;
    else if (admitted.status === "already_recorded") skipped += 1;
    else failed += 1;
  }
  return { imported, skipped, failed };
}

function draftIdFor(draft: StoredReplyDraft) {
  const raw = `${draft.threadId}:${draft.messageId}`;
  return raw.slice(0, 128);
}

function mutationChange(mutation: StoredMailMutation): MetadataChange | null {
  switch (mutation.kind) {
    case "archive":
      return { kind: "archive" };
    case "unarchive":
      return { kind: "unarchive" };
    case "trash":
      return { kind: "trash" };
    case "untrash":
      return { kind: "restore_from_trash" };
    case "set_read_state":
      return {
        kind: "set_read",
        read: Boolean(
          mutation.payload &&
            typeof mutation.payload === "object" &&
            "read" in mutation.payload &&
            mutation.payload.read,
        ),
      };
    case "set_starred_state":
      return {
        kind: "set_starred",
        starred: Boolean(
          mutation.payload &&
            typeof mutation.payload === "object" &&
            "starred" in mutation.payload &&
            mutation.payload.starred,
        ),
      };
    case "spam":
      return { kind: "set_spam", spam: true };
    case "snooze":
      return {
        kind: "snooze",
        untilMs:
          mutation.payload &&
          typeof mutation.payload === "object" &&
          "scheduledFor" in mutation.payload &&
          typeof mutation.payload.scheduledFor === "string"
            ? Date.parse(mutation.payload.scheduledFor) || Date.now()
            : Date.now(),
      };
    default:
      return null;
  }
}
