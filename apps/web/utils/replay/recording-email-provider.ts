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

      return (...args: unknown[]) => {
        const startTime = Date.now();

        recordInBackground(
          session.record("email-api-call", {
            method,
            request: sanitizeArgs(method, args),
          }),
        );

        try {
          const result = (original as (...a: unknown[]) => unknown).apply(
            target,
            args,
          );

          if (isPromiseLike(result)) {
            return result.then(
              (resolved) => {
                recordInBackground(
                  session.record("email-api-response", {
                    method,
                    request: null,
                    response: resolved,
                    duration: Date.now() - startTime,
                  }),
                );
                return resolved;
              },
              (error) => {
                recordInBackground(
                  session.record("email-api-response", {
                    method,
                    request: null,
                    response: {
                      error: true,
                      message:
                        error instanceof Error ? error.message : String(error),
                    },
                    duration: Date.now() - startTime,
                  }),
                );
                throw error;
              },
            );
          }

          recordInBackground(
            session.record("email-api-response", {
              method,
              request: null,
              response: result,
              duration: Date.now() - startTime,
            }),
          );

          return result;
        } catch (error) {
          recordInBackground(
            session.record("email-api-response", {
              method,
              request: null,
              response: {
                error: true,
                message: error instanceof Error ? error.message : String(error),
              },
              duration: Date.now() - startTime,
            }),
          );
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

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function recordInBackground(promise: Promise<void>) {
  promise.catch(() => {});
}
