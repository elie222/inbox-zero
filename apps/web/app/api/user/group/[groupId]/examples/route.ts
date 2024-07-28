import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { getExamples } from "@/app/api/user/group/[groupId]/examples/controller";
import { getGmailClient } from "@/utils/gmail/client";

export const GET = withError(async (_request, { params }) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const groupId = params.groupId;
  if (!groupId) return NextResponse.json({ error: "Missing group id" });

  const gmail = getGmailClient(session);

  const { examples, totalCount } = await getExamples({
    groupId,
    userId: session.user.id,
    gmail,
    page: 1,
    limit: 100,
  });

  return NextResponse.json({ examples, totalCount });
});
