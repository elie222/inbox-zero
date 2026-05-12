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
import { WebClient } from "@slack/web-api";
import { createHmac } from "node:crypto";
import { createServer } from "node:net";
import { createTestLogger } from "@/__tests__/helpers";
import { GmailProvider } from "@/utils/email/google";
import { OutlookProvider } from "@/utils/email/microsoft";
import { OutlookClient } from "@/utils/outlook/client";
import type { EmailProvider } from "@/utils/email/types";

type GmailSeedMessage = {
  id: string;
  user_email: string;
  thread_id?: string;
  message_id?: string;
  references?: string;
  in_reply_to?: string;
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  reply_to?: string;
  subject: string;
  body_text: string;
  body_html?: string;
  snippet?: string;
  label_ids: string[];
  internal_date: string;
  date?: string;
};

type OutlookSeedMessage = {
  id?: string;
  microsoft_id?: string;
  conversation_id?: string;
  internet_message_id?: string;
  user_email: string;
  from: { address: string; name?: string };
  to_recipients: Array<{ address: string; name?: string }>;
  cc_recipients?: Array<{ address: string; name?: string }>;
  subject: string;
  body_content: string;
  body_content_type?: "html" | "text";
  body_text_content?: string;
  parent_folder_id: string;
  is_read: boolean;
  is_draft?: boolean;
  received_date_time: string;
  sent_date_time?: string;
};

type SlackSeedUser = {
  name: string;
  real_name?: string;
  email?: string;
  is_admin?: boolean;
};

type SlackSeedChannel = {
  name: string;
  is_private?: boolean;
  topic?: string;
  purpose?: string;
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

export type SlackTestHarness = {
  emulator: Emulator;
  client: WebClient;
  teamId: string;
  channelsByName: Record<string, string>;
  usersByName: Record<string, string>;
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
  port?: number;
  email: string;
  messages: GmailSeedMessage[];
}): Promise<GmailTestHarness> {
  const emulatorPort = port ?? (await getAvailablePort());
  const emulator = await createEmulator({
    service: "google",
    port: emulatorPort,
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
  port?: number;
  email: string;
  messages: OutlookSeedMessage[];
  categories?: Array<{ display_name: string; color?: string }>;
}): Promise<OutlookTestHarness> {
  const emulatorPort = port ?? (await getAvailablePort());
  const emulator = await createEmulator({
    service: "microsoft",
    port: emulatorPort,
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

export async function createSlackTestHarness({
  port,
  team,
  users = [],
  channels = [],
  token = "emulator-token",
}: {
  port?: number;
  team: { name: string; domain: string };
  users?: SlackSeedUser[];
  channels?: SlackSeedChannel[];
  token?: string;
}): Promise<SlackTestHarness> {
  const emulatorPort = port ?? (await getAvailablePort());
  const emulator = await createEmulator({
    service: "slack",
    port: emulatorPort,
    seed: {
      slack: {
        team,
        users,
        channels,
      },
    },
  });

  const client = new WebClient(token, {
    slackApiUrl: `${emulator.url}/api/`,
  });

  const auth = await client.auth.test();
  const listedChannels = await client.conversations.list({
    types: "public_channel,private_channel",
  });
  const listedUsers = await client.users.list();

  return {
    emulator,
    client,
    teamId: auth.team_id!,
    channelsByName: Object.fromEntries(
      (listedChannels.channels ?? [])
        .filter((channel) => channel.name && channel.id)
        .map((channel) => [channel.name!, channel.id!]),
    ),
    usersByName: Object.fromEntries(
      (listedUsers.members ?? [])
        .filter((user) => user.name && user.id)
        .map((user) => [user.name!, user.id!]),
    ),
  };
}

export function createSignedSlackRequest({
  body,
  signingSecret = "test-signing-secret",
  timestamp = `${Math.floor(Date.now() / 1000)}`,
  url = "https://example.com/api/slack/events",
}: {
  body: string | Record<string, unknown>;
  signingSecret?: string;
  timestamp?: string;
  url?: string;
}) {
  const requestBody = typeof body === "string" ? body : JSON.stringify(body);
  const signature = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${requestBody}`)
    .digest("hex")}`;

  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    },
    body: requestBody,
  });
}

export async function getAvailablePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();

    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        if (typeof address === "object" && address?.port) {
          resolve(address.port);
          return;
        }

        reject(new Error("Failed to allocate an emulator port"));
      });
    });
  });
}
