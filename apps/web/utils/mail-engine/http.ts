import type { MailHttpRequestFn } from "@inboxzero/mail-core/protocol/backend-adapter";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

export function createMailHttpRequest(accountId: string): MailHttpRequestFn {
  return async ({ method, path, body, signal }) => {
    const response = await fetch(path, {
      method,
      signal,
      credentials: "include",
      headers: {
        accept: "application/json",
        [EMAIL_ACCOUNT_HEADER]: accountId,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await response.json().catch(() => null);
    return { status: response.status, json };
  };
}
