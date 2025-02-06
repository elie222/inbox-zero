import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import { getThreadsBatch } from "@/utils/gmail/thread";
import { parseMessages } from "@/utils/mail";
import { isDefined, type ThreadWithPayloadMessages } from "@/utils/types";

const requestSchema = z.object({ threadIds: z.array(z.string()) });

export type ThreadsBatchResponse = Awaited<ReturnType<typeof getThreads>>;

async function getThreads(threadIds: string[], accessToken: string) {
  const threads = await getThreadsBatch(threadIds, accessToken);

  const threadsWithMessages = await Promise.all(
    threads.map(async (thread) => {
      const id = thread.id;
      if (!id) return;
      const messages = parseMessages(thread as ThreadWithPayloadMessages);

      return { id, messages };
    }) || [],
  );

  return {
    threads: threadsWithMessages.filter(isDefined),
  };
}

export const GET = withError(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const { threadIds } = requestSchema.parse({
    threadIds: searchParams.get("threadIds")?.split(",") || [],
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

  const response = await getThreads(threadIds, accessToken);

  return NextResponse.json(response);
});
