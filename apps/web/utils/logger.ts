type LogLevel = "log" | "error" | "warn" | "trace";
type LogMessage = string | Record<string, unknown>;

const colors = {
  log: "\x1b[0m", // white
  error: "\x1b[31m", // red
  warn: "\x1b[33m", // yellow
  trace: "\x1b[36m", // cyan
  reset: "\x1b[0m",
} as const;

export function createScopeLogger(scope: string) {
  const formatMessage = (level: LogLevel, message: LogMessage) => {
    const prefix = `[${scope}]: `;

    if (process.env.NODE_ENV === "development") {
      return `${colors[level]}${prefix} ${
        typeof message === "string" ? message : JSON.stringify(message, null, 2)
      }${colors.reset}`;
    }

    return `${prefix} ${
      typeof message === "string" ? message : JSON.stringify(message)
    }`;
  };

  return {
    log: (message: LogMessage, ...args: unknown[]) =>
      console.log(formatMessage("log", message), ...args),

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
