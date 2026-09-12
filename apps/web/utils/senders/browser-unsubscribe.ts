import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { canonicalizeEmailAddress } from "@/utils/email";
import { getHttpUnsubscribeLink } from "@/utils/parse/unsubscribe";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import { isSafeExternalHttpUrl } from "@/utils/network/safe-http-url";
import type { Logger } from "@/utils/logger";
import type { AutomaticUnsubscribeResult } from "@/utils/senders/unsubscribe";

const workerResultSchema = z.object({
  jobId: z.uuid(),
  status: z.enum(["confirmed", "needs_user", "failed"]),
});

export async function browserUnsubscribe({
  emailAccountId,
  senderEmail,
  logger,
}: {
  emailAccountId: string;
  senderEmail: string;
  logger: Logger;
}): Promise<AutomaticUnsubscribeResult> {
  const jobId = randomUUID();
  const deadline = Date.now() + 170_000;
  try {
    const workerUrl = new URL("/jobs", env.UNSUBSCRIBE_WORKER_URL);
    if (workerUrl.protocol !== "https:" || !env.UNSUBSCRIBE_WORKER_SECRET)
      throw new Error("Invalid worker configuration");
    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: emailAccountId },
      select: { email: true, account: { select: { provider: true } } },
    });
    const provider = await createEmailProvider({
      emailAccountId,
      provider: account.account.provider,
      logger,
    });
    const { messages } = await provider.getMessagesFromSender({
      senderEmail,
      maxResults: 5,
    });
    // Resolve from this account's mailbox, never a client-supplied recipient URL.
    let unsubscribeUrl: string | undefined;
    for (const message of messages) {
      if (canonicalizeEmailAddress(message.headers.from) !== senderEmail)
        continue;
      const url = getHttpUnsubscribeLink({
        listUnsubscribeHeader: message.headers["list-unsubscribe"],
        unsubscribeLink: findUnsubscribeLink(message.textHtml),
      });
      if (url?.startsWith("https:") && isSafeExternalHttpUrl(url)) {
        unsubscribeUrl = url;
        break;
      }
    }
    if (!unsubscribeUrl)
      return { attempted: false, success: false, reason: "no_unsubscribe_url" };
    const response = await fetch(workerUrl, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${env.UNSUBSCRIBE_WORKER_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jobId,
        url: unsubscribeUrl,
        recipientEmail: account.email,
      }),
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    });
    if (!response.ok) throw new Error("Worker request failed");
    const body = await readWorkerResponse(response);
    const result = workerResultSchema.parse(JSON.parse(body));
    if (result.jobId !== jobId) throw new Error("Mismatched worker result");
    logger.info("Browser unsubscribe completed", {
      jobId,
      status: result.status,
    });
    return {
      attempted: true,
      success: result.status === "confirmed",
      method: "browser",
      ...(result.status === "needs_user"
        ? { reason: "needs_user" as const }
        : {}),
    };
  } catch {
    logger.warn("Browser unsubscribe failed", { jobId });
    return {
      attempted: true,
      success: false,
      method: "browser",
      reason: "request_failed",
    };
  }
}

async function readWorkerResponse(response: Response) {
  if (!response.body) throw new Error("Empty worker response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) throw new Error("Invalid worker result");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    await reader.cancel();
  }
}
