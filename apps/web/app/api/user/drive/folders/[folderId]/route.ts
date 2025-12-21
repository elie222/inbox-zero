import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import { SafeError } from "@/utils/error";

export type GetSubfoldersResponse = {
  folders: Array<{
    id: string;
    name: string;
    path: string;
    driveConnectionId: string;
    provider: string;
  }>;
};

export const GET = withEmailAccount(async (request, context) => {
  const logger = request.logger;
  const { emailAccountId } = request.auth;
  const { folderId } = (await context.params) as { folderId: string };

  // Get the drive connection ID from the query params
  const { searchParams } = new URL(request.url);
  const driveConnectionId = searchParams.get("driveConnectionId");

  if (!driveConnectionId) {
    throw new SafeError("Drive connection ID is required");
  }

  // Get the drive connection
  const driveConnection = await prisma.driveConnection.findFirst({
    where: {
      id: driveConnectionId,
      emailAccountId,
      isConnected: true,
    },
  });

  if (!driveConnection) {
    throw new SafeError("Drive connection not found");
  }

  // Fetch subfolders
  const provider = await createDriveProviderWithRefresh(
    driveConnection,
    logger,
  );
  const subfolders = await provider.listFolders(folderId);

  return NextResponse.json({
    folders: subfolders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      path: folder.path || folder.name,
      driveConnectionId: driveConnection.id,
      provider: driveConnection.provider,
    })),
  } satisfies GetSubfoldersResponse);
});
