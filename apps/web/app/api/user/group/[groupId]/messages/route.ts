import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getGroupEmails } from "@/app/api/user/group/[groupId]/messages/controller";
import { getGmailClientForEmail } from "@/utils/account";

export const GET = withAuth(async (request, { params }) => {
  const emailAccountId = request.auth.userEmail;

  const { groupId } = await params;
  if (!groupId) return NextResponse.json({ error: "Missing group id" });

  const gmail = await getGmailClientForEmail({ email: request.auth.userEmail });

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
