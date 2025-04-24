import { z } from "zod";
import type { gmail_v1 } from "@googleapis/gmail";
import { NextResponse } from "next/server";
import { parseMessages } from "@/utils/mail";
import { getGmailClientForEmail } from "@/utils/account";
import { withAuth } from "@/utils/middleware";
import { getThread as getGmailThread } from "@/utils/gmail/thread";

export const dynamic = "force-dynamic";

const threadQuery = z.object({ id: z.string() });
export type ThreadQuery = z.infer<typeof threadQuery>;
export type ThreadResponse = Awaited<ReturnType<typeof getThread>>;

async function getThread(
  id: string,
  includeDrafts: boolean,
  gmail: gmail_v1.Gmail,
) {
  const thread = await getGmailThread(id, gmail);

  const messages = parseMessages(thread, {
    withoutIgnoredSenders: true,
    withoutDrafts: !includeDrafts,
  });

  return { thread: { ...thread, messages } };
}

export const GET = withAuth(async (request, context) => {
  const params = await context.params;
  const { id } = threadQuery.parse(params);

  const email = request.auth.userEmail;
  const gmail = await getGmailClientForEmail({ email });

  const { searchParams } = new URL(request.url);
  const includeDrafts = searchParams.get("includeDrafts") === "true";

  const thread = await getThread(id, includeDrafts, gmail);

  return NextResponse.json(thread);
});
