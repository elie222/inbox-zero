import type { Observation } from "@/utils/mail-corrections/changes";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { getObservedMessage } from "@/utils/mail-corrections/message";
import { enabledSpamModel } from "./store";
import { filterSpam } from "./gate";

export async function filterObservedSpam({
  emailAccountId,
  observations,
  previous,
  initialized,
  logger,
}: {
  emailAccountId: string;
  observations: Observation[];
  previous: Record<string, Observation>;
  initialized: boolean;
  logger: Logger;
}) {
  if (!initialized) return;
  const arrivals = observations.filter(
    (item) => !previous[item.key] && item.targets.includes("@inbox"),
  );
  if (!arrivals.length) return;
  const model = await enabledSpamModel(emailAccountId);
  if (!model) return;
  const account = await prisma.emailAccount.findUniqueOrThrow({
    where: { id: emailAccountId },
    select: { account: { select: { provider: true } } },
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
    if (!Number.isFinite(receivedAt) || receivedAt < model.createdAt.getTime())
      continue;
    if (!message.labelIds?.includes("INBOX")) continue;
    await filterSpam({ emailAccountId, message, provider });
  }
}
