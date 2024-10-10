import { z } from "zod";
import { getGmailClient } from "@/utils/gmail/client";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { archiveThread } from "@/utils/gmail/label";
import { SafeError } from "@/utils/error";

export const archiveBody = z.object({ id: z.string() });
export type ArchiveBody = z.infer<typeof archiveBody>;
export type ArchiveResponse = Awaited<ReturnType<typeof archiveEmail>>;

export async function archiveEmail(body: ArchiveBody) {
  const session = await auth();
  if (!session?.user.email) throw new SafeError("Not authenticated");

  const gmail = getGmailClient(session);
  const thread = await archiveThread({
    gmail,
    threadId: body.id,
    ownerEmail: session.user.email,
    actionSource: "user",
  });

  return { thread };
}
