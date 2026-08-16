import { describe, expect, it, vi } from "vitest";
import { mapWithConcurrency } from "./async";

describe("mapWithConcurrency", () => {
  it("supports undefined array items", async () => {
    const run = vi.fn(async (item: string | undefined) => item ?? "missing");

    await expect(
      mapWithConcurrency([undefined, "value"], 2, run),
    ).resolves.toEqual(["missing", "value"]);
  });

  it.each([
    Number.NaN,
    0,
    -1,
    1.5,
  ])("rejects invalid concurrency %s", async (concurrency) => {
    await expect(
      mapWithConcurrency(["value"], concurrency, async (item) => item),
    ).rejects.toThrow("concurrency must be a positive integer");
  });
});
