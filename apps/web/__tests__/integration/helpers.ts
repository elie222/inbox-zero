/**
 * Shared helpers for integration tests using @inbox-zero/emulate.
 *
 * Eliminates boilerplate: emulator creation, OAuth/client setup,
 * provider instantiation, and thread ID resolution for both
 * Gmail and Outlook.
 */

import { createEmulator, type Emulator } from "emulate";
import { gmail, auth } from "@googleapis/gmail";
import { Client } from "@microsoft/microsoft-graph-client";
import { createTestLogger } from "@/__tests__/helpers";
import { GmailProvider } from "@/utils/email/google";
import { OutlookProvider } from "@/utils/email/microsoft";
import { OutlookClient } from "@/utils/outlook/client";
import type { EmailProvider } from "@/utils/email/types";

type GmailSeedMessage = {
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

type OutlookSeedMessage = {
  id?: string;
  user_email: string;
  from: { address: string; name?: string };
  to_recipients: Array<{ address: string; name?: string }>;
  cc_recipients?: Array<{ address: string; name?: string }>;
  subject: string;
  body_content: string;
  body_text_content?: string;
  parent_folder_id: string;
  is_read: boolean;
  is_draft?: boolean;
  received_date_time: string;
  sent_date_time?: string;
};

export type GmailTestHarness = {
  emulator: Emulator;
  gmailClient: ReturnType<typeof gmail>;
  provider: GmailProvider;
  /** Map of seed message ID → emulator-assigned thread ID */
  threadIds: Record<string, string>;
};

export type OutlookTestHarness = {
  emulator: Emulator;
  graphClient: Client;
  provider: OutlookProvider;
  /** Call in afterAll to restore globalThis.fetch */
  restoreFetch: () => void;
};

/** Common harness shape for provider-agnostic tests */
export type ProviderTestHarness = {
  emulator: Emulator;
  provider: EmailProvider;
  email: string;
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
  messages: GmailSeedMessage[];
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

  const logger = createTestLogger();
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

/**
 * Creates a fully wired Outlook test environment:
 * emulator + Microsoft Graph client + OutlookProvider.
 *
 * Call `harness.emulator.close()` in afterAll to clean up.
 */
export async function createOutlookTestHarness({
  port,
  email,
  messages,
  categories,
}: {
  port: number;
  email: string;
  messages: OutlookSeedMessage[];
  categories?: Array<{ display_name: string; color?: string }>;
}): Promise<OutlookTestHarness> {
  const emulator = await createEmulator({
    service: "microsoft",
    port,
    seed: {
      microsoft: {
        users: [{ email, name: "Test User" }],
        oauth_clients: [
          {
            client_id: "test-client-id",
            client_secret: "test-secret",
            redirect_uris: ["http://localhost:3000/callback"],
          },
        ],
        categories: categories || [],
        messages,
      },
    },
  });

  // The Graph client SDK's auth middleware only works with the default
  // graph.microsoft.com baseUrl. We let it build requests normally, then
  // intercept fetch to rewrite the URL to point at the emulator.
  const realFetch = globalThis.fetch;
  const graphBaseUrl = "https://graph.microsoft.com/v1.0";
  const emulatorBaseUrl = `${emulator.url}/v1.0`;

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    if (url.startsWith(graphBaseUrl)) {
      const rewritten = url.replace(graphBaseUrl, emulatorBaseUrl);
      // Preserve Request metadata (method, body, headers) when rewriting
      if (input instanceof Request) {
        return realFetch(new Request(rewritten, input), init);
      }
      return realFetch(rewritten, init);
    }
    return realFetch(input, init);
  }) as typeof fetch;

  const restoreFetch = () => {
    globalThis.fetch = realFetch;
  };

  const graphClient = Client.init({
    authProvider: (done) => {
      done(null, "emulator-token");
    },
    fetchOptions: {
      headers: {
        Prefer: 'IdType="ImmutableId"',
      },
    },
  });

  const logger = createTestLogger();
  // OutlookClient wraps a Graph client — we need to replace its internal
  // client with one that points at the emulator instead of graph.microsoft.com
  const outlookClient = new OutlookClient("emulator-token", logger);
  (outlookClient as any).client = graphClient;

  const provider = new OutlookProvider(outlookClient, logger);

  return { emulator, graphClient, provider, restoreFetch };
}
