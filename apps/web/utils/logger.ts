import { log } from "next-axiom";
import { env } from "@/env";

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

  const formatMessage = (level: LogLevel, message: string) => {
    const msg = `[${scope}]: ${message}`;
    if (process.env.NODE_ENV === "development")
      return `${colors[level]}${msg}${colors.reset}`;
    return msg;
  };

  return {
    info: (message: string, ...args: unknown[]) =>
      console.log(formatMessage("info", message), ...args),

    error: (message: string, ...args: unknown[]) =>
      console.error(formatMessage("error", message), ...args),

    warn: (message: string, ...args: unknown[]) =>
      console.warn(formatMessage("warn", message), ...args),

    trace: (message: string, ...args: unknown[]) => {
      if (process.env.NODE_ENV === "development") {
        console.log(formatMessage("trace", message), ...args);
      }
    },
  };
}

function createAxiomLogger(scope: string) {
  return {
    info: (message: string, args?: Record<string, unknown>) =>
      log.info(message, { scope, ...args }),
    error: (message: string, args?: Record<string, unknown>) =>
      log.error(message, { scope, ...args }),
    warn: (message: string, args?: Record<string, unknown>) =>
      log.warn(message, { scope, ...args }),
    trace: (message: string, args?: Record<string, unknown>) => {
      if (process.env.NODE_ENV === "development") {
        log.debug(message, { scope, ...args });
      }
    },
  };
}
