import { describe, expect, it } from "vitest";
import { createQueryRegistry } from "./subscriptions";

describe("query subscriptions", () => {
  it.each([
    "success",
    "failure",
  ] as const)("ignores an older %s after a newer refresh has published", async (outcome) => {
    const registry = createQueryRegistry();
    const requests: Array<ReturnType<typeof deferredSnapshot>> = [];
    const handle = registry.observe("inbox", () => {
      const request = deferredSnapshot();
      requests.push(request);
      return request.promise;
    });
    const refresh = registry.refreshKey("inbox");
    requests[1].resolve({
      revision: { databaseEpoch: "db", sequence: 2 },
      data: "after archive",
    });
    await refresh;
    const current = handle.getSnapshot();
    if (outcome === "success") {
      requests[0].resolve({
        revision: { databaseEpoch: "db", sequence: 1 },
        data: "before archive",
      });
    } else {
      requests[0].reject(new Error("old query failed"));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(handle.getSnapshot()).toEqual(current);
    expect(current.data).toBe("after archive");
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
