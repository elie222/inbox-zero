import { fetchWithAccount } from "@/utils/fetch";

export function getAttachmentUrl({
  messageId,
  attachmentId,
  mimeType,
  filename,
}: {
  messageId: string;
  attachmentId: string;
  mimeType: string;
  filename: string;
}) {
  const searchParams = new URLSearchParams({
    messageId,
    attachmentId,
    mimeType,
    filename,
  });

  return `/api/messages/attachment?${searchParams.toString()}`;
}

export async function fetchAttachment({
  url,
  emailAccountId,
}: {
  url: string;
  emailAccountId: string;
}): Promise<Blob> {
  if (!emailAccountId) {
    throw new Error("Email account ID is required");
  }

  const response = await fetchWithAccount({ url, emailAccountId });

  if (!response.ok) {
    throw new Error("Failed to download attachment");
  }

  return response.blob();
}
