import { createHash } from "node:crypto";
import { ensureEmailSendingEnabled } from "@/utils/mail";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { SafeError } from "@/utils/error";
import type { EmailProvider } from "@/utils/email/types";
import type { SendEmailBody } from "@/utils/types/mail";

const SAVE_LEASE_MS = 5 * 60 * 1000;

type ComposeDraftScope = {
  emailAccountId: string;
  sessionId: string;
  provider: EmailProvider;
};

export async function saveComposeDraft({
  emailAccountId,
  sessionId,
  provider,
  content,
}: ComposeDraftScope & {
  content: Pick<
    SendEmailBody,
    "to" | "cc" | "bcc" | "subject" | "messageHtml" | "attachments"
  >;
}) {
  const row = await getOrCreateComposeDraft({
    emailAccountId,
    sessionId,
    provider,
    content,
  });
  const savingAt = await claimSave(row.id);
  try {
    const attachmentsHash = createHash("sha256")
      .update(JSON.stringify(content.attachments ?? []))
      .digest("hex");
    const { attachments, ...fields } = content;
    await provider.updateDraft(row.draftId, {
      ...fields,
      ...(attachmentsHash !== row.attachmentsHash
        ? { attachments: attachments ?? [] }
        : {}),
    });
    await completeSave(row.id, savingAt, { attachmentsHash });
    return row.draftId;
  } catch (error) {
    await releaseSave(row.id, savingAt);
    throw error;
  }
}

export async function discardComposeDraft({
  emailAccountId,
  sessionId,
  provider,
}: ComposeDraftScope) {
  const key = { emailAccountId_sessionId: { emailAccountId, sessionId } };
  const row = await prisma.composeDraft.findUnique({ where: key });
  if (!row) {
    await prisma.composeDraft.upsert({
      where: key,
      create: { emailAccountId, sessionId, closed: true },
      update: {},
    });
    // A competing creation must settle before it is safe to discard.
    const current = await prisma.composeDraft.findUnique({ where: key });
    if (!current?.closed)
      throw new SafeError("Draft is still syncing. Try again shortly.");
    return;
  }
  if (row.closed) return;
  if (!row.draftId)
    throw new SafeError(
      "Could not confirm the mailbox draft. Check Drafts before discarding.",
    );
  const savingAt = await claimSave(row.id);
  try {
    const message = await provider.getDraft(row.draftId);
    if (message) {
      const reference = await provider.getDraftReferenceForMessage(message.id);
      if (
        reference &&
        !(await provider.deleteDraft(reference.id, reference.version))
      ) {
        throw new SafeError(
          "The mailbox draft changed. Reopen it before discarding.",
        );
      }
    }
    await completeSave(row.id, savingAt, { closed: true });
  } catch (error) {
    await releaseSave(row.id, savingAt);
    throw error;
  }
}

export async function sendComposeDraft({
  emailAccountId,
  sessionId,
  provider,
  email,
}: ComposeDraftScope & { email: SendEmailBody }) {
  ensureEmailSendingEnabled();
  const row = await getOrCreateComposeDraft({
    emailAccountId,
    sessionId,
    provider,
    content: email,
  });
  const savingAt = await claimSave(row.id);
  try {
    await provider.updateDraft(row.draftId, {
      to: email.to,
      cc: email.cc ?? "",
      bcc: email.bcc ?? "",
      subject: email.subject,
      messageHtml: email.messageHtml,
      attachments: email.attachments ?? [],
    });
    const result = await provider.sendDraft(row.draftId);
    await completeSave(row.id, savingAt, { closed: true });
    return result;
  } catch (error) {
    await releaseSave(row.id, savingAt);
    throw error;
  }
}

async function getOrCreateComposeDraft({
  emailAccountId,
  sessionId,
  provider,
  content,
}: ComposeDraftScope & {
  content: Pick<SendEmailBody, "subject" | "messageHtml">;
}) {
  const key = { emailAccountId_sessionId: { emailAccountId, sessionId } };
  let row = await prisma.composeDraft.findUnique({ where: key });
  if (!row) {
    try {
      row = await prisma.composeDraft.create({
        data: { emailAccountId, sessionId, savingAt: new Date() },
      });
    } catch (error) {
      if (!isDuplicateError(error)) throw error;
      throw new SafeError("Draft is still syncing. Retrying…");
    }
    // Record the reference before uploading files. A lost response must not
    // create a second mailbox draft on the next autosave.
    const draft = await provider.createDraft({
      to: "",
      subject: content.subject,
      messageHtml: content.messageHtml,
    });
    if (!draft.id)
      throw new SafeError(
        "Could not confirm the mailbox draft. Check Drafts before trying again.",
      );
    row = await prisma.composeDraft.update({
      where: key,
      data: { draftId: draft.id, savingAt: null },
    });
  }
  if (row.closed)
    throw new SafeError(
      "This compose session has finished. Reopen the composer.",
    );
  if (!row.draftId) {
    throw new SafeError(
      "Could not confirm the mailbox draft yet. Your message is saved on this device; check Drafts before trying again.",
    );
  }
  return { ...row, draftId: row.draftId };
}

async function completeSave(
  id: string,
  savingAt: Date,
  data: { attachmentsHash?: string; closed?: true },
) {
  const completed = await prisma.composeDraft.updateMany({
    where: { id, savingAt },
    data: { ...data, savingAt: null },
  });
  if (!completed.count)
    throw new SafeError(
      "This draft changed while syncing. Reopen the composer.",
    );
}

async function releaseSave(id: string, savingAt: Date) {
  await prisma.composeDraft.updateMany({
    where: { id, savingAt },
    data: { savingAt: null },
  });
}

async function claimSave(id: string) {
  const savingAt = new Date();
  const claimed = await prisma.composeDraft.updateMany({
    where: {
      id,
      closed: false,
      OR: [
        { savingAt: null },
        { savingAt: { lt: new Date(Date.now() - SAVE_LEASE_MS) } },
      ],
    },
    data: { savingAt },
  });
  if (!claimed.count) throw new SafeError("Draft is still syncing. Retrying…");
  return savingAt;
}
