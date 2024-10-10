import { withServerActionInstrumentation } from "@sentry/nextjs";
import { type ServerActionResponse } from "@/utils/error";

export function withActionInstrumentation<Args extends any[], T>(
  name: string,
  action: (...args: Args) => Promise<ServerActionResponse<T>>,
  options?: { recordResponse?: boolean },
) {
  return (...args: Args) =>
    withServerActionInstrumentation(
      name,
      {
        recordResponse: options?.recordResponse ?? true,
      },
      () => action(...args),
    );
}
