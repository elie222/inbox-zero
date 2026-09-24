import { blobIdSchema } from "@inboxzero/mail-core/identities";
import { deleteUnheldBlob } from "@inboxzero/mail-sqlite/blob-store";
import { EmailSendOperationStatus } from "@/generated/prisma/enums";
import { MAIL_MUTATION_RETRY_WINDOW_MS } from "@/utils/email/send-operation-policy";
import { accountMailUploadDirectory } from "@/utils/mail-api/upload-blobs";
import prisma from "@/utils/prisma";

export async function deleteExpiredEmailSendOperations(
  now = new Date(),
): Promise<number> {
  const expiredWhere = expiredSendOperationWhere(now);
  const expired = await prisma.emailSendOperation.findMany({
    where: expiredWhere,
    select: { id: true, emailAccountId: true, attachmentIds: true },
  });
  if (expired.length === 0) return 0;
  for (const operation of expired) {
    await deleteAccountUploads(
      operation.emailAccountId,
      operation.attachmentIds,
    );
  }
  const result = await prisma.emailSendOperation.deleteMany({
    where: {
      id: { in: expired.map((operation) => operation.id) },
      ...expiredWhere,
    },
  });
  return result.count;
}

function expiredSendOperationWhere(now: Date) {
  return {
    status: {
      in: [EmailSendOperationStatus.SENT, EmailSendOperationStatus.UNCERTAIN],
    },
    updatedAt: {
      lt: new Date(now.getTime() - MAIL_MUTATION_RETRY_WINDOW_MS),
    },
  };
}

async function deleteAccountUploads(
  accountId: string,
  attachmentIds: string[],
) {
  if (attachmentIds.length === 0) return;
  const directory = accountMailUploadDirectory(accountId);
  for (const blobId of attachmentIds) {
    const parsed = blobIdSchema.safeParse(blobId);
    if (!parsed.success) continue;
    await deleteUnheldBlob(directory, parsed.data).catch(() => undefined);
  }
}
