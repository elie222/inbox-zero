import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import { loadThreadPlans } from "@/utils/threads/load";

const threadPlansQuery = z.object({
  threadId: z.string().trim().min(1).max(512),
});

export type GetThreadPlansResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("user/thread-plans", async (request) => {
  const { threadId } = threadPlansQuery.parse({
    threadId: new URL(request.url).searchParams.get("threadId"),
  });
  return NextResponse.json(
    await getData({
      emailAccountId: request.auth.emailAccountId,
      threadId,
    }),
  );
});

async function getData({
  emailAccountId,
  threadId,
}: {
  emailAccountId: string;
  threadId: string;
}) {
  return {
    plans: await loadThreadPlans({ emailAccountId, threadId }),
  };
}
