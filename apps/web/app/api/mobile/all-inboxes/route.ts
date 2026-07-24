import { NextResponse } from "next/server";
import { z } from "zod";
import { createEmailProvider } from "@/utils/email/provider";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { loadAllInboxesSummary } from "./summary";

export const maxDuration = 30;

const querySchema = z.object({
  accountId: z.string().min(1).optional(),
  after: z.coerce.date(),
});

export type GetAllInboxesResponse = Awaited<
  ReturnType<typeof loadAllInboxesSummary>
>;

export const GET = withAuth("mobile/all-inboxes", async (request) => {
  const { accountId, after } = querySchema.parse(
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
  const normalizedAccounts = accounts.map((account) => ({
    id: account.id,
    email: account.email,
    provider: account.account.provider,
  }));
  const result = await loadAllInboxesSummary({
    accounts: normalizedAccounts,
    after,
    logger: request.logger,
    createProvider: (account) =>
      createEmailProvider({
        emailAccountId: account.id,
        provider: account.provider,
        logger: request.logger.with({ emailAccountId: account.id }),
      }),
  });

  return NextResponse.json(result);
});
