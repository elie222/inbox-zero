import { NextResponse } from "next/server";
import { z } from "zod";
import { createEmailProvider } from "@/utils/email/provider";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { loadRecentOtpSummary } from "./summary";

const querySchema = z.object({
  accountId: z.string().min(1).optional(),
});

export type GetRecentOtpsResponse = Awaited<
  ReturnType<typeof loadRecentOtpSummary>
>;

export const GET = withAuth("mobile/otps", async (request) => {
  const { accountId } = querySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const accounts = await prisma.emailAccount.findMany({
    where: {
      ...(accountId ? { id: accountId } : {}),
      userId: request.auth.userId,
      account: { disconnectedAt: null },
    },
    select: {
      id: true,
      email: true,
      account: {
        select: { provider: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const result = await loadRecentOtpSummary({
    accounts: accounts.map((account) => ({
      id: account.id,
      email: account.email,
      provider: account.account.provider,
    })),
    createProvider: (account) =>
      createEmailProvider({
        emailAccountId: account.id,
        provider: account.provider,
        logger: request.logger.with({ emailAccountId: account.id }),
      }),
    logger: request.logger,
  });

  return NextResponse.json(result);
});
