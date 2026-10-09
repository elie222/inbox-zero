import type {
  AddDraftAttachmentResponse,
  GetDraftAttachmentsResponse,
} from "@/app/api/user/drafts/[draftId]/attachments/route";
import type { UploadDraftMessageChunkResponse } from "@/app/api/user/drafts/[draftId]/attachments/uploads/[uploadId]/route";
import {
  removeDraftAttachmentAction,
  startDraftAttachmentUploadAction,
} from "@/utils/actions/draft-attachments";
import type { DraftAttachmentMetadata } from "@/utils/actions/draft-attachments.validation";
import {
  fetchAttachment,
  getAttachmentUrl,
} from "@/utils/attachments/download";
import {
  type DraftMessageUploadPart,
  encodeMimeBase64,
  usesDirectDraftAttachmentUpload,
} from "@/utils/email/draft-attachment-upload";
import type { DraftAttachmentsResult } from "@/utils/email/types";
import { getActionErrorMessage } from "@/utils/error";
import { fetchWithAccount } from "@/utils/fetch";

export type DraftAttachmentUploadResult = DraftAttachmentsResult & {
  attachmentId: string;
};

// Files attached in this tab, so a Gmail re-upload doesn't download them
// again. Only references are ever written to the local draft.
const attachedFiles = new Map<string, Blob>();

/**
 * Adds a file to the mailbox draft. Small files go through our server in one
 * request; larger ones use the provider's upload session so no request
 * reaches the server's body limit.
 */
export async function uploadDraftAttachment({
  emailAccountId,
  draftId,
  file,
  attachment,
}: {
  emailAccountId: string;
  draftId: string;
  file: Blob;
  attachment: DraftAttachmentMetadata;
}): Promise<DraftAttachmentUploadResult> {
  attachedFiles.set(fileKey(emailAccountId, attachment.id), file);
  if (usesDirectDraftAttachmentUpload(file.size))
    return uploadInOneRequest({ emailAccountId, draftId, file, attachment });

  const started = await startDraftAttachmentUploadAction(emailAccountId, {
    draftId,
    attachment,
  });
  if (!started?.data)
    throw new Error(
      getActionErrorMessage(started ?? {}, {
        prefix: `Could not attach ${attachment.filename}`,
      }),
    );
  const upload = started.data;
  if (upload.type === "provider-url") {
    const before = await fetchDraftAttachments({ emailAccountId, draftId });
    await uploadToProviderUrl({ ...upload, file });
    const after = await fetchDraftAttachments({ emailAccountId, draftId });
    // Draft changes run one at a time, so the new id is the only new one.
    const added = after?.attachments.filter(
      (item) => !before?.attachments.some((known) => known.id === item.id),
    );
    if (!after || added?.length !== 1)
      throw new Error(`Could not confirm ${attachment.filename} was attached.`);
    return { ...after, attachmentId: added[0]!.id };
  }

  const message = await assembleDraftMessage({
    emailAccountId,
    parts: upload.parts,
    file,
  });
  if (message.size !== upload.totalBytes)
    throw new Error(`Could not attach ${attachment.filename}. Try again.`);
  return uploadDraftMessage({
    emailAccountId,
    draftId,
    uploadId: upload.uploadId,
    chunkBytes: upload.chunkBytes,
    message,
  });
}

export async function removeDraftAttachment({
  emailAccountId,
  draftId,
  attachmentId,
}: {
  emailAccountId: string;
  draftId: string;
  attachmentId: string;
}) {
  const result = await removeDraftAttachmentAction(emailAccountId, {
    draftId,
    attachmentId,
  });
  if (!result?.data)
    throw new Error(
      getActionErrorMessage(result ?? {}, {
        prefix: "Could not remove the attachment",
      }),
    );
  return result.data;
}

export function forgetAttachedFiles(
  emailAccountId: string,
  attachmentIds: string[],
) {
  for (const id of attachmentIds)
    attachedFiles.delete(fileKey(emailAccountId, id));
}

