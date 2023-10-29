import { z } from "zod";
import { getGmailClient } from "@/utils/gmail/client";
import { INBOX_LABEL_ID, getOrCreateInboxZeroLabels } from "@/utils/label";
import { auth } from "@/app/api/auth/[...nextauth]/auth";

export const archiveBody = z.object({ id: z.string() });
export type ArchiveBody = z.infer<typeof archiveBody>;
export type ArchiveResponse = Awaited<ReturnType<typeof archiveEmail>>;

export async function archiveEmail(body: ArchiveBody) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not authenticated");

  const gmail = getGmailClient(session);
  const izLabels = await getOrCreateInboxZeroLabels(session.user.email, gmail);

  const thread = await gmail.users.threads.modify({
    userId: "me",
    id: body.id,
    requestBody: {
      addLabelIds: [izLabels["archived"].id],
      removeLabelIds: [INBOX_LABEL_ID],
    },
  });

  return { thread };
}
