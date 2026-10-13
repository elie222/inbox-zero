"use server";
import { actionClient, actionClientUser } from "@/utils/actions/safe-action";
import {
  connectICloudBody,
  updateICloudFoldersBody,
} from "@/utils/actions/icloud.validation";
import { connectICloud, getICloudConnection } from "@/utils/icloud/connection";
import { withICloudClient } from "@/utils/icloud/client";
import { validateICloudFolders } from "@/utils/icloud/folders";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";

export const connectICloudAction = actionClientUser
  .metadata({ name: "connectICloud" })
  .inputSchema(connectICloudBody)
  .action(async ({ ctx: { userId }, parsedInput }) =>
    connectICloud({ userId, ...parsedInput }),
  );

export const updateICloudFoldersAction = actionClient
  .metadata({ name: "updateICloudFolders" })
  .inputSchema(updateICloudFoldersBody)
  .action(async ({ ctx: { emailAccountId, provider }, parsedInput }) => {
    if (provider !== "icloud")
      throw new SafeError("This account is not an iCloud account.");
    const connection = await getICloudConnection(emailAccountId);
    const folders = await withICloudClient(connection, async (client) =>
      validateICloudFolders(parsedInput, await client.list()),
    );
    await prisma.iCloudConnection.update({
      where: { emailAccountId },
      data: { folders },
    });
  });
