import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";

export async function getGmailClientForEmail({
  emailAccountId,
}: { emailAccountId: string }) {
  const tokens = await getTokens({ emailAccountId });
  const gmail = getGmailClient(tokens);
  return gmail;
}

export async function getGmailAndAccessTokenForEmail({
  emailAccountId,
}: { emailAccountId: string }) {
  const tokens = await getTokens({ emailAccountId });
  const gmailAndAccessToken = await getGmailAccessToken(tokens);
  return { ...gmailAndAccessToken, tokens };
}

export async function getGmailClientForEmailId({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: { select: { access_token: true, refresh_token: true } },
    },
  });
  const gmail = getGmailClient({
    accessToken: account?.account.access_token ?? undefined,
    refreshToken: account?.account.refresh_token ?? undefined,
  });
  return gmail;
}

async function getTokens({ emailAccountId }: { emailAccountId: string }) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: { access_token: true, refresh_token: true, expires_at: true },
      },
    },
  });

  return {
    accessToken: emailAccount?.account.access_token,
    refreshToken: emailAccount?.account.refresh_token,
    expiryDate: emailAccount?.account.expires_at,
  };
}
