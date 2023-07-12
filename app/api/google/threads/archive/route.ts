import { z } from "zod";
import { Auth, google } from "googleapis";
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { getClient } from "@/utils/google";
import { getSession } from "@/utils/auth";

const archiveBody = z.object({ id: z.string() });
export type ArchiveBody = z.infer<typeof archiveBody>;
export type ArchiveResponse = Awaited<ReturnType<typeof archiveEmail>>;

export async function archiveEmail(body: ArchiveBody) {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  const auth = getClient(session);

  const gmail = google.gmail({ version: "v1", auth });

  const thread = await gmail.users.threads.modify({
    userId: "me",
    id: body.id,
    requestBody: {
      removeLabelIds: ["INBOX"],
    },
  });

  return { thread };
}

export const POST = withError(async (request: Request) => {
  const json = await request.json();
  const body = archiveBody.parse(json);

  const thread = await archiveEmail(body);

  return NextResponse.json(thread);
});
