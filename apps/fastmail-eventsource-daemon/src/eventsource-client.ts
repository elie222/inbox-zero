import { EventSource } from "eventsource";
import { log } from "./log.js";

interface Options {
  accessToken: string;
  accountId: string;
  emailAccountId: string;
  eventSourceUrl: string;
  onConnected?: (id: string) => void;
  onDisconnected?: (id: string) => void;
  onError?: (id: string, error: Error) => void;
  onStateChange: (id: string, state: string) => void;
}

export class FastmailEventSourceClient {
  private stream?: EventSource;
  private reconnect?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private connectedAt?: number;
  private closed = false;

  private readonly options: Options;
  constructor(options: Options) {
    this.options = options;
  }

  connect() {
    if (this.closed) return;
    this.disconnect();
    this.stream = new EventSource(
      buildEventSourceUrl(this.options.eventSourceUrl),
      {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            headers: {
              ...Object.fromEntries(new Headers(init?.headers)),
              Authorization: `Bearer ${this.options.accessToken}`,
            },
          }),
      },
    );
    this.resetHeartbeat();
    this.stream.onopen = () => {
      this.connectedAt = Date.now();
      this.resetHeartbeat();
      log("Stream connected", { emailAccountId: this.options.emailAccountId });
      this.options.onConnected?.(this.options.emailAccountId);
    };
    this.stream.addEventListener("ping", () => this.resetHeartbeat());
    this.stream.addEventListener("close", () => this.retry("server-close"));
    this.stream.addEventListener("state", (event) => {
      this.resetHeartbeat();
      try {
        const state = readEmailState(
          JSON.parse((event as MessageEvent).data),
          this.options.accountId,
        );
        if (state)
          this.options.onStateChange(this.options.emailAccountId, state);
      } catch {
        log("Invalid state event", {
          emailAccountId: this.options.emailAccountId,
        });
      }
    });
    this.stream.onerror = (event) => {
      this.options.onError?.(
        this.options.emailAccountId,
        new Error(`EventSource failed: ${event.code ?? "network"}`),
      );
      this.retry("transport-error");
    };
  }

  disconnect() {
    if (this.reconnect) clearTimeout(this.reconnect);
    if (this.heartbeat) clearTimeout(this.heartbeat);
    this.stream?.close();
    this.stream = undefined;
    this.connectedAt = undefined;
  }

  close() {
    this.closed = true;
    this.disconnect();
  }
  isConnected() {
    return this.stream?.readyState === EventSource.OPEN;
  }

  updateAccessToken(token: string) {
    this.options.accessToken = token;
    this.attempts = 0;
    this.connect();
  }

  private resetHeartbeat() {
    if (this.heartbeat) clearTimeout(this.heartbeat);
    this.heartbeat = setTimeout(() => this.retry("heartbeat-timeout"), 150_000);
  }

  private retry(reason: string) {
    if (this.closed || !this.stream) return;
    const connectedForMs =
      this.connectedAt === undefined ? 0 : Date.now() - this.connectedAt;
    // An HTTP 200 followed by an immediate close must not defeat the backoff.
    if (connectedForMs >= 60_000) this.attempts = 0;
    this.disconnect();
    this.options.onDisconnected?.(this.options.emailAccountId);
    if (this.closed) return;
    const delayMs = Math.min(
      1000 * 2 ** Math.min(this.attempts++, 9) + Math.random() * 1000,
      300_000,
    );
    log("Stream reconnect scheduled", {
      emailAccountId: this.options.emailAccountId,
      reason,
      connectedForMs,
      delayMs,
    });
    this.reconnect = setTimeout(() => this.connect(), delayMs);
  }
}

export function buildEventSourceUrl(template: string) {
  const values: Record<string, string> = {
    types: "Email,Mailbox",
    closeafter: "no",
    ping: "60",
  };
  const url = new URL(
    template.replace(/\{(types|closeafter|ping)\}/g, (_, key: string) =>
      encodeURIComponent(values[key]),
    ),
  );
  for (const [key, value] of Object.entries(values))
    url.searchParams.set(key, value);
  return url.toString();
}

export function readEmailState(
  value: unknown,
  accountId: string,
): string | undefined {
  if (!value || typeof value !== "object") return;
  const event = value as {
    "@type"?: unknown;
    changed?: Record<string, { Email?: unknown }>;
  };
  if (event["@type"] !== "StateChange") return;
  const state = event.changed?.[accountId]?.Email;
  return typeof state === "string" ? state : undefined;
}
