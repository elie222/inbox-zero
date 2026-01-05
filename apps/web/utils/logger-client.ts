/** biome-ignore-all lint/suspicious/noConsole: we use console.log for development logs */
import { log } from "next-axiom";
import { env } from "@/env";

/**
 * Client-safe logger that doesn't access server-side env vars.
 * Uses next-axiom for production logging (if NEXT_PUBLIC_AXIOM_TOKEN is set)
 * and falls back to console otherwise.
 */
export function createClientLogger(scope: string) {
  const hasAxiom = !!env.NEXT_PUBLIC_AXIOM_TOKEN;

  if (hasAxiom) {
    return {
      info: (message: string, args?: Record<string, unknown>) =>
        log.info(message, { scope, ...(args ?? {}) }),
      error: (message: string, args?: Record<string, unknown>) =>
        log.error(message, { scope, ...(args ?? {}) }),
      warn: (message: string, args?: Record<string, unknown>) =>
        log.warn(message, { scope, ...(args ?? {}) }),
      flush: () => log.flush(),
    };
  }

  return {
    info: (message: string, args?: Record<string, unknown>) =>
      console.log(`[${scope}]:`, message, args ?? ""),
    error: (message: string, args?: Record<string, unknown>) =>
      console.error(`[${scope}]:`, message, args ?? ""),
    warn: (message: string, args?: Record<string, unknown>) =>
      console.warn(`[${scope}]:`, message, args ?? ""),
    flush: () => Promise.resolve(),
  };
}
