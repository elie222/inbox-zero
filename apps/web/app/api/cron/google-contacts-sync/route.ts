import { NextResponse } from "next/server";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { type RequestWithLogger, withError } from "@/utils/middleware";
import { pullGoogleContacts } from "@/utils/contacts-sync/google";
import { runWithBoundedConcurrency } from "@/utils/async";
import { GoogleContactsSyncMode } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";

export const maxDuration = 300;

export const GET = withError("cron/google-contacts-sync", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized request: api/cron/google-contacts-sync"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return runSync(request);
});

export const POST = withError("cron/google-contacts-sync", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/cron/google-contacts-sync"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return runSync(request);
});

async function runSync(request: RequestWithLogger) {
  // Both PULL and TWO_WAY import hourly; pushes happen per save
  const accounts = await prisma.emailAccount.findMany({
    where: {
      googleContactsSyncMode: { not: GoogleContactsSyncMode.OFF },
      account: { provider: "google" },
    },
    select: { id: true, email: true },
  });

  const results = await runWithBoundedConcurrency({
    items: accounts,
    concurrency: 3,
    run: async (account) => {
      const logger = request.logger.with({ emailAccountId: account.id });
      try {
        return await pullGoogleContacts({
          emailAccountId: account.id,
          logger,
        });
      } catch (error) {
        logger.error("Google contacts sync failed", { error });
        return null;
      }
    },
  });

  return NextResponse.json({
    accounts: accounts.length,
    synced: results.filter(
      ({ result }) => result.status === "fulfilled" && result.value,
    ).length,
  });
}
