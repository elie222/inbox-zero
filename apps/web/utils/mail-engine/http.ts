import type { MailHttpRequestFn } from "@inboxzero/mail-core/protocol/backend-adapter";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

export function createMailHttpRequest(accountId: string): MailHttpRequestFn {
  return async ({ method, path, body, signal, accept }) => {
    const encoded = encodeRequestBody(body);
    const response = await fetch(path, {
      method,
      signal,
      credentials: "include",
      headers: {
        accept:
          accept === "bytes" ? "application/octet-stream" : "application/json",
        [EMAIL_ACCOUNT_HEADER]: accountId,
        ...encoded.headers,
      },
      body: encoded.body,
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
    await reader.cancel().catch(() => undefined);
  }
}

function encodeRequestBody(body: unknown): {
  headers: Record<string, string>;
  body?: BodyInit;
} {
  if (body === undefined) return { headers: {} };
  if (body instanceof Uint8Array) {
    return {
      headers: { "content-type": "application/octet-stream" },
      // TS 5.7 Uint8Array<ArrayBufferLike> is not inferred as BodyInit.
      body: body as BodyInit,
    };
  }
  return {
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
