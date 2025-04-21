import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getGroupEmails } from "@/app/api/user/group/[groupId]/messages/controller";
import { getGmailClient } from "@/utils/gmail/client";
import { getTokens } from "@/utils/account";

export const GET = withAuth(async (request, { params }) => {
  const emailAccountId = request.auth.userEmail;

  const { groupId } = await params;
  if (!groupId) return NextResponse.json({ error: "Missing group id" });

  const tokens = await getTokens({ email: request.auth.userEmail });
  if (!tokens) return NextResponse.json({ error: "Account not found" });

  const gmail = getGmailClient(tokens);

  const { messages } = await getGroupEmails({
    groupId,
    emailAccountId,
    gmail,
    from: undefined,
    to: undefined,
    pageToken: "",
  });

  return NextResponse.json({ messages });
});
