/**
 * Shared helpers for Gmail integration tests using @inbox-zero/emulate.
 *
 * Eliminates boilerplate: emulator creation, OAuth setup, GmailProvider
 * instantiation, and thread ID resolution.
 */

import { createEmulator, type Emulator } from "emulate";
import { gmail, auth } from "@googleapis/gmail";
import { GmailProvider } from "@/utils/email/google";
import { createScopedLogger } from "@/utils/logger";

type SeedMessage = {
  id: string;
  user_email: string;
  from: string;
  to: string;
  subject: string;
  body_text: string;
  body_html?: string;
  label_ids: string[];
  internal_date: string;
};

export type GmailTestHarness = {
  emulator: Emulator;
  gmailClient: ReturnType<typeof gmail>;
  provider: GmailProvider;
  /** Map of seed message ID → emulator-assigned thread ID */
  threadIds: Record<string, string>;
};

/**
 * Creates a fully wired Gmail test environment:
 * emulator + OAuth client + Gmail client + GmailProvider + thread ID map.
 *
 * Call `harness.emulator.close()` in afterAll to clean up.
 */
export async function createGmailTestHarness({
  port,
  email,
  messages,
}: {
  port: number;
  email: string;
  messages: SeedMessage[];
}): Promise<GmailTestHarness> {
  const emulator = await createEmulator({
    service: "google",
    port,
    seed: {
      google: {
        users: [{ email, name: "Test User" }],
        oauth_clients: [
          {
            client_id: "test-client.apps.googleusercontent.com",
            client_secret: "test-secret",
            redirect_uris: ["http://localhost:3000/callback"],
          },
        ],
        messages,
      },
    },
  });

  const oauth2Client = new auth.OAuth2(
    "test-client.apps.googleusercontent.com",
    "test-secret",
  );
  oauth2Client.setCredentials({ access_token: "emulator-token" });

  const gmailClient = gmail({
    version: "v1",
    auth: oauth2Client,
    rootUrl: emulator.url,
  });

  const logger = createScopedLogger("test");
  const provider = new GmailProvider(gmailClient, logger, "test-account-id");

  // Resolve thread IDs in parallel
  const entries = await Promise.all(
    messages.map(async (seed) => {
      const msg = await gmailClient.users.messages.get({
        userId: "me",
        id: seed.id,
      });
      return [seed.id, msg.data.threadId!] as const;
    }),
  );
  const threadIds = Object.fromEntries(entries);

  return { emulator, gmailClient, provider, threadIds };
}
