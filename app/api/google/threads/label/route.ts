import { google } from "googleapis";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/utils/auth";
import { getClient } from "@/utils/google";
import { withError } from "@/utils/middleware";

const labelThreadBody = z.object({ threadId: z.string(), labelId: z.string() });
export type LabelThreadBody = z.infer<typeof labelThreadBody>;
export type LabelThreadResponse = Awaited<ReturnType<typeof labelThread>>;

export async function labelThread(body: LabelThreadBody) {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  const auth = getClient(session);

  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.threads.modify({
    userId: "me",
    id: body.threadId,
    requestBody: {
      addLabelIds: [body.labelId],
    },
  });
  const thread = res.data;

  return { thread };
}

export const POST = withError(async (request: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = labelThreadBody.parse(json);
  const label = await labelThread(body);

  return NextResponse.json(label);
});
