import type { MailHttpRequestFn } from "@inboxzero/mail-core/protocol/backend-adapter";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

export function createMailHttpRequest(accountId: string): MailHttpRequestFn {
  return async ({ method, path, body, signal, accept }) => {
    const response = await fetch(path, {
      method,
      signal,
      credentials: "include",
      headers: {
        accept:
          accept === "bytes" ? "application/octet-stream" : "application/json",
        [EMAIL_ACCOUNT_HEADER]: accountId,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (accept === "bytes" && response.ok) {
      const sizeHeader = response.headers.get("content-length");
      return {
        status: response.status,
        json: null,
        bytes: iterableFromStream(response.body),
        sizeBytes:
          sizeHeader && /^\d+$/.test(sizeHeader) ? Number(sizeHeader) : null,
      };
    }
    const json = await response.json().catch(() => null);
    return { status: response.status, json };
  };
}

async function* iterableFromStream(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) return;
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
