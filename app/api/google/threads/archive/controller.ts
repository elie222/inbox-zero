import { google } from "googleapis";
import { getSession } from "next-auth/react";
import { z } from "zod";
import { getGmailClient } from "@/utils/google";
import { INBOX_LABEL_ID } from "@/utils/label";

export const archiveBody = z.object({ id: z.string() });
export type ArchiveBody = z.infer<typeof archiveBody>;
export type ArchiveResponse = Awaited<ReturnType<typeof archiveEmail>>;

export async function archiveEmail(body: ArchiveBody) {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const gmail = getGmailClient(session);

  const thread = await gmail.users.threads.modify({
    userId: "me",
    id: body.id,
    requestBody: {
      removeLabelIds: [INBOX_LABEL_ID],
    },
  });

  return { thread };
}
