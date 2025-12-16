/**
 * Simple logger for the Claude Code wrapper service.
 * Uses stderr for logging to avoid interfering with stdout data.
 */
export const logger = {
  info: (message: string, ...args: unknown[]) => {
    process.stderr.write(
      `[INFO] [${new Date().toISOString()}] ${message} ${args.length ? JSON.stringify(args) : ""}\n`,
    );
  },
  error: (message: string, ...args: unknown[]) => {
    process.stderr.write(
      `[ERROR] [${new Date().toISOString()}] ${message} ${args.length ? JSON.stringify(args) : ""}\n`,
    );
  },
  warn: (message: string, ...args: unknown[]) => {
    process.stderr.write(
      `[WARN] [${new Date().toISOString()}] ${message} ${args.length ? JSON.stringify(args) : ""}\n`,
    );
  },
};
