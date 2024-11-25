import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import type { ActionError } from "@/utils/error";
import type { gmail_v1 } from "@googleapis/gmail";
import type { Session } from "next-auth";

export async function getSessionAndGmailClient(): Promise<
  | ActionError
  | {
      gmail: gmail_v1.Gmail;
      user: { id: string; email: string };
      session: Session;
    }
> {
  const session = await auth();
  if (!session?.user.email) return { error: "Not logged in" };
  const gmail = getGmailClient(session);
  if (!gmail) return { error: "Failed to get Gmail" };
  return {
    gmail,
    user: { id: session.user.id, email: session.user.email },
    session,
  };
}
