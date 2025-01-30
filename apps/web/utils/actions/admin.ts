"use server";

import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { processHistoryForUser } from "@/app/api/google/webhook/process-history";
import { isAdmin } from "@/utils/admin";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { createScopedLogger } from "@/utils/logger";
import { deleteUser } from "@/utils/user/delete";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("Admin Action");

export const adminProcessHistoryAction = withActionInstrumentation(
  "adminProcessHistory",
  async ({
    emailAddress,
    historyId,
    startHistoryId,
  }: {
    emailAddress: string;
    historyId?: number;
    startHistoryId?: number;
  }) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };
    if (!isAdmin(session.user.email)) return { error: "Not admin" };

    logger.info("Admin processing history", { emailAddress });

    await processHistoryForUser(
      {
        emailAddress,
        historyId: historyId ? historyId : 0,
      },
      {
        startHistoryId: startHistoryId ? startHistoryId.toString() : undefined,
      },
    );
  },
);

export const adminDeleteAccountAction = withActionInstrumentation(
  "adminDeleteAccount",
  async (email: string) => {
    const session = await auth();
    if (!session?.user) return { error: "Not logged in" };
    if (!isAdmin(session.user.email)) return { error: "Not admin" };

    try {
      const userToDelete = await prisma.user.findUnique({ where: { email } });
      if (!userToDelete) return { error: "User not found" };

      await deleteUser({ userId: userToDelete.id, email });
    } catch (error) {
      logger.error("Failed to delete user", { email, error });
      return {
        error: `Failed to delete user: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return { success: "User deleted" };
  },
);
