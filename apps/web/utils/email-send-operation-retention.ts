import { EmailSendOperationStatus } from "@/generated/prisma/enums";
import { MAIL_MUTATION_RETRY_WINDOW_MS } from "@/utils/email/send-operation-policy";
import { deleteStaleMailUploads } from "@/utils/mail-api/upload-blobs";
import prisma from "@/utils/prisma";

export async function deleteExpiredEmailSendOperations(
  now = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - MAIL_MUTATION_RETRY_WINDOW_MS);
  // Three unrelated tables, so none of these sweeps waits on another.
  const [, , operations] = await Promise.all([
    // An undo hold only matters while its send can still be retried.
    prisma.scheduledEmail.deleteMany({
      where: {
        heldForUndo: true,
        status: { in: ["SENT", "CANCELLED", "FAILED", "UNCERTAIN"] },
        updatedAt: { lt: cutoff },
      },
    }),
    // Covers both uploads a composer abandoned and uploads whose send has aged
    // out of its retry window, which can no longer need them.
    deleteStaleMailUploads(cutoff),
    prisma.emailSendOperation.deleteMany({
      where: {
        status: {
          in: [
            EmailSendOperationStatus.SENT,
            EmailSendOperationStatus.UNCERTAIN,
          ],
        },
        updatedAt: { lt: cutoff },
      },
    }),
  ]);
  return operations.count;
}
