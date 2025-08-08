import { auth } from "@/utils/auth";
import {
  getGmailClientWithRefresh,
  getAccessTokenFromClient,
} from "@/utils/gmail/client";
import {
  getOutlookClientWithRefresh,
  getAccessTokenFromClient as getOutlookAccessToken,
} from "@/utils/outlook/client";
import { redirect } from "next/navigation";
import prisma from "@/utils/prisma";
import { notFound } from "next/navigation";

export async function getGmailClientForEmail({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const tokens = await getTokens({ emailAccountId });
  const gmail = getGmailClientWithRefresh({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || "",
    expiresAt: tokens.expiresAt,
    emailAccountId,
  });
  return gmail;
}

export async function getGmailAndAccessTokenForEmail({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const tokens = await getTokens({ emailAccountId });
  const gmail = await getGmailClientWithRefresh({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || "",
    expiresAt: tokens.expiresAt,
    emailAccountId,
  });
  const accessToken = getAccessTokenFromClient(gmail);
  return { gmail, accessToken, tokens };
}

export async function getGmailClientForEmailId({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: { access_token: true, refresh_token: true, expires_at: true },
      },
    },
  });
  const gmail = getGmailClientWithRefresh({
    accessToken: account?.account.access_token,
    refreshToken: account?.account.refresh_token || "",
    expiresAt: account?.account.expires_at?.getTime() ?? null,
    emailAccountId,
  });
  return gmail;
}

export async function getOutlookClientForEmail({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const tokens = await getTokens({ emailAccountId });
  const outlook = await getOutlookClientWithRefresh({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || "",
    expiresAt: tokens.expiresAt,
    emailAccountId,
  });
  return outlook;
}

export async function getOutlookAndAccessTokenForEmail({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const tokens = await getTokens({ emailAccountId });
  const outlook = await getOutlookClientWithRefresh({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || "",
    expiresAt: tokens.expiresAt,
    emailAccountId,
  });
  const accessToken = getOutlookAccessToken(outlook);
  return { outlook, accessToken, tokens };
}

export async function getOutlookClientForEmailId({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: { access_token: true, refresh_token: true, expires_at: true },
      },
    },
  });
  const outlook = await getOutlookClientWithRefresh({
    accessToken: account?.account.access_token,
    refreshToken: account?.account.refresh_token || "",
    expiresAt: account?.account.expires_at?.getTime() ?? null,
    emailAccountId,
  });
  return outlook;
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
    expiresAt: emailAccount?.account.expires_at?.getTime() ?? null,
  };
}

export async function redirectToEmailAccountPath(path: `/${string}`) {
  const session = await auth();
  const userId = session?.user.id;
  if (!userId) throw new Error("Not authenticated");

  const emailAccount = await prisma.emailAccount.findFirst({
    where: { userId },
  });

  if (!emailAccount) {
    notFound();
  }

  const redirectUrl = `/${emailAccount.id}${path}`;

  redirect(redirectUrl);
}
