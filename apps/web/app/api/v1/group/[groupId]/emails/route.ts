import { type NextRequest, NextResponse } from "next/server";
import { getGroupEmails } from "@/app/api/user/group/[groupId]/messages/controller";
import {
  groupEmailsQuerySchema,
  type GroupEmailsResult,
} from "@/app/api/v1/group/[groupId]/emails/validation";
import { withError } from "@/utils/middleware";
import { validateApiKeyAndGetGmailClient } from "@/utils/api-auth";

export const GET = withError(async (request, { params }) => {
  const { gmail, userId } = await validateApiKeyAndGetGmailClient(request);

  const { groupId } = await params;
  if (!groupId)
    return NextResponse.json({ error: "Missing groupId" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const queryResult = groupEmailsQuerySchema.safeParse(
    Object.fromEntries(searchParams),
  );

  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 },
    );
  }

  const { pageToken, from, to } = queryResult.data;

  const { messages, nextPageToken } = await getGroupEmails({
    groupId,
    userId,
    gmail,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    pageToken,
  });

  const result: GroupEmailsResult = {
    messages,
    nextPageToken,
  };

  return NextResponse.json(result);
});
