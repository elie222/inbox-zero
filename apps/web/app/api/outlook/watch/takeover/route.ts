import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { hasPostCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";
import { captureException } from "@/utils/error";
import { takeOverMailbox } from "@/utils/outlook/mailbox-claim";
import { createManagedOutlookSubscription } from "@/utils/outlook/subscription-manager";

// Called by the local launcher (`inbox start --takeover`) to move mailbox
// ownership to this copy on purpose.
export const POST = withError("outlook/watch/takeover", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/outlook/watch/takeover"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  const emailAccounts = await prisma.emailAccount.findMany({
    where: { account: { provider: "microsoft" } },
    select: { id: true },
  });

  const results = [];
  for (const { id: emailAccountId } of emailAccounts) {
    const { releasedHosts } = await takeOverMailbox({
      emailAccountId,
      logger: request.logger,
    });
    const subscription = await createManagedOutlookSubscription({
      emailAccountId,
      logger: request.logger,
      forceRefresh: true,
    });
    results.push({
      emailAccountId,
      releasedHosts,
      watching: Boolean(subscription),
    });
  }

  return NextResponse.json({ results });
});
