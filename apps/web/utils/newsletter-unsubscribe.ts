import { isIP } from "node:net";
import { NewsletterStatus } from "@/generated/prisma/enums";
import { extractEmailAddress } from "@/utils/email";
import type { Logger } from "@/utils/logger";
import { createScopedLogger } from "@/utils/logger";
import { getHttpUnsubscribeLink } from "@/utils/parse/unsubscribe";
import prisma from "@/utils/prisma";

const ONE_CLICK_REQUEST_BODY = "List-Unsubscribe=One-Click";
const UNSUBSCRIBE_REQUEST_TIMEOUT_MS = 10_000;

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

export async function setNewsletterStatus({
  emailAccountId,
  newsletterEmail,
  status,
}: {
  emailAccountId: string;
  newsletterEmail: string;
  status: NewsletterStatus | null;
}) {
  const email = extractEmailAddress(newsletterEmail);
  if (!email) throw new Error("Invalid newsletter email address");

  return prisma.newsletter.upsert({
    where: {
      email_emailAccountId: { email, emailAccountId },
    },
    create: {
      status,
      email,
      emailAccountId,
    },
    update: { status },
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
  logger?: Logger;
}) {
  const senderEmail = extractEmailAddress(newsletterEmail);
  if (!senderEmail) throw new Error("Invalid newsletter email address");

  const log = (logger || createScopedLogger("newsletter-unsubscribe")).with({
    action: "unsubscribe-sender",
  });

  const unsubscribe = await attemptAutomaticUnsubscribe({
    unsubscribeLink,
    listUnsubscribeHeader,
    logger: log,
  });

  await setNewsletterStatus({
    emailAccountId,
    newsletterEmail: senderEmail,
    status: NewsletterStatus.UNSUBSCRIBED,
  });

  log.trace("Marked sender as unsubscribed", { senderEmail });

  return {
    senderEmail,
    status: NewsletterStatus.UNSUBSCRIBED,
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

  if (!isSafeUnsubscribeUrl(unsubscribeUrl)) {
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
    const response = await fetch(unsubscribeUrl, {
      method,
      headers: {
        Accept: "*/*",
        ...(method === "POST"
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
      },
      ...(method === "POST" ? { body: ONE_CLICK_REQUEST_BODY } : {}),
      signal: controller.signal,
      redirect: "follow",
    });

    return {
      success: response.ok,
      statusCode: response.status,
      reason: response.ok ? undefined : "request_rejected",
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

function isSafeUnsubscribeUrl(unsubscribeUrl: string) {
  try {
    const parsed = new URL(unsubscribeUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      return false;

    const hostname = parsed.hostname.toLowerCase();
    if (!hostname) return false;
    if (hostname === "localhost" || hostname.endsWith(".local")) return false;

    const ipVersion = isIP(hostname);
    if (ipVersion === 4) return !isPrivateIpv4(hostname);
    if (ipVersion === 6) return !isPrivateIpv6(hostname);

    if (!hostname.includes(".")) return false;
    return true;
  } catch {
    return false;
  }
}

function isPrivateIpv4(hostname: string) {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet)))
    return true;

  const [first, second] = octets;
  if (first === 10) return true;
  if (first === 127) return true;
  if (first === 0) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  if (first === 198 && (second === 18 || second === 19)) return true;
  if (first >= 224) return true;

  return false;
}

function isPrivateIpv6(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}
