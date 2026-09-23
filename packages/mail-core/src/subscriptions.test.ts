import { describe, expect, it } from "vitest";
import { createQueryRegistry } from "./subscriptions";

describe("query subscriptions", () => {
  it("publishes a later refresh and ignores a stale in-flight result", async () => {
    const registry = createQueryRegistry();
    const requests: Array<ReturnType<typeof deferredSnapshot>> = [];
    const handle = registry.observe("inbox", () => {
      const request = deferredSnapshot();
      requests.push(request);
      return request.promise;
    });
    await Promise.resolve();
    expect(requests).toHaveLength(1);
    const refresh = registry.refreshKey("inbox");
    requests[0].resolve({
      revision: { databaseEpoch: "db", sequence: 1 },
      data: "first",
    });
    await waitFor(() => requests.length === 2);
    requests[1].resolve({
      revision: { databaseEpoch: "db", sequence: 2 },
      data: "after archive",
    });
    await refresh;
    expect(handle.getSnapshot().data).toBe("after archive");
    registry.closeAll();
  });

  it("coalesces overlapping refreshes into one follow-up load", async () => {
    const registry = createQueryRegistry();
    const requests: Array<ReturnType<typeof deferredSnapshot>> = [];
    const handle = registry.observe("inbox", () => {
      const request = deferredSnapshot();
      requests.push(request);
      return request.promise;
    });
    await Promise.resolve();
    const first = registry.refreshKey("inbox");
    const second = registry.refreshKey("inbox");
    expect(requests).toHaveLength(1);
    requests[0].resolve({
      revision: { databaseEpoch: "db", sequence: 1 },
      data: "first",
    });
    await waitFor(() => requests.length === 2);
    requests[1].resolve({
      revision: { databaseEpoch: "db", sequence: 2 },
      data: "second",
    });
    await first;
    await second;
    expect(requests).toHaveLength(2);
    expect(handle.getSnapshot().data).toBe("second");
    registry.closeAll();
  });

  it("does not notify listeners when a refresh returns the same revision", async () => {
    const registry = createQueryRegistry();
    const requests: Array<ReturnType<typeof deferredSnapshot>> = [];
    const handle = registry.observe("inbox", () => {
      const request = deferredSnapshot();
      requests.push(request);
      return request.promise;
    });
    requests[0].resolve({
      revision: { databaseEpoch: "db", sequence: 1 },
      data: "same",
    });
    await waitFor(() => handle.getSnapshot().status === "ready");
    let notifications = 0;
    handle.subscribe(() => {
      notifications += 1;
    });
    const refresh = registry.refreshKey("inbox");
    await waitFor(() => requests.length === 2);
    requests[1].resolve({
      revision: { databaseEpoch: "db", sequence: 1 },
      data: "same-object-identity-ignored",
    });
    await refresh;
    expect(notifications).toBe(0);
    expect(handle.getSnapshot().data).toBe("same");
    registry.closeAll();
  });
});

function deferredSnapshot() {
  type Result = {
    revision: { databaseEpoch: string; sequence: number };
    data: string;
  };
  let resolve!: (value: Result) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Result>((resolveResult, rejectResult) => {
    resolve = resolveResult;
    reject = rejectResult;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("timed out waiting for subscription state");
}
