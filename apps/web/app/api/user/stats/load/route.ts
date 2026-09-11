import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";
import { loadEmails } from "@/utils/actions/stats-loading";

export const maxDuration = 300;

const bodySchema = z.object({ loadBefore: z.boolean() });

export type LoadEmailStatsResponse = Awaited<ReturnType<typeof loadEmails>>;

/**
 * REST equivalent of `loadEmailStatsAction`. Populates `EmailMessage`, which
 * backs every sender-level stat including `/api/user/stats/newsletters`.
 *
 * One call loads a bounded number of pages. Keep calling while `hasMoreAfter`
 * or `hasMoreBefore` is true, the same way the web app's stat loader does.
 */
export const POST = withEmailProvider("user/stats/load", async (request) => {
  const { loadBefore } = bodySchema.parse(await request.json());

  const result = await loadEmails(
    {
      emailAccountId: request.auth.emailAccountId,
      emailProvider: request.emailProvider,
      logger: request.logger,
    },
    { loadBefore },
  );

  return NextResponse.json(result satisfies LoadEmailStatsResponse);
});
