import { z } from "zod";
import { Auth, gmail_v1, google } from "googleapis";
import { NextResponse } from "next/server";
import he from "he";
import { parseMessage, parseMessages } from "@/utils/mail";
import { getSession } from "@/utils/auth";
import { getClient } from "@/utils/google";

const threadQuery = z.object({ id: z.string() });
export type ThreadQuery = z.infer<typeof threadQuery>;
export type ThreadResponse = Awaited<ReturnType<typeof getThread>>;

async function getThread(query: ThreadQuery, auth: Auth.OAuth2Client) {
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.threads.get({
    userId: "me",
    id: query.id,
    prettyPrint: true,
  });
  const thread = res.data;

  const messages = parseMessages(thread);

  return { thread: { ...thread, messages } };
}

export async function GET(
  request: Request,
  { params }: { params: ThreadQuery }
) {
  const query = threadQuery.parse(params);

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });
  const auth = getClient(session);

  const thread = await getThread(query, auth);

  return NextResponse.json(thread);
}

// function decodeMessage(data: string) {
//   return he.decode(atob(data.replace(/-/g, '+').replace(/_/g, '/')));
// }
