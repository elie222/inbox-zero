import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getExamples } from "@/app/api/user/group/[groupId]/examples/controller";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { hashApiKey } from "@/utils/api-key";

export async function GET(
  request: Request,
  { params }: { params: { groupId: string } },
) {
  const { groupId } = params;

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

  const examples = await getExamples({
    groupId,
    userId: user.id,
    gmail,
  });

  return NextResponse.json(examples);
}

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
