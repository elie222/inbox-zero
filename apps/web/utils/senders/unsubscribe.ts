import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { NewsletterStatus } from "@/generated/prisma/enums";
import { env } from "@/env";
import { browserUnsubscribe } from "@/utils/senders/browser-unsubscribe";
import type { Logger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/types";
import { findAutoArchiveFilters } from "@/utils/senders/filters";
import {
  extractEmailOrThrow,
  upsertSenderRecord,
} from "@/utils/senders/record";
import {
  isSafeExternalHttpUrl,
  resolveSafeExternalHttpUrl,
} from "@/utils/network/safe-http-url";
import { getHttpUnsubscribeLink } from "@/utils/parse/unsubscribe";
import {
  encodeFormBody,
  inspectUnsubscribeHtml,
} from "@/utils/senders/html-form-unsubscribe";
import { aiCheckUnsubscribePageState } from "@/utils/ai/senders/unsubscribe-page";
import { getEmailAccountWithAi } from "@/utils/user/get";

const ONE_CLICK_REQUEST_BODY = "List-Unsubscribe=One-Click";
const UNSUBSCRIBE_REQUEST_TIMEOUT_MS = 10_000;
const MAX_UNSUBSCRIBE_REDIRECTS = 5;
const MAX_UNSUBSCRIBE_BODY_BYTES = 256_000;

export type AutomaticUnsubscribeResult = {
  attempted: boolean;
  success: boolean;
  method?: "post" | "get" | "form" | "browser";
  statusCode?: number;
  reason?:
    | "no_unsubscribe_url"
    | "unsafe_unsubscribe_url"
    | "request_timeout"
    | "request_failed"
    | "needs_user"
    | "request_rejected";
};

export async function setSenderStatus({
  emailAccountId,
  senderEmail,
  status,
}: {
  emailAccountId: string;
  senderEmail: string;
  status: NewsletterStatus | null;
}) {
  return upsertSenderRecord({
    emailAccountId,
    senderEmail,
    changes: { status },
  });
}

/**
 * Records the status and brings the provider-side auto-archive filters in line
 * with it: `AUTO_ARCHIVED` creates a filter, `APPROVED` and `null` remove every
 * filter for the sender, and `UNSUBSCRIBED` leaves existing ones alone. Pass
 * `labelId`/`labelName` to also label the sender's mail while archiving it.
 *
 * The status is written first so a provider failure leaves the sender in the
 * state the user asked for rather than leaving an unreferenced filter behind.
 */
export async function setSenderStatusWithAutoArchive({
  emailAccountId,
  emailProvider,
  senderEmail: rawSenderEmail,
  status,
  labelId,
  labelName,
}: {
  emailAccountId: string;
  emailProvider: EmailProvider;
  senderEmail: string;
  status: NewsletterStatus | null;
  labelId?: string;
  labelName?: string;
}) {
  const senderEmail = extractEmailOrThrow(rawSenderEmail);

  // Deliberately not `getEmailFilters`, which returns [] on provider errors so
  // the stats page still renders. Here that would read as "no filter exists".
  const filters = await emailProvider.getFiltersList();
  const existingFilters = findAutoArchiveFilters(
    filters,
    senderEmail,
    emailProvider,
  );

  const shouldAutoArchive = status === NewsletterStatus.AUTO_ARCHIVED;
  const shouldRemoveFilters =
    status === NewsletterStatus.APPROVED || status === null;

  await setSenderStatus({ emailAccountId, senderEmail, status });

  if (shouldAutoArchive) {
    // Create even when a filter exists, so a newly requested label reaches the
    // provider. Providers treat an identical filter as success.
    await emailProvider.createAutoArchiveFilter({
      from: senderEmail,
      gmailLabelId: labelId,
      labelName,
    });
  } else if (shouldRemoveFilters) {
    for (const filter of existingFilters) {
      await emailProvider.deleteFilter(filter.id);
    }
  }

  return {
    senderEmail,
    status,
    autoArchived: shouldRemoveFilters
      ? false
      : shouldAutoArchive || existingFilters.length > 0,
  };
}

export async function unsubscribeSenderAndMark({
  emailAccountId,
  senderEmail: rawSenderEmail,
  unsubscribeLink,
  listUnsubscribeHeader,
  logger,
}: {
  emailAccountId: string;
  senderEmail: string;
  unsubscribeLink?: string | null;
  listUnsubscribeHeader?: string | null;
  logger: Logger;
}) {
  if (!logger) {
    throw new Error("Logger is required for unsubscribeSenderAndMark");
  }

  const senderEmail = extractEmailOrThrow(rawSenderEmail);

  const log = logger.with({
    action: "unsubscribe-sender",
  });

  const unsubscribe = await unsubscribeByLadder({
    emailAccountId,
    senderEmail,
    unsubscribeLink,
    listUnsubscribeHeader,
    logger: log,
  });

  const status = unsubscribe.success ? NewsletterStatus.UNSUBSCRIBED : null;
  if (status) {
    const sender = await setSenderStatus({
      emailAccountId,
      senderEmail: senderEmail,
      status,
    });
    log.info("Unsubscribe completed", {
      senderId: sender.id,
      method: unsubscribe.method,
      completedAt: new Date().toISOString(),
    });
    log.trace("Marked sender as unsubscribed", { senderEmail });
  } else {
    log.trace("Did not mark sender as unsubscribed", {
      senderEmail,
      unsubscribeAttempted: unsubscribe.attempted,
      unsubscribeReason: unsubscribe.reason,
    });
  }

  return {
    senderEmail,
    status,
    unsubscribe,
  };
}

async function unsubscribeByLadder({
  emailAccountId,
  senderEmail,
  unsubscribeLink,
  listUnsubscribeHeader,
  logger,
}: {
  emailAccountId: string;
  senderEmail: string;
  unsubscribeLink?: string | null;
  listUnsubscribeHeader?: string | null;
  logger: Logger;
}): Promise<AutomaticUnsubscribeResult> {
  const httpResult = await attemptAutomaticUnsubscribe({
    emailAccountId,
    unsubscribeLink,
    listUnsubscribeHeader,
    logger,
  });
  if (httpResult.success || !env.UNSUBSCRIBE_WORKER_URL) return httpResult;

  logger.trace("Falling back to browser unsubscribe");
  return browserUnsubscribe({ emailAccountId, senderEmail, logger });
}

async function attemptAutomaticUnsubscribe({
  emailAccountId,
  unsubscribeLink,
  listUnsubscribeHeader,
  logger,
}: {
  emailAccountId: string;
  unsubscribeLink?: string | null;
  listUnsubscribeHeader?: string | null;
  logger: Logger;
}): Promise<AutomaticUnsubscribeResult> {
  const unsubscribeUrl = getHttpUnsubscribeLink({
    unsubscribeLink,
    listUnsubscribeHeader,
  });

  if (!unsubscribeUrl) {
    return {
      attempted: false,
      success: false,
      reason: "no_unsubscribe_url",
    };
  }

  if (!isSafeExternalHttpUrl(unsubscribeUrl)) {
    logger.warn("Skipping unsafe unsubscribe URL");
    logger.trace("Unsafe unsubscribe URL details", { unsubscribeUrl });
    return {
      attempted: false,
      success: false,
      reason: "unsafe_unsubscribe_url",
    };
  }

  logger.trace("Attempting automatic unsubscribe", { unsubscribeUrl });

  const postResult = await sendUnsubscribeRequest({
    method: "POST",
    unsubscribeUrl,
    body: ONE_CLICK_REQUEST_BODY,
  });
  if (postResult.success) {
    return {
      attempted: true,
      success: true,
      method: "post",
      statusCode: postResult.statusCode,
    };
  }

  const page = await sendUnsubscribeRequest({
    method: "GET",
    unsubscribeUrl,
    includeResponseBody: true,
  });

  let submittedUnconfirmedForm = false;

  if (page.body && page.finalUrl) {
    const account = await getEmailAccountWithAi({ emailAccountId });
    const inspected = inspectUnsubscribeHtml({
      html: page.body,
      pageUrl: page.finalUrl,
      recipientEmail: account?.email,
    });
    const pageState = account
      ? await aiCheckUnsubscribePageState({
          pageText: inspected.pageText,
          emailAccount: account,
        })
      : "not_confirmed";
    if (pageState === "confirmed") {
      return {
        attempted: true,
        success: true,
        method: "get",
        statusCode: page.statusCode,
      };
    }
    if (inspected.kind === "simple_form") {
      submittedUnconfirmedForm = true;
      const submitted = await sendUnsubscribeRequest(
        inspected.form.method === "GET"
          ? {
              method: "GET",
              unsubscribeUrl: withFormQuery(
                inspected.form.actionUrl,
                inspected.form.fields,
              ),
              includeResponseBody: true,
            }
          : {
              method: "POST",
              unsubscribeUrl: inspected.form.actionUrl,
              body: encodeFormBody(inspected.form.fields),
              includeResponseBody: true,
            },
      );
      if (account && submitted.success && submitted.body) {
        const submittedState = await aiCheckUnsubscribePageState({
          pageText: inspectUnsubscribeHtml({
            html: submitted.body,
            pageUrl: submitted.finalUrl || inspected.form.actionUrl,
          }).pageText,
          emailAccount: account,
        });
        if (submittedState === "confirmed") {
          return {
            attempted: true,
            success: true,
            method: "form",
            statusCode: submitted.statusCode,
          };
        }
      }
    }
  }

  if (env.UNSUBSCRIBE_WORKER_URL || submittedUnconfirmedForm) {
    return {
      attempted: true,
      success: false,
      method: "get",
      statusCode: page.statusCode || postResult.statusCode,
      reason: page.reason || postResult.reason || "request_rejected",
    };
  }

  if (page.success) {
    return {
      attempted: true,
      success: true,
      method: "get",
      statusCode: page.statusCode,
    };
  }

  return {
    attempted: true,
    success: false,
    method: "get",
    statusCode: page.statusCode || postResult.statusCode,
    reason: page.reason || postResult.reason || "request_rejected",
  };
}

async function sendUnsubscribeRequest({
  method,
  unsubscribeUrl,
  body,
  includeResponseBody = false,
}: {
  method: "POST" | "GET";
  unsubscribeUrl: string;
  body?: string;
  includeResponseBody?: boolean;
}): Promise<{
  success: boolean;
  statusCode?: number;
  reason?: AutomaticUnsubscribeResult["reason"];
  body?: string;
  finalUrl?: string;
}> {
  try {
    let currentUrl = unsubscribeUrl;
    let currentMethod = method;

    for (
      let redirectCount = 0;
      redirectCount <= MAX_UNSUBSCRIBE_REDIRECTS;
      redirectCount += 1
    ) {
      const response = await sendPinnedUnsubscribeRequest({
        method: currentMethod,
        unsubscribeUrl: currentUrl,
        body: currentMethod === method ? body : undefined,
        includeResponseBody,
      });

      if (response.blocked) {
        return {
          success: false,
          reason: "unsafe_unsubscribe_url",
        };
      }

      if (!isRedirectStatusCode(response.statusCode)) {
        return {
          success: response.ok,
          statusCode: response.statusCode,
          reason: response.ok ? undefined : "request_rejected",
          body: response.body,
          finalUrl: currentUrl,
        };
      }

      if (redirectCount === MAX_UNSUBSCRIBE_REDIRECTS) {
        return {
          success: false,
          statusCode: response.statusCode,
          reason: "request_rejected",
        };
      }

      const redirectedUrl = getRedirectUrl({
        currentUrl,
        location: getHeaderValue(response.headers.location),
      });
      if (!redirectedUrl) {
        return {
          success: false,
          statusCode: response.statusCode,
          reason: "unsafe_unsubscribe_url",
        };
      }

      currentUrl = redirectedUrl;
      currentMethod = getRedirectMethod({
        currentMethod,
        statusCode: response.statusCode,
      });
    }

    return {
      success: false,
      reason: "request_rejected",
    };
  } catch (error) {
    if (isRequestTimeoutError(error)) {
      return { success: false, reason: "request_timeout" };
    }

    return { success: false, reason: "request_failed" };
  }
}

async function sendPinnedUnsubscribeRequest({
  method,
  unsubscribeUrl,
  body,
  includeResponseBody = false,
}: {
  method: "POST" | "GET";
  unsubscribeUrl: string;
  body?: string;
  includeResponseBody?: boolean;
}): Promise<{
  blocked: boolean;
  ok: boolean;
  statusCode: number;
  headers: IncomingHttpHeaders;
  body?: string;
}> {
  const resolvedUrl = await resolveSafeExternalHttpUrl(unsubscribeUrl);
  if (!resolvedUrl) {
    return {
      blocked: true,
      ok: false,
      statusCode: 0,
      headers: {} as IncomingHttpHeaders,
    };
  }

  return new Promise<{
    blocked: boolean;
    ok: boolean;
    statusCode: number;
    headers: IncomingHttpHeaders;
    body?: string;
  }>((resolve, reject) => {
    const request = (
      resolvedUrl.url.protocol === "https:" ? httpsRequest : httpRequest
    )(
      resolvedUrl.url,
      {
        method,
        lookup: resolvedUrl.lookup,
        headers: {
          Accept: "*/*",
          ...(body
            ? {
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": Buffer.byteLength(body).toString(),
              }
            : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("error", reject);
        if (includeResponseBody) {
          response.on("data", (chunk: Buffer) => {
            size += chunk.byteLength;
            if (size > MAX_UNSUBSCRIBE_BODY_BYTES) {
              request.destroy(new Error("Unsubscribe response too large"));
              return;
            }
            chunks.push(chunk);
          });
        } else {
          response.resume();
        }
        response.on("end", () =>
          resolve({
            blocked: false,
            ok:
              (response.statusCode || 0) >= 200 &&
              (response.statusCode || 0) < 300,
            statusCode: response.statusCode || 0,
            headers: response.headers,
            body: includeResponseBody
              ? Buffer.concat(chunks).toString("utf8")
              : undefined,
          }),
        );
      },
    );

    request.setTimeout(UNSUBSCRIBE_REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("Unsubscribe request timed out"));
    });

    request.on("error", reject);

    if (body) request.write(body);
    request.end();
  });
}

function getRedirectUrl({
  currentUrl,
  location,
}: {
  currentUrl: string;
  location: string | null;
}) {
  if (!location) return null;

  try {
    const redirectedUrl = new URL(location, currentUrl).toString();
    return isSafeExternalHttpUrl(redirectedUrl) ? redirectedUrl : null;
  } catch {
    return null;
  }
}

function getHeaderValue(
  headerValue: string | string[] | undefined,
): string | null {
  if (!headerValue) return null;
  return Array.isArray(headerValue) ? headerValue[0] || null : headerValue;
}

function isRedirectStatusCode(statusCode: number) {
  return (
    statusCode === 301 ||
    statusCode === 302 ||
    statusCode === 303 ||
    statusCode === 307 ||
    statusCode === 308
  );
}

function getRedirectMethod({
  currentMethod,
  statusCode,
}: {
  currentMethod: "POST" | "GET";
  statusCode: number;
}) {
  if (
    currentMethod === "POST" &&
    (statusCode === 301 || statusCode === 302 || statusCode === 303)
  ) {
    return "GET";
  }

  return currentMethod;
}

function withFormQuery(
  actionUrl: string,
  fields: Array<{ name: string; value: string }>,
) {
  const url = new URL(actionUrl);
  for (const field of fields) url.searchParams.set(field.name, field.value);
  return url.toString();
}

function isRequestTimeoutError(error: unknown) {
  return (
    error instanceof Error && error.message.toLowerCase().includes("timed out")
  );
}
