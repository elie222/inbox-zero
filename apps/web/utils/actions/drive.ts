"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { disconnectDriveBody } from "@/utils/actions/drive.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";

export const disconnectDriveAction = actionClient
  .metadata({ name: "disconnectDrive" })
  .inputSchema(disconnectDriveBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { connectionId } }) => {
      const connection = await prisma.driveConnection.findFirst({
        where: {
          id: connectionId,
          emailAccountId,
        },
      });

      if (!connection) {
        throw new SafeError("Drive connection not found");
      }

      await prisma.driveConnection.delete({
        where: { id: connectionId },
      });

      return { success: true };
    },
  );
