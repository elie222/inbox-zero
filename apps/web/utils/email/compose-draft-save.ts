import prisma from "@/utils/prisma";
import { SafeError, DraftNotFoundError } from "@/utils/error";
import { canonicalizeEmailAddress, splitRecipientList } from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";
import { saveComposeDraft } from "@/utils/email/compose-draft";
import { sendEmailBody, type SendEmailBody } from "@/utils/types/mail";

export async function saveComposeDraftWithReceipt({
  emailAccountId,
  requestId,
  draftId,
  creationUnconfirmed,
  provider,
  content,
}: {
  emailAccountId: string;
  requestId?: string;
  draftId?: string;
  creationUnconfirmed?: boolean;
  provider: EmailProvider;
  content: SendEmailBody;
}) {
  if (draftId) return saveComposeDraft({ provider, draftId, content });
  if (!requestId)
    throw new SafeError("Reopen this draft before syncing it to your mailbox.");
  const where = { emailAccountId_requestId: { emailAccountId, requestId } };
  const receipt = await prisma.composeDraftSave.upsert({
    where,
    create: {
      emailAccountId,
      requestId,
      legacyUnconfirmed: creationUnconfirmed ?? false,
      creationInput: JSON.parse(JSON.stringify(content)),
    },
    update: {},
  });
  if (["DISCARDED", "SENT"].includes(receipt.status))
    throw new DraftNotFoundError(
      "This draft was already sent or discarded. Reopen the composer to start a new one.",
    );
  if (receipt.draftId)
    return saveComposeDraft({ provider, draftId: receipt.draftId, content });
  if (
    receipt.status === "CREATING" &&
    Date.now() - receipt.updatedAt.getTime() < 60_000
  )
    throw new SafeError(
      "This mailbox draft is still being confirmed. Your local draft is safe; sync will retry.",
    );

  if (receipt.legacyUnconfirmed || receipt.status !== "READY") {
    const original = sendEmailBody.parse(receipt.creationInput);
    const threadId = original.replyToEmail?.threadId;
    const messages = threadId
      ? (
          await provider.getThread(threadId, {
            complete: true,
            includeDrafts: true,
          })
        ).messages.filter((message) => message.labelIds?.includes("DRAFT"))
      : await provider.getDrafts({ maxResults: 100 });
    const candidates = messages.filter(
      (message) =>
        recipients(message.headers.to) === recipients(original.to) &&
        recipients(message.headers.cc) === recipients(original.cc) &&
        recipients(message.headers.bcc) === recipients(original.bcc) &&
        message.subject === original.subject &&
        message.textHtml?.replace(/\r\n/g, "\n").trim() ===
          original.messageHtml.replace(/\r\n/g, "\n").trim(),
    );
    if (candidates.length === 1) {
      const reference = await provider.getDraftReferenceForMessage(
        candidates[0].id,
      );
      if (reference) {
        await prisma.composeDraftSave.update({
          where,
          data: { draftId: reference.id, status: "CREATED" },
        });
        return saveComposeDraft({ provider, draftId: reference.id, content });
      }
    }
    // A legacy browser flag has no server receipt. Only an empty draft
    // lookup proves that it never acquired a mailbox draft.
    if (receipt.status !== "READY" || messages.length)
      throw new SafeError(
        "Mailbox draft creation could not be confirmed. Your local draft is safe. Open the existing mailbox draft before retrying.",
      );
  }
  const claimed = await prisma.composeDraftSave.updateMany({
    where: { id: receipt.id, status: "READY", draftId: null },
    data: { status: "CREATING", legacyUnconfirmed: false },
  });
  if (claimed.count !== 1)
    throw new SafeError(
      "This mailbox draft is still being confirmed. Sync will retry.",
    );
  let confirmedId: string | undefined;
  try {
    const created = await provider.createDraft({
      to: content.to,
      from: content.from,
      cc: content.cc,
      bcc: content.bcc,
      subject: content.subject,
      messageHtml: content.messageHtml,
      replyToMessageId: content.replyToEmail?.messageId,
      forwardedMessageId: content.replyToEmail?.messageId
        ? undefined
        : content.replyToEmail?.forwardedMessageId,
      onCreated: async (id) => {
        if (!id) throw new SafeError("Could not confirm the mailbox draft.");
        confirmedId = id;
        await prisma.composeDraftSave.update({
          where,
          data: { draftId: id, status: "CREATED" },
        });
      },
    });
    if (!created.id)
      throw new SafeError("Could not confirm the mailbox draft.");
    confirmedId = created.id;
    await prisma.composeDraftSave.update({
      where,
      data: { draftId: confirmedId, status: "CREATED" },
    });
  } catch (error) {
    if (!confirmedId) {
      await prisma.composeDraftSave.update({
        where,
        data: { status: definitelyRejected(error) ? "READY" : "UNCERTAIN" },
      });
      throw error;
    }
    // Outlook may createReply successfully and then reject the content patch.
    // Return the reference; the next autosave updates that same draft.
  }
  if (!confirmedId) throw new SafeError("Could not confirm the mailbox draft.");
  const message = await provider.getDraft(confirmedId).catch(() => null);
  return {
    draftId: confirmedId,
    messageId: message?.id ?? null,
    threadId: message?.threadId ?? null,
  };
}

function recipients(value: string | undefined) {
  return splitRecipientList(value ?? "")
    .map(canonicalizeEmailAddress)
    .sort()
    .join(",");
}

function definitelyRejected(error: unknown) {
  const details = error as {
    status?: number;
    code?: string | number;
    response?: { status?: number };
    cause?: { code?: string };
  };
  const status = Number(
    details?.status ?? details?.response?.status ?? details?.code,
  );
  const code = details?.cause?.code ?? details?.code;
  return (
    [400, 401, 403, 404, 413, 422, 429].includes(status) ||
    ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"].includes(String(code))
  );
}
