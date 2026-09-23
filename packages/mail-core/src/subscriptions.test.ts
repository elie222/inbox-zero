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

  it("does not notify listeners when a later revision returns the same data", async () => {
    const registry = createQueryRegistry();
    let sequence = 0;
    const handle = registry.observe("inbox", async () => ({
      revision: { databaseEpoch: "db", sequence: ++sequence },
      data: { conversations: ["c1"] },
    }));
    await waitFor(() => handle.getSnapshot().status === "ready");
    let notifications = 0;
    handle.subscribe(() => {
      notifications += 1;
    });
    await registry.refreshAll();
    expect(notifications).toBe(0);

    const joined = registry.observe("inbox", async () => ({
      revision: { databaseEpoch: "db", sequence: ++sequence },
      data: { conversations: ["c1"] },
    }));
    await waitFor(() => joined.getSnapshot().status === "ready");
    expect(joined.getSnapshot().data).toEqual({ conversations: ["c1"] });
    expect(notifications).toBe(0);
    registry.closeAll();
  });

  it("starts a joining observer from the group's ready snapshot and keeps it live", async () => {
    const registry = createQueryRegistry();
    const requests: Array<ReturnType<typeof deferredSnapshot>> = [];
    const load = () => {
      const request = deferredSnapshot();
      requests.push(request);
      return request.promise;
    };
    const first = registry.observe("conversation", load);
    requests[0].resolve({
      revision: { databaseEpoch: "db", sequence: 1 },
      data: "warm",
    });
    await waitFor(() => first.getSnapshot().status === "ready");

    const joined = registry.observe("conversation", load);
    expect(joined.getSnapshot()).toMatchObject({
      status: "ready",
      data: "warm",
    });

    await waitFor(() => requests.length === 2);
    requests[1].resolve({
      revision: { databaseEpoch: "db", sequence: 2 },
      data: "updated",
    });
    await waitFor(() => joined.getSnapshot().data === "updated");
    expect(first.getSnapshot().data).toBe("updated");
    registry.closeAll();
  });

  it("starts a new observer loading once the group has been released", async () => {
    const registry = createQueryRegistry();
    const first = registry.observe("conversation", async () => ({
      revision: { databaseEpoch: "db", sequence: 1 },
      data: "warm",
    }));
    await waitFor(() => first.getSnapshot().status === "ready");
    first.close();

    const next = registry.observe("conversation", async () => ({
      revision: { databaseEpoch: "db", sequence: 1 },
      data: "warm",
    }));
    expect(next.getSnapshot().status).toBe("loading");
    registry.closeAll();
  });

  it("starts a new observer loading rather than in error after a failed refresh", async () => {
    const registry = createQueryRegistry();
    let fail = false;
    const load = async () => {
      if (fail) throw new Error("unavailable");
      return { revision: { databaseEpoch: "db", sequence: 1 }, data: "warm" };
    };
    const first = registry.observe("conversation", load);
    await waitFor(() => first.getSnapshot().status === "ready");
    fail = true;
    await registry.refreshAll();
    expect(first.getSnapshot().status).toBe("error");

    const next = registry.observe("conversation", load);
    expect(next.getSnapshot().status).toBe("loading");
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
