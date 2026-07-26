import { NextResponse } from "next/server";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import {
  isValidThunderbirdBridgeRequest,
  thunderbirdUnauthorizedResponse,
} from "@/utils/thunderbird/auth";
import { isThunderbirdProvider } from "@/utils/email/provider-types";

const registerSchema = z.object({
  email: z.string().email(),
  thunderbirdAccountId: z.string().min(1),
  displayName: z.string().optional(),
});

export const GET = withError("thunderbird/accounts", async (request) => {
  const logger = request.logger.with({ module: "thunderbird-bridge" });

  if (!isValidThunderbirdBridgeRequest(request, logger)) {
    return thunderbirdUnauthorizedResponse();
  }

  const accounts = await prisma.emailAccount.findMany({
    where: { account: { provider: "thunderbird" } },
    select: {
      id: true,
      email: true,
      name: true,
      account: { select: { providerAccountId: true } },
    },
  });

  return NextResponse.json({
    accounts: accounts.map((account) => ({
      emailAccountId: account.id,
      email: account.email,
      name: account.name,
      thunderbirdAccountId: account.account.providerAccountId,
    })),
  });
});

export const POST = withError("thunderbird/accounts/register", async (request) => {
  const logger = request.logger.with({ module: "thunderbird-bridge" });

  if (!isValidThunderbirdBridgeRequest(request, logger)) {
    return thunderbirdUnauthorizedResponse();
  }

  const body = registerSchema.parse(await request.json());
  const email = body.email.toLowerCase();

  const existing = await prisma.emailAccount.findUnique({
    where: { email },
    include: { account: true },
  });

  if (existing) {
    if (!isThunderbirdProvider(existing.account.provider)) {
      return NextResponse.json(
        {
          error: `Account ${email} already exists with provider=${existing.account.provider}`,
        },
        { status: 409 },
      );
    }

    await prisma.account.update({
      where: { id: existing.accountId },
      data: { providerAccountId: body.thunderbirdAccountId },
    });

    if (body.displayName && body.displayName !== existing.name) {
      await prisma.emailAccount.update({
        where: { id: existing.id },
        data: { name: body.displayName },
      });
    }

    return NextResponse.json({
      ok: true,
      emailAccountId: existing.id,
      email: existing.email,
      created: false,
    });
  }

  const bridgeUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: "thunderbird-bridge@localhost" },
        { accounts: { some: { provider: "thunderbird" } } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (!bridgeUser) {
    return NextResponse.json(
      {
        error:
          "No Thunderbird bridge user found. Run: pnpm --filter inbox-zero-ai exec tsx scripts/setup-thunderbird-bridge.ts",
      },
      { status: 404 },
    );
  }

  const account = await prisma.account.create({
    data: {
      userId: bridgeUser.id,
      provider: "thunderbird",
      type: "credentials",
      providerAccountId: body.thunderbirdAccountId,
      access_token: "thunderbird-local",
    },
  });

  const emailAccount = await prisma.emailAccount.create({
    data: {
      email,
      name: body.displayName || email,
      userId: bridgeUser.id,
      accountId: account.id,
    },
  });

  logger.info("Registered Thunderbird email account", {
    emailAccountId: emailAccount.id,
    email,
  });

  return NextResponse.json({
    ok: true,
    emailAccountId: emailAccount.id,
    email: emailAccount.email,
    created: true,
  });
});
