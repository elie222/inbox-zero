/** biome-ignore-all lint/suspicious/noConsole: we use console.log for development logs */
import { log } from "next-axiom";
import { env } from "@/env";

export type Logger = ReturnType<typeof createScopedLogger>;

type LogLevel = "info" | "error" | "warn" | "trace";

const colors = {
  info: "\x1b[0m", // white
  error: "\x1b[31m", // red
  warn: "\x1b[33m", // yellow
  trace: "\x1b[36m", // cyan
  reset: "\x1b[0m",
} as const;

export function createScopedLogger(scope: string) {
  if (env.NEXT_PUBLIC_AXIOM_TOKEN) return createAxiomLogger(scope);
  if (env.NEXT_PUBLIC_LOG_SCOPES && !env.NEXT_PUBLIC_LOG_SCOPES.includes(scope))
    return createNullLogger();

  const createLogger = (fields: Record<string, unknown> = {}) => {
    const formatMessage = (
      level: LogLevel,
      message: string,
      args: unknown[],
    ) => {
      const allArgs = [...args];
      if (Object.keys(fields).length > 0) {
        allArgs.push(fields);
      }

      const formattedArgs = allArgs
        .map((arg) => {
          if (arg instanceof Error) {
            return arg.message;
          }
          if (typeof arg === "object" && arg !== null) {
            // Handle objects that may contain Error instances
            const processedArg = processErrorsInObject(arg);
            return JSON.stringify(processedArg, null, 2);
          }
          return String(arg);
        })
        .join(" ");

      const msg = `[${scope}]: ${message} ${formattedArgs}`;

      if (env.NODE_ENV === "development") {
        // Replace literal \n with actual newlines for development logs
        const formattedMsg = msg.replace(/\\n/g, "\n");
        return `${colors[level]}${formattedMsg}${colors.reset}`;
      }
      return msg;
    };

    return {
      info: (message: string, ...args: unknown[]) =>
        console.log(formatMessage("info", message, args)),
      error: (message: string, ...args: unknown[]) =>
        console.error(formatMessage("error", message, args)),
      warn: (message: string, ...args: unknown[]) =>
        console.warn(formatMessage("warn", message, args)),
      trace: (
        message: string,
        ...args: Array<unknown> | [() => unknown] | [() => unknown[]]
      ) => {
        if (!env.ENABLE_DEBUG_LOGS) return;
        const first = args[0];
        const resolved = typeof first === "function" ? first() : args;
        const finalArgs = Array.isArray(resolved) ? resolved : [resolved];
        console.log(formatMessage("trace", message, finalArgs));
      },
      with: (newFields: Record<string, unknown>) =>
        createLogger({ ...fields, ...newFields }),
    };
  };

  return createLogger();
}

function createAxiomLogger(scope: string) {
  const createLogger = (fields: Record<string, unknown> = {}) => ({
    info: (message: string, args?: Record<string, unknown>) =>
      log.info(message, { scope, ...fields, ...args }),
    error: (message: string, args?: Record<string, unknown>) =>
      log.error(message, { scope, ...fields, ...formatError(args) }),
    warn: (message: string, args?: Record<string, unknown>) =>
      log.warn(message, { scope, ...fields, ...args }),
    trace: (
      message: string,
      args?: Record<string, unknown> | (() => Record<string, unknown>),
    ) => {
      if (!env.ENABLE_DEBUG_LOGS) return;
      const resolved = typeof args === "function" ? args() : args;
      log.debug(message, { scope, ...fields, ...resolved });
    },
    with: (newFields: Record<string, unknown>) =>
      createLogger({ ...fields, ...newFields }),
  });

  return createLogger();
}

function createNullLogger() {
  return {
    info: () => {},
    error: () => {},
    warn: () => {},
    trace: () => {},
    with: () => createNullLogger(),
  };
}

function formatError(args?: Record<string, unknown>) {
  if (env.NODE_ENV !== "production") return args;
  const error = args?.error;
  if (error) args.error = cleanError(error);
  return args;
}

function cleanError(error: unknown) {
  if (error instanceof Error) return error.message;
  return error;
}

function processErrorsInObject(obj: unknown): unknown {
  if (obj instanceof Error) {
    return obj.message;
  }

  if (Array.isArray(obj)) {
    return obj.map(processErrorsInObject);
  }

  if (typeof obj === "object" && obj !== null) {
    const processed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      processed[key] = processErrorsInObject(value);
    }
    return processed;
  }

  return obj;
}
