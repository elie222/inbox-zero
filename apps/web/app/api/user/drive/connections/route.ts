import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GetDriveConnectionsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount(
  "user/drive/connections",
  async (request) => {
    const { emailAccountId } = request.auth;

    const result = await getData({ emailAccountId });
    return NextResponse.json(result);
  },
);

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const driveConnections = await prisma.driveConnection.findMany({
    where: { emailAccountId },
    select: {
      id: true,
      email: true,
      provider: true,
      isConnected: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    connections: driveConnections,
  };
}
