import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import { getThreadsBatchAndParse } from "@/utils/gmail/thread";
import { getGmailAndAccessTokenForEmail } from "@/utils/account";

const requestSchema = z.object({
  threadIds: z.array(z.string()),
  includeDrafts: z.boolean().default(false),
});

export type ThreadsBatchResponse = Awaited<
  ReturnType<typeof getThreadsBatchAndParse>
>;

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const { searchParams } = new URL(request.url);
  const { threadIds, includeDrafts } = requestSchema.parse({
    threadIds: searchParams.get("threadIds")?.split(",") || [],
    includeDrafts: searchParams.get("includeDrafts") === "true",
  });

  if (threadIds.length === 0) {
    return NextResponse.json({ threads: [] } satisfies ThreadsBatchResponse);
  }

  const { accessToken } = await getGmailAndAccessTokenForEmail({
    emailAccountId,
  });

  if (!accessToken) {
    return NextResponse.json(
      { error: "Missing access token" },
      { status: 401 },
    );
  }

  const response = await getThreadsBatchAndParse(
    threadIds,
    accessToken,
    includeDrafts,
  );

  return NextResponse.json(response);
});
