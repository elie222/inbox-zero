import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type MailSettingsResponse = Awaited<ReturnType<typeof getMailSettings>>;

async function getMailSettings({ emailAccountId }: { emailAccountId: string }) {
  const [emailAccount, splits] = await Promise.all([
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { mailLayout: true, mailHintBarDismissed: true },
    }),
    prisma.mailSplit.findMany({
      where: { emailAccountId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, kind: true, value: true, order: true },
    }),
  ]);

  return {
    layout: emailAccount?.mailLayout ?? null,
    hintBarDismissed: emailAccount?.mailHintBarDismissed ?? false,
    splits,
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
