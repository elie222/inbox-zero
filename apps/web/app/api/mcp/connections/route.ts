import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export const GET = withEmailAccount(async (req) => {
  const emailAccountId = req.auth.emailAccountId;
  const connections = await prisma.mcpConnection.findMany({
    where: { emailAccountId },
    select: {
      id: true,
      name: true,
      isActive: true,
      expiresAt: true,
      approvedScopes: true,
      approvedTools: true,
      createdAt: true,
      updatedAt: true,
      integration: {
        select: {
          id: true,
          name: true,
          displayName: true,
          description: true,
          authType: true,
          serverUrl: true,
          npmPackage: true,
        },
      },
      tools: {
        select: {
          id: true,
          name: true,
          title: true,
          description: true,
          isEnabled: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ connections });
});
