import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getOutlookFolders } from "@/utils/outlook/folders";
import { getOutlookClientWithRefresh } from "@/utils/outlook/client";
import prisma from "@/utils/prisma";

export type GetFoldersResponse = Awaited<ReturnType<typeof getFolders>>;

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getFolders({ emailAccountId });
  return NextResponse.json(result);
});

async function getFolders({ emailAccountId }: { emailAccountId: string }) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: {
          provider: true,
          access_token: true,
          refresh_token: true,
          expires_at: true,
        },
      },
    },
  });

  if (emailAccount?.account?.provider === "microsoft") {
    const client = await getOutlookClientWithRefresh({
      accessToken: emailAccount.account.access_token,
      refreshToken: emailAccount.account.refresh_token,
      expiresAt: emailAccount.account.expires_at
        ? Math.floor(emailAccount.account.expires_at.getTime() / 1000)
        : null,
      emailAccountId,
    });
    return getOutlookFolders(client);
  }

  return [];
}
