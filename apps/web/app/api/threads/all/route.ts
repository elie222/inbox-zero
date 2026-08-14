import { NextResponse } from "next/server";
import { z } from "zod";
import { getConnectedEmailAccounts } from "@/utils/email/connected-accounts";
import { createEmailProvider } from "@/utils/email/provider";
import { withAuth } from "@/utils/middleware";
import { loadCombinedThreads } from "@/utils/threads/load-combined";
import { loadThreads, toListThreads } from "@/utils/threads/load";
import { threadsQuery } from "@/utils/threads/validation";

export const maxDuration = 30;

const querySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  isUnread: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export type GetAllThreadsResponse = Awaited<
  ReturnType<typeof loadCombinedThreads>
>;

export const GET = withAuth("threads/all", async (request) => {
  const { cursor, limit, isUnread } = querySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const accounts = await getConnectedEmailAccounts({
    userId: request.auth.userId,
  });
  const result = await loadCombinedThreads({
    accounts,
    cursor: cursor ?? null,
    limit,
    logger: request.logger,
    loadPage: async ({ account, pageToken }) => {
      const logger = request.logger.with({ emailAccountId: account.id });
      const emailProvider = await createEmailProvider({
        emailAccountId: account.id,
        provider: account.provider,
        logger,
      });
      const loaded = await loadThreads({
        query: threadsQuery.parse({
          type: "inbox",
          isUnread,
          limit,
          nextPageToken: pageToken,
        }),
        emailAccountId: account.id,
        emailProvider,
        messageFormat: "metadata",
      });
      return toListThreads(loaded);
    },
  });

  return NextResponse.json(result);
});
