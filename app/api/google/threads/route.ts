// import { z } from "zod";
import { google, Auth } from "googleapis";
import he from 'he';
import { NextResponse } from "next/server";
import { parseMessages } from "@/utils/mail";
import { getSession } from "@/utils/auth";
import { getClient } from "@/utils/google";

// const threadsQuery = z.object({ slug: z.string() });
// export type ThreadsQuery = z.infer<typeof threadsQuery>;
export type ThreadsResponse = Awaited<ReturnType<typeof getThreads>>;

async function getThreads(auth: Auth.OAuth2Client) {
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.threads.list({ userId: "me", labelIds: ["INBOX"], maxResults: 3 });
  // const threads = res.data.threads?.map(t => {
  //   return {
  //     ...t,
  //     snippet: he.decode(t.snippet || "")
  //   }
  // });

  const threadsWithMessages = await Promise.all(res.data.threads?.map(async t => {
    const thread = await gmail.users.threads.get({ userId: "me", id: t.id! }); // when is id not defined?
    const messages = parseMessages(thread.data);

    return {
      ...t,
      snippet: he.decode(t.snippet || ""),
      thread: { ...thread.data, messages }
    }
  }) || []);

  return { threads: threadsWithMessages };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" })
  const auth = getClient(session);

  const threads = await getThreads(auth);

  return NextResponse.json(threads);
}
