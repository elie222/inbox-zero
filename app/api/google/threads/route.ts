// import { z } from "zod";
import he from "he";
import { NextResponse } from "next/server";
import { parseMessages } from "@/utils/mail";
import { getSession } from "@/utils/auth";
import { getGmailClient } from "@/utils/google";
import { getPlan } from "@/utils/redis/plan";
import { INBOX_LABEL_ID } from "@/utils/label";

export const dynamic = "force-dynamic";

// const threadsQuery = z.object({ slug: z.string() });
// export type ThreadsQuery = z.infer<typeof threadsQuery>;
export type ThreadsResponse = Awaited<ReturnType<typeof getThreads>>;

async function getThreads() {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const gmail = getGmailClient(session);

  const res = await gmail.users.threads.list({
    userId: "me",
    labelIds: [INBOX_LABEL_ID],
    maxResults: 100,
  });
  // const threads = res.data.threads?.map(t => {
  //   return {
  //     ...t,
  //     snippet: he.decode(t.snippet || "")
  //   }
  // });

  const threadsWithMessages = await Promise.all(
    res.data.threads?.map(async (t) => {
      const id = t.id!; // when is id not defined?
      const thread = await gmail.users.threads.get({ userId: "me", id });
      const messages = parseMessages(thread.data);

      return {
        ...t,
        snippet: he.decode(t.snippet || ""),
        thread: { ...thread.data, messages },
        plan: await getPlan({ email: session.user.email, threadId: id }),
        // plan: undefined as any,
      };
    }) || []
  );

  return { threads: threadsWithMessages };
}

export async function GET() {
  try {
    const threads = await getThreads();
    return NextResponse.json(threads);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error });
  }
}
