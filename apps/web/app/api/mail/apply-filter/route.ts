import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { isValidInternalApiKey } from "@/utils/internal-api";
import { createEmailProvider } from "@/utils/email/provider";
import {
  applyFilterBodySchema,
  runApplyFilter,
} from "@/utils/mail/apply-filter";

// Moving a backlog of mail takes real time — this route exists so the work
// runs under its own budget with normal request logging, instead of inside
// whichever page function created the filter
export const maxDuration = 300;

export const POST = withError("api/mail/apply-filter", async (request) => {
  const json = await request.json();

  const logger = request.logger;

  if (!isValidInternalApiKey(await headers(), logger)) {
    logger.error("Invalid API key for filter apply");
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const body = applyFilterBodySchema.parse(json);

  const account = await prisma.emailAccount.findUnique({
    where: { id: body.emailAccountId },
    select: { email: true },
  });
  if (!account?.email) {
    logger.error("Filter apply: email account not found", {
      emailAccountId: body.emailAccountId,
    });
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const emailProvider = await createEmailProvider({
    emailAccountId: body.emailAccountId,
    provider: body.provider,
    logger,
  });

  await runApplyFilter({
    emailProvider,
    ownerEmail: account.email,
    body,
    logger,
  });

  return NextResponse.json({ ok: true });
});
