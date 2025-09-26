import { NextResponse } from "next/server";
import { getGroupEmails } from "@/app/api/user/group/[groupId]/messages/controller";
import {
  groupEmailsQuerySchema,
  type GroupEmailsResult,
} from "@/app/api/v1/group/[groupId]/emails/validation";
import { withError } from "@/utils/middleware";
import { validateApiKeyAndGetEmailProvider } from "@/utils/api-auth";
import { getEmailAccountId } from "@/app/api/v1/helpers";

export const GET = withError(async (request, { params }) => {
  const { emailProvider, userId, accountId } =
    await validateApiKeyAndGetEmailProvider(request);

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

  const { pageToken, from, to, email } = queryResult.data;

  const emailAccountId = await getEmailAccountId({
    email,
    accountId,
    userId,
  });

  if (!emailAccountId) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 400 },
    );
  }

  const { messages, nextPageToken } = await getGroupEmails({
    provider: emailProvider.name,
    groupId,
    emailAccountId,
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
