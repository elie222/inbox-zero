import { afterEach, expect, it, vi } from "vitest";
import { holdMailEngineOwner } from "./owner-lock";
import { MAIL_ENGINE_OWNER_LOCK } from "./tab-channel";

afterEach(() => vi.unstubAllGlobals());

it("queues a follower until the owner releases its database, then takes over", async () => {
  let queue = Promise.resolve();
  const request = vi.fn((_name, _options, hold) => {
    const run = queue.then(hold);
    queue = run.catch(() => undefined);
    return run;
  });
  vi.stubGlobal("navigator", { locks: { request } });
  const first = new AbortController();
  const second = new AbortController();
  let releaseDatabase!: () => void;
  const closing = new Promise<void>((resolve) => {
    releaseDatabase = resolve;
  });
  const close = vi.fn(() => closing);
  const startOwner = vi.fn(async () => {});
  const startFollower = vi.fn(async () => {});
  const owner = holdMailEngineOwner({
    signal: first.signal,
    start: startOwner,
    close,
  });
  const follower = holdMailEngineOwner({
    signal: second.signal,
    start: startFollower,
    close: async () => {},
  });
  await vi.waitFor(() => expect(startOwner).toHaveBeenCalledOnce());
  expect(startFollower).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledWith(
    MAIL_ENGINE_OWNER_LOCK,
    { signal: second.signal },
    expect.any(Function),
  );
  first.abort();
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(startFollower).not.toHaveBeenCalled();
  releaseDatabase();
  await owner;
  await vi.waitFor(() => expect(startFollower).toHaveBeenCalledOnce());
  second.abort();
  await follower;
});
