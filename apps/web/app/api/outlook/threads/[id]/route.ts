import { z } from "zod";
import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getGraphClientAndAccessTokenForEmail } from "@/utils/account";
import { getOutlookThread } from "@/utils/outlook/thread";

export const dynamic = "force-dynamic";

const threadQuery = z.object({ id: z.string() });
export type ThreadQuery = z.infer<typeof threadQuery>;
export type ThreadResponse = Awaited<ReturnType<typeof getThread>>;

async function getThread(
  id: string,
  includeDrafts: boolean,
  graphClient: any,
  emailAccountId: string,
) {
  const thread = await getOutlookThread({
    id,
    includeDrafts,
    graphClient,
    emailAccountId,
  });

  return { thread };
}

export const GET = withEmailAccount(async (request, context) => {
  const emailAccountId = request.auth.emailAccountId;
  if (!emailAccountId) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 404 },
    );
  }

  const params = await context.params;
  const { id } = threadQuery.parse(params);

  const { graphClient } = await getGraphClientAndAccessTokenForEmail({
    emailAccountId,
  });

  const { searchParams } = new URL(request.url);
  const includeDrafts = searchParams.get("includeDrafts") === "true";

  const thread = await getThread(
    id,
    includeDrafts,
    graphClient,
    emailAccountId,
  );

  return NextResponse.json(thread);
});
