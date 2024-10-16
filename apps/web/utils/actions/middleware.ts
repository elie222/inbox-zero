import { withServerActionInstrumentation } from "@sentry/nextjs";
import { ActionError, type ServerActionResponse } from "@/utils/error";

// Utility type to ensure we're dealing with object types only
type EnsureObject<T> = T extends object ? T : never;

/**
 * Wraps an action in instrumentation to capture errors and send them to Sentry
 * We also make sure to always return an object, so that if the client doesn't get a response,
 * it's because there was an error, and likely it was a timeout because otherwise it would receive the response.
 * We also handle thrown errors and convert them to an object with an error message.
 * Actions are expected to return { error: string } objects when they fail, but if an error is thrown, we handle it here.
 * NOTE: future updates: we can do more when errors are thrown like we do with `withError` middleware for API routes.
 */
export function withActionInstrumentation<
  Args extends any[],
  Result extends object | undefined = undefined,
  Err = {},
>(
  name: string,
  action: (...args: Args) => Promise<ServerActionResponse<Result, Err>>,
  options?: { recordResponse?: boolean },
) {
  return async (
    ...args: Args
  ): Promise<
    ServerActionResponse<
      // If Result is undefined, return {}, otherwise ensure it's an object
      (Result extends undefined ? {} : EnsureObject<Result>) & {
        success: boolean;
      },
      Err
    >
  > => {
    try {
      const result = await withServerActionInstrumentation(
        name,
        {
          recordResponse: options?.recordResponse ?? true,
        },
        async () => {
          const res = await action(...args);

          // We return success: true to indicate that the action completed successfully
          // If there's a timeout, then this won't be called, so the client can see there's been an error
          return {
            success: true,
            ...(res as Result extends undefined ? {} : EnsureObject<Result>),
          };
        },
      );

      return result;
    } catch (error) {
      // error is already captured by Sentry in `withServerActionInstrumentation`
      return {
        error: "An error occurred",
        success: false,
      } as ActionError<Err & { success: false }>;
    }
  };
}
