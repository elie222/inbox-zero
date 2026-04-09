import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { testImapConnectionSchema } from "@/utils/actions/imap.validation";
import { createImapConnection } from "@/utils/imap/client";
import { testSmtpConnection } from "@/utils/imap/mail";
import type { ImapCredentialConfig } from "@/utils/imap/types";

export const POST = withAuth("imap/test-connection", async (request) => {
  const body = await request.json();
  const parsed = testImapConnectionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const config: ImapCredentialConfig = {
    ...data,
    email: "",
    emailAccountId: "",
  };

  const results = { imap: false, smtp: false, error: "" };

  // Test IMAP connection
  try {
    const client = createImapConnection(config);
    await client.connect();
    await client.logout();
    results.imap = true;
  } catch (error) {
    results.error = `IMAP: ${error instanceof Error ? error.message : "Connection failed"}`;
    return NextResponse.json(results, { status: 400 });
  }

  // Test SMTP connection
  try {
    await testSmtpConnection(config);
    results.smtp = true;
  } catch (error) {
    results.error = `SMTP: ${error instanceof Error ? error.message : "Connection failed"}`;
    return NextResponse.json(results, { status: 400 });
  }

  return NextResponse.json(results);
});
