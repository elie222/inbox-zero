import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";

export async function getSessionAndGmailClient() {
  const session = await auth();
  if (!session?.user.email) return { error: "Not logged in" };
  const gmail = getGmailClient(session);
  return { gmail, user: { id: session.user.id, email: session.user.email } };
}
