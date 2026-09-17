import { EventEmitter } from "node:events";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailAccount } from "@/utils/redis/account-validation";
import { RedisSubscriber } from "@/utils/redis/subscriber";
import { refreshLocalMailInterest } from "@/utils/redis/local-mail-hints";
import { GET } from "./route";

vi.mock("@/utils/middleware", async () => {
  const { createWithAuthTestMiddleware } = await import("@/__tests__/helpers");
  return createWithAuthTestMiddleware();
});
vi.mock("@/utils/redis/account-validation", () => ({
  getEmailAccount: vi.fn(),
}));
vi.mock("@/utils/redis/local-mail-hints", () => ({
  localMailHintChannel: (id: string) => `local-mail:${id}`,
  refreshLocalMailInterest: vi.fn(),
}));
vi.mock("@/utils/redis/subscriber", () => ({
  RedisSubscriber: { createInstance: vi.fn() },
}));

let subscriber: ReturnType<typeof makeSubscriber>;

describe("Mail realtime stream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    subscriber = makeSubscriber();
    vi.mocked(RedisSubscriber.createInstance).mockReturnValue(
      subscriber as never,
    );
    vi.mocked(getEmailAccount).mockResolvedValue("user@example.com");
    vi.mocked(refreshLocalMailInterest).mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects missing or unowned accounts before subscribing or creating interest", async () => {
    expect(
      (await GET(new NextRequest("http://localhost/api/mail-stream"))).status,
    ).toBe(400);
    vi.mocked(getEmailAccount).mockResolvedValue(null);
    expect((await GET(request())).status).toBe(403);
    expect(RedisSubscriber.createInstance).not.toHaveBeenCalled();
    expect(refreshLocalMailInterest).not.toHaveBeenCalled();
  });
  it("subscribes before ready and scopes opaque hints to the owned account", async () => {
    let resolveSubscription!: () => void;
    subscriber.subscribe.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSubscription = resolve;
        }),
    );
    const response = await GET(request());
    const reader = response.body!.getReader();
    expect(refreshLocalMailInterest).not.toHaveBeenCalled();
    resolveSubscription();
    await vi.advanceTimersByTimeAsync(0);
    expect(await read(reader)).toContain("event: heartbeat");
    expect(await read(reader)).toContain("event: ready");
    subscriber.emit("message", "local-mail:other-account", "secret");
    subscriber.emit("message", "local-mail:account-a", "secret");
    expect(await read(reader)).toBe("event: mailbox-change\ndata: {}\n\n");
    await reader.cancel();
    expect(subscriber.disconnect).toHaveBeenCalledOnce();
    expect(subscriber.listenerCount("message")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    "abort",
    "error",
    "cancel",
  ])("cleans up after %s without renewing interest", async (cause) => {
    const abort = new AbortController();
    const response = await GET(request(abort.signal));
    await vi.advanceTimersByTimeAsync(0);
    if (cause === "abort") abort.abort();
    if (cause === "error") subscriber.emit("error", new Error("Unavailable"));
    if (cause === "cancel") await response.body!.cancel();
    const calls = vi.mocked(refreshLocalMailInterest).mock.calls.length;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(refreshLocalMailInterest).toHaveBeenCalledTimes(calls);
    expect(subscriber.disconnect).toHaveBeenCalledOnce();
    expect(subscriber.listenerCount("message")).toBe(0);
    expect(subscriber.listenerCount("error")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("ends at its absolute lifetime even when hints keep arriving", async () => {
    await GET(request());
    await vi.advanceTimersByTimeAsync(269_000);
    subscriber.emit("message", "local-mail:account-a", "{}");
    expect(subscriber.disconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(subscriber.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("closes when subscription fails without creating interest", async () => {
    subscriber.subscribe.mockRejectedValue(new Error("Unavailable"));
    const response = await GET(request());
    expect(await response.body!.getReader().read()).toEqual({
      done: true,
      value: undefined,
    });
    expect(refreshLocalMailInterest).not.toHaveBeenCalled();
    expect(subscriber.disconnect).toHaveBeenCalledOnce();
  });
  it("cleans up when lease renewal fails", async () => {
    vi.mocked(refreshLocalMailInterest).mockRejectedValue(
      new Error("Unavailable"),
    );
    const response = await GET(request());
    expect(await response.body!.getReader().read()).toEqual({
      done: true,
      value: undefined,
    });
    expect(subscriber.disconnect).toHaveBeenCalledOnce();
  });
});
function request(signal?: AbortSignal) {
  return new NextRequest(
    "http://localhost/api/mail-stream?emailAccountId=account-a",
    { signal },
  );
}
async function read(reader: ReadableStreamDefaultReader<Uint8Array>) {
  return new TextDecoder().decode((await reader.read()).value);
}

function makeSubscriber() {
  return Object.assign(new EventEmitter(), {
    subscribe: vi.fn().mockResolvedValue(1),
    disconnect: vi.fn(),
  });
}
