import { describe, expect, it, vi } from "vitest";
import {
  applyThreadLabelsInBatches,
  MAX_LABEL_THREADS_PER_ACTION,
} from "./apply-thread-labels";

describe("batched manual labels", () => {
  const targets = Array.from(
    { length: MAX_LABEL_THREADS_PER_ACTION * 2 + 1 },
    (_, i) => `thread-${i}`,
  );
  it("splits large selections and keeps per-conversation failures", async () => {
    const applyBatch = vi.fn(async (threadIds: string[]) => ({
      succeededThreadIds: threadIds.slice(1),
      failedThreadIds: threadIds.slice(0, 1),
    }));
    const result = await applyThreadLabelsInBatches({
      threadIds: [...targets, targets[0]],
      applyBatch,
    });
    expect(applyBatch.mock.calls.map(([ids]) => ids.length)).toEqual([
      25, 25, 1,
    ]);
    expect(result.failedThreadIds).toEqual([
      targets[0],
      targets[25],
      targets[50],
    ]);
    expect(result.succeededThreadIds).toHaveLength(48);
    expect(result.error).toBeUndefined();
  });
  it("retains failed and unattempted conversations after a request fails", async () => {
    const error = new Error("Connection interrupted");
    const applyBatch = vi
      .fn()
      .mockResolvedValueOnce({
        succeededThreadIds: targets.slice(1, 25),
        failedThreadIds: [targets[0]],
      })
      .mockRejectedValueOnce(error);
    const result = await applyThreadLabelsInBatches({
      threadIds: targets,
      applyBatch,
    });
    expect(applyBatch).toHaveBeenCalledTimes(2);
    expect(result.succeededThreadIds).toEqual(targets.slice(1, 25));
    expect(result.failedThreadIds).toEqual([targets[0], ...targets.slice(25)]);
    expect(result.error).toBe(error);
  });
});
