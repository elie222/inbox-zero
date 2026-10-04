import { strict as assert } from "node:assert/strict";
import { test } from "node:test";
import {
  FastmailEventSourceClient,
  buildEventSourceUrl,
  readEmailState,
} from "./eventsource-client.js";

test("expands the JMAP EventSource template and requests a persistent connection", () => {
  const url = new URL(
    buildEventSourceUrl(
      "https://api.fastmail.com/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
    ),
  );
  assert.equal(url.searchParams.get("types"), "Email,Mailbox");
  assert.equal(url.searchParams.get("closeafter"), "no");
  assert.equal(url.searchParams.get("ping"), "60");
  assert.equal(url.toString().includes("%7B"), false);
});
test("accepts only Email changes for the connected account", () => {
  assert.equal(
    readEmailState(
      { "@type": "StateChange", changed: { account: { Email: "s2" } } },
      "account",
    ),
    "s2",
  );
  assert.equal(
    readEmailState(
      { "@type": "StateChange", changed: { other: { Email: "s2" } } },
      "account",
    ),
    undefined,
  );
  assert.equal(
    readEmailState(
      { "@type": "StateChange", changed: { account: { Mailbox: "s2" } } },
      "account",
    ),
    undefined,
  );
  assert.equal(
    readEmailState(
      { "@type": "Other", changed: { account: { Email: "s2" } } },
      "account",
    ),
    undefined,
  );
});

test("reconnects with a rotated token, catches up on connection, and stops cleanly", async (context) => {
  const authorizations: string[] = [];
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let connected = 0;
  const states: string[] = [];
  context.mock.method(
    globalThis,
    "fetch",
    async (_input: unknown, init: RequestInit) => {
      authorizations.push(new Headers(init.headers).get("authorization") ?? "");
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
        },
      });
      return new Response(stream, {
        headers: { "content-type": "text/event-stream" },
      });
    },
  );
  const client = new FastmailEventSourceClient({
    accessToken: "first",
    accountId: "account",
    emailAccountId: "local",
    eventSourceUrl: "https://api.fastmail.com/events",
    onConnected: () => {
      connected++;
    },
    onStateChange: (_, state) => states.push(state),
  });
  try {
    client.connect();
    await settle();
    streamController?.enqueue(
      new TextEncoder().encode(
        'event: state\ndata: {"@type":"StateChange","changed":{"account":{"Email":"s2"}}}\n\n',
      ),
    );
    await settle();
    assert.deepEqual(states, ["s2"]);
    client.updateAccessToken("second");
    await settle();
    assert.equal(connected, 2);
    assert.deepEqual(authorizations, ["Bearer first", "Bearer second"]);
    client.close();
    client.connect();
    await settle();
    assert.equal(authorizations.length, 2);
    assert.equal(client.isConnected(), false);
  } finally {
    client.close();
  }
});

test("backs off across short-lived connections and recovers after a stable stream", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  context.mock.method(Math, "random", () => 0);
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let connections = 0;
  context.mock.method(globalThis, "fetch", async () => {
    connections++;
    return new Response(
      new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  const client = new FastmailEventSourceClient({
    accessToken: "token",
    accountId: "account",
    emailAccountId: "local",
    eventSourceUrl: "https://api.fastmail.com/events",
    onStateChange: () => {},
  });
  try {
    client.connect();
    await settle();
    for (const delay of [
      1000, 2000, 4000, 8000, 16_000, 32_000, 64_000, 128_000, 256_000, 300_000,
      300_000,
    ]) {
      context.mock.timers.tick(2000);
      controller!.close();
      await settle();
      const before = connections;
      context.mock.timers.tick(delay - 1);
      await settle();
      assert.equal(connections, before, "must wait for the growing backoff");
      context.mock.timers.tick(1);
      await settle();
      assert.equal(connections, before + 1);
    }

    context.mock.timers.tick(60_000);
    controller!.close();
    await settle();
    const before = connections;
    context.mock.timers.tick(1000);
    await settle();
    assert.equal(connections, before + 1, "a stable stream resets the backoff");

    controller!.close();
    await settle();
    client.close();
    context.mock.timers.tick(300_000);
    await settle();
    assert.equal(connections, before + 1, "shutdown cancels a pending retry");
  } finally {
    client.close();
  }
});

test("handles server close events without waiting for EOF or reporting a network error", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  context.mock.method(Math, "random", () => 0);
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let connections = 0;
  let errors = 0;
  let disconnected = 0;
  context.mock.method(globalThis, "fetch", async () => {
    connections++;
    return new Response(
      new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  const client = new FastmailEventSourceClient({
    accessToken: "token",
    accountId: "account",
    emailAccountId: "local",
    eventSourceUrl: "https://api.fastmail.com/events",
    onStateChange: () => {},
    onError: () => {
      errors++;
    },
    onDisconnected: () => {
      disconnected++;
    },
  });
  try {
    client.connect();
    await settle();
    controller!.enqueue(new TextEncoder().encode("event: close\ndata: {}\n\n"));
    await settle();
    assert.equal(client.isConnected(), false);
    assert.equal(disconnected, 1);
    assert.equal(errors, 0);
    controller!.close();
    await settle();
    context.mock.timers.tick(1000);
    await settle();
    assert.equal(connections, 2, "a server close schedules only one reconnect");
    assert.equal(errors, 0);
  } finally {
    client.close();
  }
});

function settle() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}
