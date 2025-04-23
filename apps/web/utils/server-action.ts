"use client";

import {
  type ActionError,
  type ServerActionResponse,
  captureException,
  isActionError,
} from "@/utils/error";

// NOTE: not in love with the indirection here
// Not sure I'll use across the app
export async function handleActionCall<
  T,
  E extends object = Record<string, unknown>,
>(
  actionName: string,
  actionFn: () => Promise<ServerActionResponse<T, E>>,
): Promise<ServerActionResponse<T, E>> {
  let result: ServerActionResponse<T, E>;

  try {
    result = await actionFn();
  } catch (error) {
    captureException(error, { extra: { actionName } });
    return { error: String(error) } as ActionError<E>;
  }

  if (isActionError(result)) return result;

  if (!result) {
    captureException("The request did not complete", { extra: { actionName } });
    return { error: "The request did not complete" } as ActionError<E>;
  }

  return result;
}
