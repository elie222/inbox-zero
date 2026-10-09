import { SafeError } from "@/utils/error";
import { getGoogleGmailApiRootUrl } from "@/utils/gmail/oauth";

/**
 * Opens a Gmail resumable upload that replaces the whole draft message.
 * The session URI it returns must stay on the server: Gmail's docs only
 * describe using it with the account's Authorization header.
 */
export async function startGmailDraftUploadSession({
  accessToken,
  draftId,
  threadId,
  totalBytes,
}: {
  accessToken: string;
  draftId: string;
  threadId?: string | null;
  totalBytes: number;
}) {
  const url = new URL(
    `upload/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`,
    gmailRootUrl(),
  );
  url.searchParams.set("uploadType", "resumable");
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "message/rfc822",
      "X-Upload-Content-Length": String(totalBytes),
    },
    body: JSON.stringify({
      id: draftId,
      message: threadId ? { threadId } : {},
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404)
    throw new SafeError(
      "This draft is no longer available in Gmail. Check Sent before trying again.",
    );
  if (!response.ok)
    throw new Error(`Gmail upload session failed with ${response.status}`);
  const sessionUri = response.headers.get("location");
  if (!sessionUri || !isGmailUploadUrl(sessionUri))
    throw new Error("Gmail did not return a usable upload session.");
  return sessionUri;
}

export async function uploadGmailDraftChunk({
  accessToken,
  sessionUri,
  start,
  bytes,
  totalBytes,
}: {
  accessToken: string;
  sessionUri: string;
  start: number;
  bytes: Uint8Array<ArrayBuffer>;
  totalBytes: number;
}): Promise<
  { status: "incomplete"; nextOffset: number } | { status: "complete" }
> {
  if (!isGmailUploadUrl(sessionUri))
    throw new Error("Refusing to upload to an unexpected URL.");
  const response = await fetch(sessionUri, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Range": `bytes ${start}-${start + bytes.byteLength - 1}/${totalBytes}`,
    },
    body: bytes,
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 308) {
    const range = response.headers.get("range")?.match(/^bytes=0-(\d+)$/u);
    return {
      status: "incomplete",
      nextOffset: range ? Number(range[1]) + 1 : 0,
    };
  }
  if (response.ok) return { status: "complete" };
  if (response.status === 404 || response.status === 410)
    throw new SafeError("This upload expired. Attach the file again.");
  throw new Error(`Gmail upload chunk failed with ${response.status}`);
}

function isGmailUploadUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!url.pathname.startsWith("/upload/")) return false;
  const root = new URL(gmailRootUrl());
  if (url.origin === root.origin) return true;
  return (
    url.protocol === "https:" &&
    (url.hostname === "googleapis.com" ||
      url.hostname.endsWith(".googleapis.com"))
  );
}

function gmailRootUrl() {
  const root = getGoogleGmailApiRootUrl();
  return root.endsWith("/") ? root : `${root}/`;
}
