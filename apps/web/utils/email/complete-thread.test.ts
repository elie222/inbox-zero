import { expect, it } from "vitest";
import { readCompleteThreadJson } from "./complete-thread";
it("shares a byte budget across pages and cancels an oversized response", async () => {
  const budget = { remainingBytes: 20, remainingPages: 3 };
  await expect(
    readCompleteThreadJson(new Response('{"value":[]}').body!, budget),
  ).resolves.toEqual({ value: [] });
  let canceled = false;
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"value":["too large"]}'));
    },
    cancel() {
      canceled = true;
    },
  });
  await expect(readCompleteThreadJson(source, budget)).rejects.toThrow(
    "byte limit",
  );
  expect(canceled).toBe(true);
});
it("cannot claim a completed snapshot after its page budget is exhausted", async () => {
  await expect(
    readCompleteThreadJson(new Response("{}").body!, {
      remainingBytes: 100,
      remainingPages: 0,
    }),
  ).rejects.toThrow("page limit");
});
it("cancels a stalled provider response when the caller aborts", async () => {
  let canceled = false;
  const controller = new AbortController();
  const source = new ReadableStream<Uint8Array>({
    cancel() {
      canceled = true;
    },
  });
  const result = readCompleteThreadJson(
    source,
    { remainingBytes: 100, remainingPages: 3 },
    controller.signal,
  );
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await rejected;
  expect(canceled).toBe(true);
});
