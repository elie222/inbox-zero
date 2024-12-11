import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { getThread, hasMultipleMessages } from "@/utils/gmail/thread";
import { withError } from "@/utils/middleware";

export type ThreadCheckResponse = { isThread: boolean };

export const GET = withError(async (_request, { params }) => {
  const session = await auth();
  const userId = session?.user.id;
  if (!userId)
    return Response.json({ error: "Not logged in" }, { status: 401 });

  const threadId = params.id;
  if (!threadId) {
    return Response.json(
      { error: "Missing required parameters" },
      { status: 400 },
    );
  }

  const gmail = getGmailClient(session);
  const thread = await getThread(threadId, gmail);
  const isThread = hasMultipleMessages(thread);

  const response: ThreadCheckResponse = { isThread };

  return Response.json(response);
});
