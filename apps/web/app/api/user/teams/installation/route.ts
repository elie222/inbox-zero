import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import type { GetTeamsInstallationResponse } from "@/hooks/useTeamsInstallation";

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;

  const installation = await prisma.teamsInstallation.findFirst({
    where: {
      userId,
      isActive: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const response: GetTeamsInstallationResponse = {
    installation: installation
      ? {
          id: installation.id,
          tenantId: installation.tenantId,
          tenantName: installation.tenantName,
          userEmail: installation.userEmail,
          installedTeams: installation.installedTeams as any[] | null,
          isActive: installation.isActive,
          createdAt: installation.createdAt.toISOString(),
          updatedAt: installation.updatedAt.toISOString(),
        }
      : null,
  };

  return NextResponse.json(response);
});