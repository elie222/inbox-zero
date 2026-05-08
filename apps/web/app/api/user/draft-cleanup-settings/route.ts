import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { SafeError } from "@/utils/error";

export type GetDraftCleanupSettingsResponse = Awaited<
  ReturnType<typeof getDraftCleanupSettings>
>;

async function getDraftCleanupSettings({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { draftCleanupDays: true },
  });

  if (!emailAccount) throw new SafeError("Email account not found");

  return { draftCleanupDays: emailAccount.draftCleanupDays };
}

export const GET = withEmailAccount(
  "user/draft-cleanup-settings",
  async (request) => {
    const result = await getDraftCleanupSettings({
      emailAccountId: request.auth.emailAccountId,
    });

    return NextResponse.json(result);
  },
);
