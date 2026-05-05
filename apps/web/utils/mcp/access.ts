import { env } from "@/env";
import prisma from "@/utils/prisma";

export async function getMcpServerAccess(userId: string) {
  if (!env.MCP_SERVER_ENABLED) {
    return { available: false, enabled: false };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mcpServerEnabled: true },
  });

  return {
    available: true,
    enabled: user?.mcpServerEnabled ?? false,
  };
}

export async function isMcpServerEnabledForUser(userId: string) {
  const access = await getMcpServerAccess(userId);

  return access.available && access.enabled;
}
