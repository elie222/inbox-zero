import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type InstalledPluginsResponse = Awaited<ReturnType<typeof getInstalled>>;

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;
  const result = await getInstalled({ emailAccountId });
  return NextResponse.json(result);
});

async function getInstalled({ emailAccountId }: { emailAccountId: string }) {
  // get user from email account
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { userId: true },
  });

  if (!emailAccount) {
    return { plugins: [] };
  }

  // get all installed plugins
  const installedPlugins = await prisma.installedPlugin.findMany({
    include: {
      userSettings: {
        where: { userId: emailAccount.userId },
      },
    },
    orderBy: { installedAt: "desc" },
  });

  const plugins = installedPlugins.map((plugin) => ({
    id: plugin.pluginId,
    version: plugin.version,
    enabled: plugin.userSettings[0]?.enabled ?? plugin.enabled,
    installedAt: plugin.installedAt.toISOString(),
    lastRunAt: null as string | null, // TODO: track execution history in separate table
  }));

  return { plugins };
}
