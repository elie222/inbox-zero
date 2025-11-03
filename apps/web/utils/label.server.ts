import type { EmailProvider } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

/**
 * Labels a message and automatically updates the database if a stale label ID was detected and fixed.
 *
 * This handles the case where labels/categories are deleted and recreated with new IDs:
 * - Tries to label with the provided ID
 * - If that fails and labelName is provided, falls back to looking up by name
 * - If the actual ID used differs from the stored ID, updates ALL Actions with that stale ID
 */
export async function labelMessageAndSync({
  provider,
  messageId,
  labelId,
  labelName,
  emailAccountId,
}: {
  provider: EmailProvider;
  messageId: string;
  labelId: string;
  labelName: string | null;
  emailAccountId: string;
}): Promise<void> {
  const logger = createScopedLogger("label.server").with({
    provider,
    messageId,
    labelId,
    labelName,
    emailAccountId,
  });

  const result = await provider.labelMessage({
    messageId,
    labelId,
    labelName,
  });

  // If we had to use fallback and got a different ID, update all Actions with the stale ID
  if (
    result.usedFallback &&
    result.actualLabelId &&
    result.actualLabelId !== labelId
  ) {
    logger.info("Detected stale label ID, updating all instances in database", {
      oldLabelId: labelId,
      newLabelId: result.actualLabelId,
    });

    try {
      const updateResult = await prisma.action.updateMany({
        where: {
          labelId,
          rule: { emailAccountId },
        },
        data: { labelId: result.actualLabelId },
      });

      logger.info("Updated stale label IDs across all actions", {
        newLabelId: result.actualLabelId,
        updatedCount: updateResult.count,
      });
    } catch (error) {
      // Don't fail the whole operation if DB update fails
      logger.error("Failed to update stale label IDs", {
        newLabelId: result.actualLabelId,
        error,
      });
    }
  }
}