export async function fetchDraftAttachments({
  emailAccountId,
  draftId,
  signal,
}: {
  emailAccountId: string;
  draftId: string;
  signal?: AbortSignal;
}): Promise<GetDraftAttachmentsResponse | null> {
  const response = await fetchWithAccount({
    url: `/api/user/drafts/${encodeURIComponent(draftId)}/attachments`,
    emailAccountId,
    init: { cache: "no-store", signal },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Could not load the draft's attachments.");
  return response.json();
}

/** A file on the draft: the copy this tab attached, else the mailbox's. */
export async function readDraftAttachmentBytes({
  emailAccountId,
  attachmentId,
  source,
  size,
  signal,
}: {
  emailAccountId: string;
  attachmentId: string;
  source: { messageId: string; providerAttachmentId: string };
  size: number;
  signal?: AbortSignal;
}) {
  const attached = attachedFiles.get(fileKey(emailAccountId, attachmentId));
  if (attached?.size === size) return attached;
  return fetchAttachment({
    url: getAttachmentUrl({
      accountId: emailAccountId,
      messageId: source.messageId,
      attachmentId: source.providerAttachmentId,
    }),
    emailAccountId,
    maxBytes: size,
    signal,
  });
}

async function uploadInOneRequest({
  emailAccountId,
  draftId,
  file,
  attachment,
}: {
  emailAccountId: string;
  draftId: string;
  file: Blob;
  attachment: DraftAttachmentMetadata;
}): Promise<DraftAttachmentUploadResult> {
  const params = new URLSearchParams({
    id: attachment.id,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: String(attachment.size),
    disposition: attachment.disposition,
    ...(attachment.contentId ? { contentId: attachment.contentId } : {}),
  });
  const response = await fetchWithAccount({
    url: `/api/user/drafts/${encodeURIComponent(draftId)}/attachments?${params}`,
    emailAccountId,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    },
  });
  if (!response.ok)
    throw new Error(
      (await readErrorMessage(response)) ??
        `Could not attach ${attachment.filename}.`,
    );
  const result: AddDraftAttachmentResponse = await response.json();
  return result;
}

// Microsoft's upload URL is pre-authenticated and must not get our
// Authorization header, so the browser uploads straight to it.
async function uploadToProviderUrl({
  uploadUrl,
  chunkBytes,
  file,
}: {
  uploadUrl: string;
  chunkBytes: number;
  file: Blob;
}) {
  for (let start = 0; start < file.size; start += chunkBytes) {
    const end = Math.min(start + chunkBytes, file.size);
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Range": `bytes ${start}-${end - 1}/${file.size}`,
      },
      body: file.slice(start, end),
    });
    if (!response.ok) {
      await fetch(uploadUrl, { method: "DELETE" }).catch(() => undefined);
      throw new Error("Could not upload the attachment. Try again.");
    }
  }
}

// Gmail replaces the whole message, so the browser fills the server's MIME
// template with the base64 of every file on the draft.
async function assembleDraftMessage({
  emailAccountId,
  parts,
  file,
}: {
  emailAccountId: string;
  parts: DraftMessageUploadPart[];
  file: Blob;
}) {
  const segments: string[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      segments.push(part.text);
      continue;
    }
    const bytes = part.source
      ? await readDraftAttachmentBytes({
          emailAccountId,
          attachmentId: part.attachmentId,
          source: part.source,
          size: part.size,
        })
      : file;
    if (bytes.size !== part.size)
      throw new Error("An attachment changed while it was being uploaded.");
    segments.push(encodeMimeBase64(new Uint8Array(await bytes.arrayBuffer())));
  }
  return new Blob(segments, { type: "message/rfc822" });
}

async function uploadDraftMessage({
  emailAccountId,
  draftId,
  uploadId,
  chunkBytes,
  message,
}: {
  emailAccountId: string;
  draftId: string;
  uploadId: string;
  chunkBytes: number;
  message: Blob;
}): Promise<DraftAttachmentUploadResult> {
  let start = 0;
  while (start < message.size) {
    const end = Math.min(start + chunkBytes, message.size);
    const response = await fetchWithAccount({
      url: `/api/user/drafts/${encodeURIComponent(draftId)}/attachments/uploads/${encodeURIComponent(uploadId)}`,
      emailAccountId,
      init: {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Range": `bytes ${start}-${end - 1}/${message.size}`,
        },
        body: message.slice(start, end),
      },
    });
    if (!response.ok)
      throw new Error(
        (await readErrorMessage(response)) ??
          "Could not upload the attachment. Try again.",
      );
    const result: UploadDraftMessageChunkResponse = await response.json();
    if (result.status === "complete") return result;
    if (result.nextOffset <= start) break;
    start = result.nextOffset;
  }
  throw new Error("Could not upload the attachment. Try again.");
}

async function readErrorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : undefined;
}

function fileKey(emailAccountId: string, attachmentId: string) {
  return `${emailAccountId}:${attachmentId}`;
}
