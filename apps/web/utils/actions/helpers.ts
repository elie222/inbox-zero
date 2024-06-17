import { gmail_v1 } from "googleapis";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { ServerActionResponse, captureException } from "@/utils/error";
import { getGmailClient } from "@/utils/gmail/client";

// do not return functions to the client or we'll get an error
export const isStatusOk = (status: number) => status >= 200 && status < 300;

export async function getSessionAndGmailClient() {
  const session = await auth();
  if (!session?.user.id) return { error: "Not logged in" };
  const gmail = getGmailClient(session);
  return { gmail, user: session.user };
}

function handleError(error: unknown, message: string) {
  captureException(error);
  return { error: message };
}

export async function executeGmailAction<T>(
  action: (gmail: gmail_v1.Gmail, user: { id: string }) => Promise<any>,
  errorMessage: string,
): Promise<ServerActionResponse<T>> {
  const { gmail, user, error } = await getSessionAndGmailClient();
  if (error) return { error };
  if (!gmail) return { error: "Could not load Gmail" };

  try {
    const res = await action(gmail, user);
    return !isStatusOk(res.status) ? handleError(res, errorMessage) : undefined;
  } catch (error) {
    return handleError(error, errorMessage);
  }
}
