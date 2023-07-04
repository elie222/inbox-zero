// import { z } from "zod";
import { google, Auth } from "googleapis";
import { NextResponse } from "next/server";
import { client } from "../client";

// const threadsQuery = z.object({ slug: z.string() });
// export type ThreadsQuery = z.infer<typeof threadsQuery>;
export type ThreadsResponse = Awaited<ReturnType<typeof getThreads>>;

async function getThreads(auth: Auth.OAuth2Client) {
  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.threads.list({ userId: "me", labelIds: ["INBOX"], maxResults: 100 });
  const threads = res.data.threads;
  if (!threads || threads.length === 0) {
    console.log("No threads found.");
    return;
  }
  // console.log("Threads:");
  // threads.forEach((thread) => {
  //   console.log(`- ${thread.id} - ${thread.snippet}`);
  // });

  return { threads };
}

export async function GET() {
  const threads = await getThreads(client);

  return NextResponse.json(threads);
}
