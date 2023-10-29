import { z } from "zod";
import he from "he";
import { NextResponse } from "next/server";
import { parseMessages } from "@/utils/mail";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { getPlan } from "@/utils/redis/plan";
import { INBOX_LABEL_ID } from "@/utils/label";
import { ThreadWithPayloadMessages } from "@/utils/types";
import prisma from "@/utils/prisma";
import { getCategory } from "@/utils/redis/category";

export const dynamic = "force-dynamic";

const threadsQuery = z.object({ limit: z.coerce.number().max(500).optional() });
export type ThreadsQuery = z.infer<typeof threadsQuery>;
export type ThreadsResponse = Awaited<ReturnType<typeof getThreads>>;

async function getThreads(query: ThreadsQuery) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const gmail = getGmailClient(session);

  const [gmailThreads, rules] = await Promise.all([
    gmail.users.threads.list({
      userId: "me",
      labelIds: [INBOX_LABEL_ID],
      maxResults: query.limit || 50,
    }),
    prisma.rule.findMany({ where: { userId: session.user.id } }),
  ]);

  const threadsWithMessages = await Promise.all(
    gmailThreads.data.threads?.map(async (t) => {
      const id = t.id!;
      const thread = await gmail.users.threads.get({ userId: "me", id });
      const messages = parseMessages(thread.data as ThreadWithPayloadMessages);

      const plan = await getPlan({ userId: session.user.id, threadId: id });
      const rule = plan
        ? rules.find((r) => r.id === plan?.rule?.id)
        : undefined;

      return {
        ...t,
        ...thread.data,
        messages,
        snippet: he.decode(t.snippet || ""),
        plan: plan ? { ...plan, databaseRule: rule } : undefined,
        category: await getCategory({
          email: session.user.email,
          threadId: id,
        }),
      };
    }) || []
  );

  return { threads: threadsWithMessages };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");
  const query = threadsQuery.parse({ limit });

  try {
    const threads = await getThreads(query);
    return NextResponse.json(threads);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error });
  }
}
