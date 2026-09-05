import { describe, expect, test } from "vitest";
import { shardPlaywrightTargets } from "./emulated-suite-sharding.mjs";

describe("Playwright target sharding", () => {
  test("runs every target exactly once across isolated shards", () => {
    const targets = Array.from({ length: 13 }, (_, id) => ({ id }));
    const shards = [1, 2, 3, 4].map((index) =>
      shardPlaywrightTargets(targets, `${index}/4`),
    );
    expect(shards.map((shard) => shard.length)).toEqual([4, 3, 3, 3]);
    expect(shards.flat().sort((a, b) => a.id - b.id)).toEqual(targets);
    for (const shard of shards) {
      expect(shard.map(({ id }) => id)).toEqual(
        shard.map(({ id }) => id).sort((a, b) => a - b),
      );
    }
  });

  test("keeps unsharded local runs and empty shard assignments valid", () => {
    const targets = [{ id: "mail" }];
    expect(shardPlaywrightTargets(targets)).toEqual(targets);
    expect(shardPlaywrightTargets(targets, "4/4")).toEqual([]);
  });

  test.each([
    "0/4",
    "5/4",
    "1/0",
    "1",
    "x/4",
    "1/2.5",
  ])("rejects invalid shard %s instead of silently skipping tests", (shard) => {
    expect(() => shardPlaywrightTargets([], shard)).toThrow(/index\/count/);
  });
});
