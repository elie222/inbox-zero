import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { SNOOZE_EXECUTION_LEASE_MS } from "@/utils/snooze/scheduler";

const logger = createScopedLogger("snooze/mutation-lease");

export async function withSnoozeMutationLease<T>(
  emailAccountId: string,
  run: () => Promise<T>,
): Promise<T | null> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + SNOOZE_EXECUTION_LEASE_MS);
  // A rollback may touch messages that moved to another conversation, so the
  // competing-snooze check and provider write share a mailbox-wide lease.
  const claimed = await prisma.$executeRaw`
    UPDATE "EmailAccount" SET "snoozeMutationLeaseUntil" = ${leaseUntil}
    WHERE "id" = ${emailAccountId}
      AND ("snoozeMutationLeaseUntil" IS NULL OR "snoozeMutationLeaseUntil" <= ${now})
  `;
  if (!claimed) return null;

  try {
    return await run();
  } finally {
    try {
      await prisma.$executeRaw`
        UPDATE "EmailAccount" SET "snoozeMutationLeaseUntil" = NULL
        WHERE "id" = ${emailAccountId} AND "snoozeMutationLeaseUntil" = ${leaseUntil}
      `;
    } catch (error) {
      logger.warn("Failed to release the snooze mutation lease", {
        emailAccountId,
        error,
      });
    }
  }
}
