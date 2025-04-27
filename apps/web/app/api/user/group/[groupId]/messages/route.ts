import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getGroupEmails } from "@/app/api/user/group/[groupId]/messages/controller";
import { getGmailClientForEmail } from "@/utils/account";

export const GET = withEmailAccount(async (request, { params }) => {
  const emailAccountId = request.auth.emailAccountId;

  const { groupId } = await params;
  if (!groupId) return NextResponse.json({ error: "Missing group id" });

  const gmail = await getGmailClientForEmail({ emailAccountId });

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
