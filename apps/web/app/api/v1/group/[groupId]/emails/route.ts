import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getGroupEmails } from "@/app/api/user/group/[groupId]/messages/controller";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { hashApiKey } from "@/utils/api-key";
import {
  groupEmailsQuerySchema,
  type GroupEmailsResult,
} from "@/app/api/v1/group/[groupId]/emails/validation";
import { withError } from "@/utils/middleware";

export const GET = withError(async (request: NextRequest, { params }) => {
  const { groupId } = params;
  if (!groupId)
    return NextResponse.json({ error: "Missing groupId" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const queryResult = groupEmailsQuerySchema.safeParse(
    Object.fromEntries(searchParams),
  );

  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 },
    );
  }

  const apiKey = request.headers.get("API-Key");

  if (!apiKey)
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });

  const user = await getUserFromApiKey(apiKey);

  if (!user)
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  const account = user.accounts[0];

  if (!account)
    return NextResponse.json({ error: "Missing account" }, { status: 401 });

  if (!account.access_token || !account.refresh_token || !account.expires_at)
    return NextResponse.json(
      { error: "Missing access token" },
      { status: 401 },
    );

  const gmail = await getGmailClientWithRefresh(
    {
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
      expiryDate: account.expires_at,
    },
    account.providerAccountId,
  );

  if (!gmail) {
    return NextResponse.json(
      { error: "Error refreshing Gmail access token" },
      { status: 401 },
    );
  }

  const { pageToken, from, to } = queryResult.data;

  const { messages, nextPageToken } = await getGroupEmails({
    groupId,
    userId: user.id,
    gmail,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    pageToken,
  });

  const result: GroupEmailsResult = {
    messages,
    nextPageToken,
  };

  return NextResponse.json(result);
});

async function getUserFromApiKey(secretKey: string) {
  const hashedKey = hashApiKey(secretKey);

  const result = await prisma.apiKey.findUnique({
    where: { hashedKey, isActive: true },
    select: {
      user: {
        select: {
          id: true,
          accounts: {
            select: {
              access_token: true,
              refresh_token: true,
              expires_at: true,
              providerAccountId: true,
            },
            where: { provider: "google" },
            take: 1,
          },
        },
      },
      isActive: true,
    },
  });

  return result?.user;
}
