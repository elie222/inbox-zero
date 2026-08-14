import { NextResponse } from "next/server";
import { z } from "zod";
import { createEmailProvider } from "@/utils/email/provider";
import { getConnectedEmailAccounts } from "@/utils/email/connected-accounts";
import { withAuth } from "@/utils/middleware";
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
  const accounts = await getConnectedEmailAccounts({
    userId: request.auth.userId,
    accountId,
  });
  const result = await loadAllInboxesSummary({
    accounts,
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
