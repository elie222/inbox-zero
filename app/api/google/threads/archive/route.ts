import { z } from "zod";
import { google } from "googleapis";
import { NextResponse } from "next/server";
import { client as auth } from "../../client";
import { withError } from "@/utils/middleware";

const archiveBody = z.object({ id: z.string() });
export type ArchiveBody = z.infer<typeof archiveBody>;
export type ArchiveResponse = Awaited<ReturnType<typeof archiveEmail>>;

async function archiveEmail(body: ArchiveBody) {
  const gmail = google.gmail({ version: "v1", auth });

  const thread = await gmail.users.threads.modify({
    userId: "me",
    id: body.id,
    requestBody: {
      removeLabelIds: ["INBOX"],
    }
  })

  return { thread };
}

export const POST = withError(async (request: Request) => {
  const json = await request.json();
  const body = archiveBody.parse(json);

  const thread = await archiveEmail(body);

  return NextResponse.json(thread);
})
