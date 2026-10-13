import { ImapFlow } from "imapflow";
import { SafeError } from "@/utils/error";

export async function withICloudClient<T>(
  credentials: { username: string; password: string },
  operation: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = new ImapFlow({
    host: "imap.mail.me.com",
    port: 993,
    secure: true,
    auth: { user: credentials.username, pass: credentials.password },
    maxLiteralSize: 30 * 1024 * 1024,
    maxResponseSize: 32 * 1024 * 1024,
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    tls: { rejectUnauthorized: true },
  });
  client.on("error", () => {});
  try {
    await client.connect();
    return await operation(client);
  } catch (error) {
    if (error instanceof SafeError) throw error;
    const authFailed =
      typeof error === "object" &&
      error !== null &&
      "authenticationFailed" in error &&
      error.authenticationFailed;
    if (authFailed)
      throw new SafeError(
        "iCloud sign-in failed. Check your email and Apple app-specific password.",
        401,
      );
    throw new SafeError(
      "The iCloud operation could not be confirmed. Refresh the mailbox before trying again.",
    );
  } finally {
    // A failed operation must not keep a socket or credential-bearing session alive.
    client.close();
  }
}

export function assertSafeICloudMove(client: Pick<ImapFlow, "capabilities">) {
  if (!client.capabilities.has("MOVE") && !client.capabilities.has("UIDPLUS"))
    throw new SafeError(
      "This server cannot move messages without risking unrelated deleted mail.",
    );
}
