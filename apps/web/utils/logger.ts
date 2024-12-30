import { log } from "next-axiom";
import { env } from "@/env";

type LogLevel = "info" | "error" | "warn" | "trace";
type LogMessage = string | Record<string, unknown>;

const colors = {
  info: "\x1b[0m", // white
  error: "\x1b[31m", // red
  warn: "\x1b[33m", // yellow
  trace: "\x1b[36m", // cyan
  reset: "\x1b[0m",
} as const;

export function createScopedLogger(scope: string) {
  if (env.NEXT_PUBLIC_AXIOM_TOKEN) return createAxiomLogger(scope);

  const formatMessage = (level: LogLevel, message: LogMessage) => {
    const prefix = `[${scope}]: `;

    if (process.env.NODE_ENV === "development") {
      return `${colors[level]}${prefix}${
        typeof message === "string" ? message : JSON.stringify(message, null, 2)
      }${colors.reset}`;
    }

    return `${prefix} ${
      typeof message === "string" ? message : JSON.stringify(message)
    }`;
  };

  return {
    info: (message: LogMessage, ...args: unknown[]) =>
      console.log(formatMessage("info", message), ...args),

    error: (message: LogMessage, ...args: unknown[]) =>
      console.error(formatMessage("error", message), ...args),

    warn: (message: LogMessage, ...args: unknown[]) =>
      console.warn(formatMessage("warn", message), ...args),

    trace: (message: LogMessage, ...args: unknown[]) => {
      if (process.env.NODE_ENV === "development") {
        console.log(formatMessage("trace", message), ...args);
      }
    },
  };
}

function createAxiomLogger(scope: string) {
  function formatMessage(message: LogMessage) {
    const prefix = `[${scope}]: `;
    return typeof message === "string"
      ? `${prefix}${message}`
      : `${prefix}${JSON.stringify(message)}`;
  }

  return {
    info: (message: LogMessage, ...args: unknown[]) =>
      log.info(formatMessage(message), args.length ? { args } : undefined),
    error: (message: LogMessage, ...args: unknown[]) =>
      log.error(formatMessage(message), args.length ? { args } : undefined),
    warn: (message: LogMessage, ...args: unknown[]) =>
      log.warn(formatMessage(message), args.length ? { args } : undefined),
    trace: (message: LogMessage, ...args: unknown[]) => {
      if (process.env.NODE_ENV === "development") {
        log.debug(formatMessage(message), args.length ? { args } : undefined);
      }
    },
  };
}
