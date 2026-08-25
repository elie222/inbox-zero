import { EmailSendOperationStatus } from "@/generated/prisma/enums";
import { MAIL_MUTATION_RETRY_WINDOW_MS } from "@/utils/email-cache/policy";
import prisma from "@/utils/prisma";

export async function deleteExpiredEmailSendOperations(
  now = new Date(),
): Promise<number> {
  const result = await prisma.emailSendOperation.deleteMany({
    where: {
      status: {
        in: [EmailSendOperationStatus.SENT, EmailSendOperationStatus.UNCERTAIN],
      },
      updatedAt: {
        lt: new Date(now.getTime() - MAIL_MUTATION_RETRY_WINDOW_MS),
      },
    },
  });

  return result.count;
}
