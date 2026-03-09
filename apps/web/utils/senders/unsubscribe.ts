import { NewsletterStatus } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import {
  extractEmailOrThrow,
  upsertSenderRecord,
} from "@/utils/senders/record";
import { isSafeExternalHttpUrl } from "@/utils/network/safe-http-url";
import { getHttpUnsubscribeLink } from "@/utils/parse/unsubscribe";

const ONE_CLICK_REQUEST_BODY = "List-Unsubscribe=One-Click";
const UNSUBSCRIBE_REQUEST_TIMEOUT_MS = 10_000;
const MAX_UNSUBSCRIBE_REDIRECTS = 5;

export type AutomaticUnsubscribeResult = {
  attempted: boolean;
  success: boolean;
  method?: "post" | "get";
  statusCode?: number;
  reason?:
    | "no_unsubscribe_url"
    | "unsafe_unsubscribe_url"
    | "request_timeout"
    | "request_failed"
    | "request_rejected";
};

export async function setSenderStatus({
  emailAccountId,
  newsletterEmail,
  status,
}: {
  emailAccountId: string;
  newsletterEmail: string;
  status: NewsletterStatus | null;
}) {
  return upsertSenderRecord({
    emailAccountId,
    newsletterEmail,
    changes: { status },
  });
}

export async function unsubscribeSenderAndMark({
  emailAccountId,
  newsletterEmail,
  unsubscribeLink,
  listUnsubscribeHeader,
  logger,
}: {
  emailAccountId: string;
  newsletterEmail: string;
  unsubscribeLink?: string | null;
  listUnsubscribeHeader?: string | null;
  logger: Logger;
}) {
  if (!logger) {
    throw new Error("Logger is required for unsubscribeSenderAndMark");
  }

  const senderEmail = extractEmailOrThrow(newsletterEmail);

  const log = logger.with({
    action: "unsubscribe-sender",
  });

  const unsubscribe = await attemptAutomaticUnsubscribe({
    unsubscribeLink,
    listUnsubscribeHeader,
    logger: log,
  });

  const status = unsubscribe.success ? NewsletterStatus.UNSUBSCRIBED : null;
  if (status) {
    await setSenderStatus({
      emailAccountId,
      newsletterEmail: senderEmail,
      status,
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

async function attemptAutomaticUnsubscribe({
  unsubscribeLink,
  listUnsubscribeHeader,
  logger,
}: {
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
  });
  if (postResult.success) {
    return {
      attempted: true,
      success: true,
      method: "post",
      statusCode: postResult.statusCode,
    };
  }

  const getResult = await sendUnsubscribeRequest({
    method: "GET",
    unsubscribeUrl,
  });
  if (getResult.success) {
    return {
      attempted: true,
      success: true,
      method: "get",
      statusCode: getResult.statusCode,
    };
  }

  return {
    attempted: true,
    success: false,
    method: "get",
    statusCode: getResult.statusCode || postResult.statusCode,
    reason: getResult.reason || postResult.reason || "request_rejected",
  };
}

async function sendUnsubscribeRequest({
  method,
  unsubscribeUrl,
}: {
  method: "POST" | "GET";
  unsubscribeUrl: string;
}): Promise<{
  success: boolean;
  statusCode?: number;
  reason?: AutomaticUnsubscribeResult["reason"];
}> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    UNSUBSCRIBE_REQUEST_TIMEOUT_MS,
  );

  try {
    let currentUrl = unsubscribeUrl;
    let currentMethod = method;

    for (
      let redirectCount = 0;
      redirectCount <= MAX_UNSUBSCRIBE_REDIRECTS;
      redirectCount += 1
    ) {
      const response = await fetch(currentUrl, {
        method: currentMethod,
        headers: {
          Accept: "*/*",
          ...(currentMethod === "POST"
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
        },
        ...(currentMethod === "POST" ? { body: ONE_CLICK_REQUEST_BODY } : {}),
        signal: controller.signal,
        redirect: "manual",
      });

      if (!isRedirectStatusCode(response.status)) {
        return {
          success: response.ok,
          statusCode: response.status,
          reason: response.ok ? undefined : "request_rejected",
        };
      }

      if (redirectCount === MAX_UNSUBSCRIBE_REDIRECTS) {
        return {
          success: false,
          statusCode: response.status,
          reason: "request_rejected",
        };
      }

      const redirectedUrl = getSafeRedirectUrl({
        currentUrl,
        location: response.headers.get("location"),
      });
      if (!redirectedUrl) {
        return {
          success: false,
          statusCode: response.status,
          reason: "unsafe_unsubscribe_url",
        };
      }

      currentUrl = redirectedUrl;
      currentMethod = getRedirectMethod({
        currentMethod,
        statusCode: response.status,
      });
    }

    return {
      success: false,
      reason: "request_rejected",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, reason: "request_timeout" };
    }

    return { success: false, reason: "request_failed" };
  } finally {
    clearTimeout(timeout);
  }
}

function getSafeRedirectUrl({
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
