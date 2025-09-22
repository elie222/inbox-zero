import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";

export const GET = withAuth(async (req) => {
  const userId = req.auth.userId;
  const connections = await prisma.mcpConnection.findMany({
    where: { userId },
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

