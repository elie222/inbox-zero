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
import type { DraftAttachment } from "@/utils/email/types";
import { getActionErrorMessage } from "@/utils/error";
import { fetchWithAccount } from "@/utils/fetch";
import {
  readComposeAttachmentBytes,
  saveComposeAttachmentBytes,
} from "./attachment-bytes";

export type DraftAttachmentUploadResult = {
  /** The id to remove the file with later. */
  attachmentId: string;
  /** Set when the provider replaced the draft's message (Gmail). */
  messageId: string | null;
  /** The draft's full attachment list, when the provider returned it. */
  attachments?: DraftAttachment[];
};

/**
 * Adds a file to the mailbox draft. Small files go through our server in one
 * request; larger ones go to the provider's upload session so no request
 * reaches the server's body limit. The bytes are also kept in this browser for
 * a later Gmail re-upload.
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
  await saveComposeAttachmentBytes(emailAccountId, attachment.id, file);
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
    const uploadedId = await uploadToProviderUrl({
      uploadUrl: upload.uploadUrl,
      chunkBytes: upload.chunkBytes,
      file,
    });
    // The upload response may not name the attachment, and a forward's draft
    // also holds files the composer hasn't listed yet.
    const listed = await fetchDraftAttachments({ emailAccountId, draftId });
    const attachmentId =
      uploadedId ??
      listed?.attachments.findLast(
        (candidate) =>
          candidate.filename === attachment.filename &&
          candidate.size === attachment.size,
      )?.id;
    if (!attachmentId)
      throw new Error(`Could not confirm ${attachment.filename} was attached.`);
    return {
      attachmentId,
      messageId: null,
      attachments: listed?.attachments,
    };
  }

  const message = await assembleDraftMessage({
    emailAccountId,
    parts: upload.parts,
    newAttachment: { id: attachment.id, file },
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

/** The bytes of a file on the draft: from this browser, else the mailbox. */
export async function readDraftAttachmentBytes({
  emailAccountId,
  localId,
  source,
  size,
}: {
  emailAccountId: string;
  localId: string;
  source: { messageId: string; providerAttachmentId: string };
  size: number;
}) {
  const stored = await readComposeAttachmentBytes(emailAccountId, localId);
  if (stored && stored.size === size) return stored;
  const downloaded = await fetchAttachment({
    url: getAttachmentUrl({
      accountId: emailAccountId,
      messageId: source.messageId,
      attachmentId: source.providerAttachmentId,
    }),
    emailAccountId,
    maxBytes: size,
  });
  await saveComposeAttachmentBytes(emailAccountId, localId, downloaded);
  return downloaded;
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

/**
 * Microsoft's upload URL is pre-authenticated and CORS-enabled, and must not
 * be sent an Authorization header, so the browser uploads straight to it.
 */
async function uploadToProviderUrl({
  uploadUrl,
  chunkBytes,
  file,
}: {
  uploadUrl: string;
  chunkBytes: number;
  file: Blob;
}) {
  let response: Response | undefined;
  for (let start = 0; start < file.size; start += chunkBytes) {
    const end = Math.min(start + chunkBytes, file.size);
    response = await fetch(uploadUrl, {
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
  const location = response?.headers.get("location");
  const fromLocation = location?.match(/Attachments\('([^']+)'\)/iu)?.[1];
  if (fromLocation) return fromLocation;
  const body = (await response?.json().catch(() => null)) as {
    id?: unknown;
  } | null;
  return typeof body?.id === "string" ? body.id : null;
}

/**
 * Gmail replaces the whole message, so the browser fills the server's MIME
 * template with the base64 of every file on the draft.
 */
async function assembleDraftMessage({
  emailAccountId,
  parts,
  newAttachment,
}: {
  emailAccountId: string;
  parts: DraftMessageUploadPart[];
  newAttachment: { id: string; file: Blob };
}) {
  const segments: string[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      segments.push(part.text);
      continue;
    }
    const bytes =
      part.attachmentId === newAttachment.id || !part.source
        ? newAttachment.file
        : await readDraftAttachmentBytes({
            emailAccountId,
            localId: part.attachmentId,
            source: part.source,
            size: part.size,
          });
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
    if (result.nextOffset <= start)
      throw new Error("Could not upload the attachment. Try again.");
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
