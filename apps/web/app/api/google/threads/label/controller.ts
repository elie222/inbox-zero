import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { INBOX_LABEL_ID, getOrCreateInboxZeroLabels } from "@/utils/label";

export const labelThreadBody = z.object({
  threadId: z.string(),
  labelId: z.string(),
  archive: z.boolean(),
});
export type LabelThreadBody = z.infer<typeof labelThreadBody>;
export type LabelThreadResponse = Awaited<ReturnType<typeof labelThread>>;

export async function labelThread(body: LabelThreadBody) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not authenticated");

  const gmail = getGmailClient(session);
  const izLabels = await getOrCreateInboxZeroLabels(session.user.email, gmail);

  const res = await gmail.users.threads.modify({
    userId: "me",
    id: body.threadId,
    requestBody: {
      addLabelIds: [
        body.labelId,
        izLabels["labeled"].id,
        ...(body.archive ? [izLabels["archived"].id] : []),
      ],
      removeLabelIds: body.archive ? [INBOX_LABEL_ID] : [],
    },
  });
  const thread = res.data;

  return { thread };
}
