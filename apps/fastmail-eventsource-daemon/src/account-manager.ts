import { env } from "./env.js";
import { FastmailEventSourceClient } from "./eventsource-client.js";
import { callWebhook } from "./webhook-caller.js";
import { log } from "./log.js";
import { z } from "zod";

const configSchema = z.object({
  accounts: z.array(
    z.object({ emailAccountId: z.string(), accessToken: z.string().min(1) }),
  ),
});
const sessionSchema = z.object({
  eventSourceUrl: z.string().url(),
  primaryAccounts: z.record(z.string()),
});

export class AccountManager {
  private readonly connections = new Map<
    string,
    { token: string; client: FastmailEventSourceClient }
  >();
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private lastPoll = 0;

  async start() {
    this.stopped = false;
    await this.refresh();
  }
  async stop() {
    this.stopped = true;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    for (const connection of this.connections.values())
      connection.client.close();
    this.connections.clear();
  }
  getStats() {
    return {
      total: this.connections.size,
      connected: [...this.connections.values()].filter((entry) =>
        entry.client.isConnected(),
      ).length,
    };
  }

  private async refresh() {
    try {
      const response = await fetch(
        `${env.MAIN_APP_URL}/api/fastmail/accounts`,
        {
          headers: { "x-api-key": env.INTERNAL_API_KEY },
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!response.ok)
        throw new Error(`Account configuration failed: ${response.status}`);
      const { accounts } = configSchema.parse(await response.json());
      if (this.stopped) return;
      const ids = new Set(accounts.map((account) => account.emailAccountId));
      for (const [id, connection] of this.connections) {
        if (!ids.has(id)) {
          connection.client.close();
          this.connections.delete(id);
        }
      }
      for (const account of accounts) {
        if (this.stopped) return;
        const existing = this.connections.get(account.emailAccountId);
        if (existing?.token === account.accessToken) continue;
        existing?.client.close();
        this.connections.delete(account.emailAccountId);
        try {
          const response = await fetch(
            "https://api.fastmail.com/jmap/session",
            {
              headers: { Authorization: `Bearer ${account.accessToken}` },
              signal: AbortSignal.timeout(30_000),
            },
          );
          if (!response.ok)
            throw new Error(`Session failed: ${response.status}`);
          const session = sessionSchema.parse(await response.json());
          const accountId =
            session.primaryAccounts["urn:ietf:params:jmap:mail"];
          if (!accountId) throw new Error("Mail account missing from session");
          if (this.stopped) return;
          const client = new FastmailEventSourceClient({
            ...account,
            accountId,
            eventSourceUrl: session.eventSourceUrl,
            onConnected: (id) => {
              callWebhook(id);
            },
            onStateChange: (id, state) => {
              callWebhook(id, state);
            },
            onError: (id, error) =>
              log("Stream unavailable", {
                emailAccountId: id,
                error: error.message,
              }),
          });
          this.connections.set(account.emailAccountId, {
            token: account.accessToken,
            client,
          });
          client.connect();
        } catch (error) {
          log("Cannot connect account", {
            emailAccountId: account.emailAccountId,
            error: error instanceof Error ? error.message : "Unknown failure",
          });
        }
      }
      if (Date.now() - this.lastPoll >= 300_000) {
        for (const id of this.connections.keys()) await callWebhook(id);
        this.lastPoll = Date.now();
      }
      log("Connection status", this.getStats());
    } catch (error) {
      log("Account refresh failed", {
        error: error instanceof Error ? error.message : "Unknown failure",
      });
    } finally {
      if (!this.stopped)
        this.refreshTimer = setTimeout(() => {
          this.refresh();
        }, env.ACCOUNT_REFRESH_INTERVAL);
    }
  }
}
