import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { getGroupEmails } from "@/app/api/user/group/[groupId]/messages/controller";
import { getGmailClient } from "@/utils/gmail/client";

export const GET = withError(async (_request, { params }) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { groupId } = await params;
  if (!groupId) return NextResponse.json({ error: "Missing group id" });

  const gmail = getGmailClient(session);

  const { messages } = await getGroupEmails({
    groupId,
    userId: session.user.id,
    gmail,
    from: undefined,
    to: undefined,
    pageToken: "",
  });

  return NextResponse.json({ messages });
});
