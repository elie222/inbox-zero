import { describe, expect, it, vi } from "vitest";
import {
  consumeMailboxSignalBuffer,
  followMailboxSignal,
  watchMailboxSignals,
} from "./mailbox-signals";

describe("mailbox change signals", () => {
  it("reads a mailbox-change event split across chunks", () => {
    const first = consumeMailboxSignalBuffer(
      "event: ready\ndata: {}\n\nevent: mail",
    );
    expect(first.changed).toBe(false);
    const second = consumeMailboxSignalBuffer(
      `${first.rest}box-change\ndata: {}\n\n`,
    );
    expect(second).toEqual({ rest: "", changed: true });
  });

  it("ignores heartbeats and other accounts' event names", () => {
    expect(
      consumeMailboxSignalBuffer("event: heartbeat\ndata: {}\n\n").changed,
    ).toBe(false);
  });

  it("follows the stream and reports a change without message content", async () => {
    const changes: string[] = [];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode("event: heartbeat\ndata: {}\n\n"));
        controller.enqueue(
          encoder.encode('event: mailbox-change\ndata: {"secret":"nope"}\n\n'),
        );
      },
    });
    const controller = new AbortController();
    await followMailboxSignal({
      origin: "https://mail.example",
      accountId: "account-1",
      cookieHeader: async () => "session=1",
      signal: controller.signal,
      onChange: () => {
        changes.push("account-1");
        controller.abort();
      },
      fetchImpl: async (url, init) => {
        expect(String(url)).toBe(
          "https://mail.example/api/mail-stream?emailAccountId=account-1",
        );
        expect(new Headers(init?.headers).get("cookie")).toBe("session=1");
        return new Response(stream, { status: 200 });
      },
    });
    expect(changes).toEqual(["account-1"]);
  });

  it("asks the engine to catch up known accounts and stops when one leaves", async () => {
    const parent = new AbortController();
    const followed: string[] = [];
    const synced: string[] = [];
    let listed = 0;
    const done = watchMailboxSignals({
      readAccountIds: async () => {
        listed += 1;
        return listed === 1 ? ["acc-1"] : [];
      },
      follow: async (accountId, signal, onChange) => {
        followed.push(accountId);
        onChange();
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else
            signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
      onChange: async (accountId) => {
        synced.push(accountId);
      },
      signal: parent.signal,
      rescanMs: 0,
    });

    await vi.waitFor(() => expect(synced).toEqual(["acc-1"]));
    await vi.waitFor(() => expect(followed).toEqual(["acc-1"]));
    parent.abort();
    await done;
  });
});
