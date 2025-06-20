import {
  captureException,
  withServerActionInstrumentation,
} from "@sentry/nextjs";
import {
  checkCommonErrors,
  isAICallError,
  isAWSThrottlingError,
  type ActionError,
  type ServerActionResponse,
} from "@/utils/error";
import { logErrorToPosthog } from "@/utils/error.server";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { createScopedLogger } from "@/utils/logger";
import { env } from "@/env";

// NOTE: this file is not longer in use but we want to move over functionality to the `actionClient`

const logger = createScopedLogger("action-middleware");

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
  Err extends object = Record<string, unknown>,
>(
  name: string,
  action: (...args: Args) => Promise<ServerActionResponse<Result, Err>>,
  options?: { recordResponse?: boolean },
) {
  return async (
    ...args: Args
  ): Promise<
    ServerActionResponse<EnsureObject<Result> & { success: boolean }, Err>
  > => {
    try {
      const result = await withServerActionInstrumentation(
        name,
        {
          recordResponse: options?.recordResponse ?? true,
        },
        async () => {
          try {
            logger.info(`Action: ${name}`, { action: name });
            const res = await action(...args);

            if (!res) {
              return { success: true } as EnsureObject<Result> & {
                success: boolean;
              };
            }

            if ("error" in res) return res;

            return {
              success: true,
              ...res,
            } as unknown as EnsureObject<Result> & {
              success: true;
            };
          } catch (error) {
            if (isDuplicateError(error)) {
              captureException(error, { extra: { actionName: name } });

              logger.error("Duplicate item error", { action: name, error });

              return {
                error: "Duplicate item error",
                success: false,
              } as unknown as ActionError<Err>;
            }

            if (isAWSThrottlingError(error)) {
              captureException(error, { extra: { actionName: name } });

              logger.error("AWS throttling error", { action: name, error });

              return {
                error: error.message,
                success: false,
              } as unknown as ActionError<Err>;
            }

            if (isAICallError(error)) {
              // Quick fix: log full error in development. TODO: handle properly
              if (env.NODE_ENV === "development") {
                console.error(error);
              }

              logger.error("AI call error", {
                action: name,
                error: (error.data as any)?.message,
              });
              return {
                error:
                  (error.data as any)?.error?.message ??
                  "An error occurred while calling the AI",
                success: false,
              } as unknown as ActionError<Err>;
            }

            // don't throw known errors to Sentry
            const apiError = checkCommonErrors(error, name);
            if (apiError) {
              await logErrorToPosthog("action", name, apiError.type);

              logger.error("API error", { action: name, error: apiError });

              return {
                error: apiError.message,
                success: false,
              } as unknown as ActionError<Err>;
            }

            throw error;
          }
        },
      );

      return result;
    } catch (error) {
      logger.error("Error in action", { action: name, error });

      // Quick fix: log full error in development. TODO: handle properly
      if (env.NODE_ENV === "development") {
        console.error(error);
      }

      // error is already captured by Sentry in `withServerActionInstrumentation`
      return {
        error: "An error occurred",
        success: false,
      } as ActionError<Err & { success: false }>;
    }
  };
}
