import { notFound } from "next/navigation";
import { cookies } from "next/headers";
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
import {
  LAST_EMAIL_ACCOUNT_COOKIE,
  parseLastEmailAccountCookieValue,
} from "@/utils/cookies";
import type { Logger } from "@/utils/logger";
import { buildRedirectUrl } from "@/utils/redirect";

export async function getGmailClientForEmail({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  const tokens = await getTokens({ emailAccountId });
  const gmail = getGmailClientWithRefresh({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || "",
    expiresAt: tokens.expiresAt,
    emailAccountId,
    logger,
  });
  return gmail;
}

export async function getGmailAndAccessTokenForEmail({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  const tokens = await getTokens({ emailAccountId });
  const gmail = await getGmailClientWithRefresh({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || "",
    expiresAt: tokens.expiresAt,
    emailAccountId,
    logger,
  });
  const accessToken = getAccessTokenFromClient(gmail);
  return { gmail, accessToken, tokens };
}

export async function getOutlookClientForEmail({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  const tokens = await getTokens({ emailAccountId });
  const outlook = await getOutlookClientWithRefresh({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || "",
    expiresAt: tokens.expiresAt,
    emailAccountId,
    logger,
  });
  return outlook;
}

export async function getOutlookAndAccessTokenForEmail({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  const tokens = await getTokens({ emailAccountId });
  const outlook = await getOutlookClientWithRefresh({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || "",
    expiresAt: tokens.expiresAt,
    emailAccountId,
    logger,
  });
  const accessToken = getOutlookAccessToken(outlook);
  return { outlook, accessToken, tokens };
}

export async function getOutlookClientForEmailId({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
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
    logger,
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

export async function redirectToEmailAccountPath(
  path: `/${string}`,
  searchParams?: Record<string, string | string[] | undefined>,
) {
  const session = await auth();
  const userId = session?.user.id;
  if (!userId) throw new Error("Not authenticated");

  const lastEmailAccountId = await getLastEmailAccountFromCookie(userId);

  let emailAccountId = lastEmailAccountId;

  // If no last account or it doesn't exist, fall back to first account
  if (!emailAccountId) {
    const emailAccount = await prisma.emailAccount.findFirst({
      where: { userId },
    });
    emailAccountId = emailAccount?.id ?? null;
  }

  if (!emailAccountId) {
    notFound();
  }

  const redirectUrl = buildRedirectUrl(
    `/${emailAccountId}${path}`,
    searchParams,
  );

  redirect(redirectUrl);
}

async function getLastEmailAccountFromCookie(
  userId: string,
): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(LAST_EMAIL_ACCOUNT_COOKIE)?.value;
    return parseLastEmailAccountCookieValue({ userId, cookieValue });
  } catch {
    return null;
  }
}
