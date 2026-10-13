import type { ParsedMessage } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { PendingCorrection } from "@/utils/mail-corrections/changes";
import { classifyCorrection } from "@/utils/mail-corrections/changes";
import { getObservedMessage } from "@/utils/mail-corrections/message";
import { createEmailProvider } from "@/utils/email/provider";
import prisma from "@/utils/prisma";
import { applySpamTraining, enabledSpamModel } from "./store";
import { spamMessageKey } from "./identity";
import { extractSpamFeatures } from "./media";

export async function trainSpamMessage(
  emailAccountId: string,
  message: ParsedMessage,
  label: "good" | "spam",
  provider: EmailProvider,
  observedAt = new Date(),
) {
  if (!(await enabledSpamModel(emailAccountId))) return false;
  const features = await extractSpamFeatures(message, provider);
  return applySpamTraining({
    emailAccountId,
    message,
    label,
    observedAt,
    tokens: features.tokens,
    tokenizerVersion: features.version,
  });
}

export async function learnSpamCorrection(
  emailAccountId: string,
  change: PendingCorrection,
  logger: Logger,
): Promise<"learned" | "automatic" | "ignored"> {
  const correction = classifyCorrection(change);
  let label: "spam" | "good" | null = correction?.added.includes("@junk")
    ? "spam"
    : correction?.removed.includes("@junk")
      ? "good"
      : null;
  if (!correction || !(await enabledSpamModel(emailAccountId)))
    return "ignored";
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { account: { select: { provider: true } } },
  });
  if (!account) throw new Error("Correction account is unavailable");
  const provider = await createEmailProvider({
    emailAccountId,
    provider: account.account.provider,
    logger,
  });
  const message = await getObservedMessage(provider, change.after);
  if (label !== "good") {
    const automatic = await prisma.spamDecision.findUnique({
      where: {
        emailAccountId_messageKey: {
          emailAccountId,
          messageKey: spamMessageKey(message),
        },
      },
    });
    if (label === null) {
      // Polling can miss the Junk stop between automatic routing and a rescue.
      if (
        automatic?.verdict !== "spam" ||
        !automatic.moveStartedAt ||
        !automatic.movedAt ||
        automatic.moveStartedAt.getTime() < change.before.observedAt ||
        automatic.movedAt.getTime() > change.after.observedAt
      )
        return "ignored";
      label = "good";
    } else if (
      automatic?.moveStartedAt &&
      automatic.moveStartedAt.getTime() >= change.before.observedAt - 1000 &&
      automatic.moveStartedAt.getTime() <= change.after.observedAt
    )
      return "automatic";
  }
  await trainSpamMessage(
    emailAccountId,
    message,
    label,
    provider,
    new Date(change.since),
  );
  return "learned";
}
