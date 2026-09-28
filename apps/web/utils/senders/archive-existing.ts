import { after } from "next/server";
import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";

/** Inbox messages at or under this count are archived in the request. */
export const INLINE_ARCHIVE_EXISTING_MESSAGE_LIMIT = 100;

export async function archiveExistingSenderMail({
  emailAccountId,
  emailProvider,
  senderEmail,
  ownerEmail,
  logger,
}: {
  emailAccountId: string;
  emailProvider: EmailProvider;
  senderEmail: string;
  ownerEmail: string;
  logger: Logger;
}): Promise<"completed" | "queued"> {
  const inboxCount = await prisma.emailMessage.count({
    where: {
      emailAccountId,
      inbox: true,
      from: { equals: senderEmail, mode: "insensitive" },
    },
  });

  // Local rows are only a size hint. The provider inbox is the archive source,
  // including when stats have not ingested the sender yet.
  const archive = () =>
    emailProvider.bulkArchiveSenderOrThrow(
      senderEmail,
      ownerEmail,
      emailAccountId,
    );

  if (inboxCount <= INLINE_ARCHIVE_EXISTING_MESSAGE_LIMIT) {
    await archive();
    return "completed";
  }

  after(async () => {
    try {
      await archive();
    } catch (error) {
      logger.error("Failed to archive existing sender mail", { error });
    }
  });

  return "queued";
}
