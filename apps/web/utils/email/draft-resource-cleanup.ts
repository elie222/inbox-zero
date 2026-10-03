import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { discardDraftResource } from "./draft-resource";

/** Replays durable discard intentions after a request or client has gone away. */
export async function cleanupDraftResources(logger: Logger) {
  const rows = await prisma.emailDraftResource.findMany({
    where: {
      owner: "DISCARD",
      state: { in: ["NOT_CREATED", "CREATING", "READY"] },
    },
    select: {
      id: true,
      emailAccountId: true,
      resourceKey: true,
      providerDraftId: true,
      emailAccount: { select: { account: { select: { provider: true } } } },
    },
    orderBy: { updatedAt: "asc" },
    take: 100,
  });
  let consumed = 0;
  let errors = 0;
  for (const row of rows) {
    try {
      const provider = row.providerDraftId
        ? await createEmailProvider({
            emailAccountId: row.emailAccountId,
            provider: row.emailAccount.account.provider,
            logger,
          })
        : undefined;
      const result = await discardDraftResource({
        accountId: row.emailAccountId,
        resourceKey: row.resourceKey,
        provider,
      });
      if (result.state === "CONSUMED") consumed += 1;
      else if (result.state === "UNCERTAIN") errors += 1;
    } catch (error) {
      errors += 1;
      logger.error("Could not finish owned draft cleanup", {
        resourceKey: row.resourceKey,
        error,
      });
    } finally {
      // Rotate examined pending rows, so disconnected accounts cannot monopolize the bounded batch.
      await prisma.emailDraftResource
        .updateMany({
          where: { id: row.id, owner: "DISCARD", state: { not: "CONSUMED" } },
          data: { updatedAt: new Date() },
        })
        .catch((error) =>
          logger.error("Could not advance draft cleanup queue", {
            resourceKey: row.resourceKey,
            error,
          }),
        );
    }
  }
  return { examined: rows.length, consumed, errors };
}
