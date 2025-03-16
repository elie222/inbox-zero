import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import { getThreadsBatchAndParse } from "@/utils/gmail/thread";

const requestSchema = z.object({
  threadIds: z.array(z.string()),
  includeDrafts: z.boolean().default(false),
});

export type ThreadsBatchResponse = Awaited<
  ReturnType<typeof getThreadsBatchAndParse>
>;

export const GET = withError(async (request) => {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const { threadIds, includeDrafts } = requestSchema.parse({
    threadIds: searchParams.get("threadIds")?.split(",") || [],
    includeDrafts: searchParams.get("includeDrafts") === "true",
  });

  if (threadIds.length === 0) {
    return NextResponse.json({ threads: [] } satisfies ThreadsBatchResponse);
  }

  const accessToken = session.accessToken;
  if (!accessToken)
    return NextResponse.json(
      { error: "Missing access token" },
      { status: 401 },
    );

  const response = await getThreadsBatchAndParse(
    threadIds,
    accessToken,
    includeDrafts,
  );

  return NextResponse.json(response);
});
