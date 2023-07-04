import { z } from "zod";
import { google } from "googleapis";
import { NextResponse } from "next/server";
import he from 'he';
import { client } from "@/app/api/google/client";

const threadQuery = z.object({ id: z.string() });
export type ThreadQuery = z.infer<typeof threadQuery>;
export type ThreadResponse = Awaited<ReturnType<typeof getThread>>;

async function getThread(query: ThreadQuery) {
  const gmail = google.gmail({ version: "v1", auth: client });
  const res = await gmail.users.threads.get({ userId: "me", id: query.id, prettyPrint: true });
  const thread = res.data;

  const messages = thread.messages?.map(message => {
    return {
      ...message,
      text: message.payload?.parts?.[0]?.body?.data ? decodeMessage(message.payload?.parts?.[0]?.body?.data) : ''
    }
  })

  return { thread: { ...thread, messages } };
}

export async function GET(request: Request, { params }: { params: ThreadQuery }) {
  const query = threadQuery.parse(params);
  const thread = await getThread(query);

  return NextResponse.json(thread);
}

function decodeMessage(data: string) {
  return he.decode(atob(data.replace(/-/g, '+').replace(/_/g, '/')));
}