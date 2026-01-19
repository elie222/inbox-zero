import { z } from "zod";
import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";

const querySchema = z.object({ driveConnectionId: z.string() });
export type GetSubfoldersQuery = z.infer<typeof querySchema>;

export type GetSubfoldersResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount(async (request, context) => {
  const { emailAccountId } = request.auth;
  const { folderId } = await context.params;

  const { searchParams } = new URL(request.url);

  const { driveConnectionId } = querySchema.parse({
    driveConnectionId: searchParams.get("driveConnectionId"),
  });

  const result = await getData({
    driveConnectionId,
    emailAccountId,
    folderId,
    logger: request.logger,
  });

  return NextResponse.json(result);
});

async function getData({
  driveConnectionId,
  emailAccountId,
  folderId,
  logger,
}: {
  driveConnectionId: string;
  emailAccountId: string;
  folderId: string;
  logger: Logger;
}) {
  const driveConnection = await prisma.driveConnection.findFirst({
    where: {
      id: driveConnectionId,
      emailAccountId,
      isConnected: true,
    },
  });

  if (!driveConnection) throw new SafeError("Drive connection not found");

  const provider = await createDriveProviderWithRefresh(
    driveConnection,
    logger,
  );
  const subfolders = await provider.listFolders(folderId);

  return {
    folders: subfolders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      path: folder.path || folder.name,
      driveConnectionId: driveConnection.id,
      provider: driveConnection.provider,
    })),
  };
}
