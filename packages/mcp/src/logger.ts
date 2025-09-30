import type { Logger } from "./types";

/**
 * Internal no-op logger (used as default when no logger provided)
 */
export const noopLogger: Logger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  log: () => {},
};
