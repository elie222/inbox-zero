import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { captureException, type ServerActionResponse } from "@/utils/error";
import { getGmailClient } from "@/utils/gmail/client";

// do not return functions to the client or we'll get an error
export const isStatusOk = (status: number) => status >= 200 && status < 300;

export async function getSessionAndGmailClient() {
  const session = await auth();
  if (!session?.user.email) return { error: "Not logged in" };
  const gmail = getGmailClient(session);
  return { gmail, user: { id: session.user.id, email: session.user.email } };
}

export function handleError(
  error: unknown,
  message: string,
  userEmail?: string,
) {
  captureException(error, undefined, userEmail);
  console.error(message, error);
  return { error: message };
}

export async function executeServerAction<T>(
  action: () => Promise<T>,
  errorMessage: string,
  userEmail?: string,
): Promise<ServerActionResponse<T>> {
  try {
    const result = await action();
    return result;
  } catch (error) {
    return handleError(error, errorMessage, userEmail);
  }
}
