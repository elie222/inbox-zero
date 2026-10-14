import type { Observation } from "@/utils/mail-corrections/changes";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { getObservedMessage } from "@/utils/mail-corrections/message";
import { enabledSpamModel } from "@/utils/spam/store";
import { filterSpam } from "@/utils/spam/gate";
import { runRulesForMessage } from "@/utils/ai/choose-rule/run-rules-for-message";
import {
  AutomaticFilingDeferredError,
  isReadyForFiling,
} from "@/utils/mail-corrections/filing-eligibility";

export async function processObservedArrivals({
  emailAccountId,
  observations,
  previous,
  initialized,
  logger,
  fileAfterReading = false,
}: {
  emailAccountId: string;
  observations: Observation[];
  previous: Record<string, Observation>;
  initialized: boolean;
  logger: Logger;
  fileAfterReading?: boolean;
}) {
  const deferred: string[] = [];
  if (!initialized) return deferred;
  const arrivals = observations.filter(
    (item) => !previous[item.key] && item.targets.includes("@inbox"),
  );
  if (!arrivals.length) return deferred;
  const model = await enabledSpamModel(emailAccountId);
  const account = await prisma.emailAccount.findUniqueOrThrow({
    where: { id: emailAccountId },
    select: {
      userId: true,
      createdAt: true,
      account: { select: { provider: true } },
    },
  });
  const provider = await createEmailProvider({
    emailAccountId,
    provider: account.account.provider,
    logger,
  });
  for (const arrival of arrivals) {
    const message = await getObservedMessage(provider, arrival);
    // A reset or a previously unobserved archive move must not sweep historical mail.
    const receivedAt = message.internalDate
      ? Number(message.internalDate)
      : Date.parse(message.date);
    if (
      !Number.isFinite(receivedAt) ||
      receivedAt < account.createdAt.getTime()
    )
      continue;
    if (!message.labelIds?.includes("INBOX")) continue;
    if (model && receivedAt >= model.createdAt.getTime()) {
      const verdict = await filterSpam({ emailAccountId, message, provider });
      if (verdict?.spam) continue;
    }
    if (fileAfterReading && !isReadyForFiling(message)) {
      deferred.push(arrival.key);
      continue;
    }
    let results: Awaited<ReturnType<typeof runRulesForMessage>>;
    try {
      results = await runRulesForMessage({
        emailAccountId,
        userId: account.userId,
        provider: account.account.provider,
        logger,
        messageId: message.id,
        threadId: message.threadId,
        isTest: false,
        rerun: false,
        requireInbox: true,
        requireReadUnflagged: fileAfterReading,
      });
    } catch (error) {
      if (!(error instanceof AutomaticFilingDeferredError)) throw error;
      deferred.push(arrival.key);
      continue;
    }
    if (
      results.some(
        (result) => result.status === "ERROR" || result.status === "APPLYING",
      )
    )
      throw new Error(
        "Arrival classification did not complete; review the recorded action before retrying",
      );
  }
  return deferred;
}
