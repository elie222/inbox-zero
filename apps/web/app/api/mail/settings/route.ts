import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { getDefaultMailSplitDraftsForAccount } from "@/utils/mail/default-splits.server";

export type MailSettingsResponse = Awaited<ReturnType<typeof getMailSettings>>;

async function getMailSettings({ emailAccountId }: { emailAccountId: string }) {
  const [emailAccount, defaultSplits] = await Promise.all([
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        mailLayout: true,
        mailSplits: {
          // createdAt breaks ties so tab order can't shuffle between requests
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            kind: true,
            value: true,
            order: true,
          },
        },
      },
    }),
    getDefaultMailSplitDraftsForAccount(emailAccountId),
  ]);

  return {
    layout: emailAccount?.mailLayout ?? null,
    splits: emailAccount?.mailSplits ?? [],
    defaultSplits,
  };
}

export const GET = withEmailAccount("mail/settings", async (request) => {
  const { emailAccountId } = request.auth;

  try {
    const result = await getMailSettings({ emailAccountId });
    return NextResponse.json(result);
  } catch (error) {
    request.logger.error("Error fetching mail settings", { error });
    return NextResponse.json(
      { error: "Failed to fetch mail settings" },
      { status: 500 },
    );
  }
});
