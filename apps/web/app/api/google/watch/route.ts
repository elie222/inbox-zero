import { NextResponse } from "next/server";
import { watchEmails } from "./controller";
import { withEmailAccount } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import { getGmailClientForEmailId } from "@/utils/account";

export const dynamic = "force-dynamic";

const logger = createScopedLogger("api/google/watch");

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const gmail = await getGmailClientForEmailId({ emailAccountId });
  const expirationDate = await watchEmails({ emailAccountId, gmail });

  if (expirationDate) return NextResponse.json({ expirationDate });

  logger.error("Error watching inbox", { emailAccountId });

  return NextResponse.json({ error: "Error watching inbox" });
});
