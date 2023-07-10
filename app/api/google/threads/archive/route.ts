import { z } from "zod";
import { Auth, google } from "googleapis";
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { getClient } from "@/utils/google";
import { getSession } from "@/utils/auth";

const archiveBody = z.object({ id: z.string() });
export type ArchiveBody = z.infer<typeof archiveBody>;
export type ArchiveResponse = Awaited<ReturnType<typeof archiveEmail>>;

async function archiveEmail(body: ArchiveBody, auth: Auth.OAuth2Client) {
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

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });
  const auth = getClient(session);

  const thread = await archiveEmail(body, auth);

  return NextResponse.json(thread);
});
