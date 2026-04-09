import { ImapFlow } from "imapflow";
import type { ImapCredentialConfig } from "@/utils/imap/types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("imap/client");

const CONNECT_TIMEOUT_MS = 30_000;

export function createImapConnection(config: ImapCredentialConfig): ImapFlow {
  return new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapSecurity === "tls",
    auth: {
      user: config.username,
      pass: config.password,
    },
    logger: false,
    tls: {
      rejectUnauthorized: config.imapSecurity !== "none",
    },
  });
}

export async function withImapConnection<T>(
  config: ImapCredentialConfig,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = createImapConnection(config);

  try {
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("IMAP connection timeout")),
          CONNECT_TIMEOUT_MS,
        ),
      ),
    ]);

    return await fn(client);
  } catch (error) {
    logger.error("IMAP connection error", {
      host: config.imapHost,
      error,
    });
    throw error;
  } finally {
    try {
      await client.logout();
    } catch {
      // Ignore logout errors
    }
  }
}
