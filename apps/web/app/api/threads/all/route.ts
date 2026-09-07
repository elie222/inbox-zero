import { NextResponse } from "next/server";
import { z } from "zod";
import { getConnectedEmailAccounts } from "@/utils/email/connected-accounts";
import { createEmailProvider } from "@/utils/email/provider";
import { withAuth } from "@/utils/middleware";
import { loadCombinedThreads } from "@/utils/threads/load-combined";
import { loadThreads, toListThreads } from "@/utils/threads/load";
import { threadsQuery } from "@/utils/threads/validation";
import { labelIdsToThreadsQuery } from "@/utils/mail/split-query";
import { MAX_SPLIT_LABELS } from "@/utils/mail/split-constants";

export const maxDuration = 30;

const querySchema = z.object({
  q: threadsQuery.shape.q,
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  // A split can cover several labels, and each account resolves them by name.
  labelNames: z.array(z.string().trim().min(1).max(255)).max(MAX_SPLIT_LABELS),
  isUnread: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export type GetAllThreadsResponse = Awaited<
  ReturnType<typeof loadCombinedThreads>
>;

export const GET = withAuth("threads/all", async (request) => {
  const { searchParams } = new URL(request.url);
  const { cursor, limit, isUnread, labelNames, q } = querySchema.parse({
    ...Object.fromEntries(searchParams),
    labelNames: searchParams.getAll("labelNames"),
  });
  const accounts = await getConnectedEmailAccounts({
    userId: request.auth.userId,
    includeInAllAccounts: true,
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
      if (labelNames.length && !q) {
        const labels = await emailProvider.getLabels();
        const wanted = new Set(
          labelNames.map((labelName) => labelName.toLowerCase()),
        );
        const matchingLabelIds = labels
          .filter((label) => wanted.has(label.name.trim().toLowerCase()))
          .map((label) => label.id);
        // An account missing every one of the split's labels contributes nothing.
        if (!matchingLabelIds.length) {
          return { threads: [], nextPageToken: null, labels };
        }

        const loaded = await loadThreads({
          query: threadsQuery.parse({
            ...labelIdsToThreadsQuery(matchingLabelIds),
            limit,
            nextPageToken: pageToken,
          }),
          emailAccountId: account.id,
          emailProvider,
          messageFormat: "metadata",
        });
        return { ...toListThreads(loaded), labels };
      }

      const [loaded, labels] = await Promise.all([
        loadThreads({
          query: threadsQuery.parse({
            ...(q ? { q } : { type: "inbox", isUnread }),
            limit,
            nextPageToken: pageToken,
          }),
          emailAccountId: account.id,
          emailProvider,
          messageFormat: "metadata",
        }),
        emailProvider.getLabels().catch((error) => {
          logger.warn("Failed to load labels for combined mailbox", { error });
          return [];
        }),
      ]);
      return { ...toListThreads(loaded), labels };
    },
  });

  return NextResponse.json(result);
});
