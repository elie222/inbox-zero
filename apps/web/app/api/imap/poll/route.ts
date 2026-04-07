import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { pollAllImapAccounts } from "@/utils/imap/poll";

/**
 * Cron endpoint to poll all IMAP accounts for new messages.
 * Should be called by an external scheduler (e.g., every 2-5 minutes).
 */
export const POST = withError("imap/poll", async (request) => {
  // Optional: verify a cron secret to prevent unauthorized polling
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await pollAllImapAccounts();

  return NextResponse.json({
    polled: results.length,
    newMessages: results.reduce((sum, r) => sum + r.newMessages, 0),
    results,
  });
});
