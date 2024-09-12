import { gmail_v1 } from "googleapis";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { ServerActionResponse, captureException } from "@/utils/error";
import { getGmailClient } from "@/utils/gmail/client";

// do not return functions to the client or we'll get an error
export const isStatusOk = (status: number) => status >= 200 && status < 300;

export async function getSessionAndGmailClient() {
  const session = await auth();
  if (!session?.user.email) return { error: "Not logged in" };
  const gmail = getGmailClient(session);
  return { gmail, user: { id: session.user.id, email: session.user.email } };
}

export function handleError(error: unknown, message: string) {
  captureException(error);
  console.error(message, error);
  return { error: message };
}
