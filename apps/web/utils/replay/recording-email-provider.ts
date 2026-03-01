import type { EmailProvider } from "@/utils/email/types";
import type { RecordingSessionHandle } from "./recorder";

export function createRecordingEmailProvider(
  provider: EmailProvider,
  session: RecordingSessionHandle,
): EmailProvider {
  return new Proxy(provider, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      if (typeof original !== "function") return original;
      if (prop === "toJSON" || prop === "name") return original;

      const method = prop as string;

      return async (...args: unknown[]) => {
        const startTime = Date.now();

        await session.record("email-api-call", {
          method,
          request: sanitizeArgs(method, args),
        });

        try {
          const result = await (original as (...a: unknown[]) => unknown).apply(
            target,
            args,
          );
          const duration = Date.now() - startTime;

          await session.record("email-api-response", {
            method,
            request: null,
            response: result,
            duration,
          });

          return result;
        } catch (error) {
          await session.record("email-api-response", {
            method,
            request: null,
            response: {
              error: true,
              message: error instanceof Error ? error.message : String(error),
            },
            duration: Date.now() - startTime,
          });
          throw error;
        }
      };
    },
  });
}

function sanitizeArgs(_method: string, args: unknown[]): unknown {
  return args.map((arg) => {
    if (typeof arg === "string") return arg;
    if (typeof arg === "number") return arg;
    if (typeof arg === "boolean") return arg;
    if (arg === null || arg === undefined) return arg;
    if (Array.isArray(arg)) return arg;
    if (typeof arg === "object") {
      try {
        return JSON.parse(JSON.stringify(arg));
      } catch {
        return "[unserializable]";
      }
    }
    return String(arg);
  });
}
