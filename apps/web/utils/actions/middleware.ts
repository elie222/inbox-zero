import { withServerActionInstrumentation } from "@sentry/nextjs";
import { type ServerActionResponse } from "@/utils/error";

export function withActionInstrumentation<Args extends any[], T, E>(
  name: string,
  action: (...args: Args) => Promise<ServerActionResponse<T, E>>,
  options?: { recordResponse?: boolean },
) {
  return async (...args: Args): Promise<ServerActionResponse<T, E>> =>
    withServerActionInstrumentation(
      name,
      {
        recordResponse: options?.recordResponse ?? true,
      },
      async () => await action(...args),
    );
}
