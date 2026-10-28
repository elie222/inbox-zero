import type { gmail_v1 } from "@googleapis/gmail";
import { afterEach, expect, it, vi } from "vitest";
import { sendDraft } from "./draft";

afterEach(() => vi.useRealTimers());

it("preserves an ambiguous draft send failure instead of retrying a consumed draft", async () => {
  vi.useFakeTimers();
  const failure = Object.assign(new Error("Service unavailable"), {
    code: 503,
  });
  const send = vi
    .fn()
    .mockRejectedValueOnce(failure)
    .mockRejectedValue(
      Object.assign(new Error("Draft not found"), { code: 404 }),
    );
  const gmail = { users: { drafts: { send } } } as unknown as gmail_v1.Gmail;
  const result = sendDraft(gmail, "r-123").catch((error: unknown) => error);
  await vi.runAllTimersAsync();
  expect(await result).toBe(failure);
  expect(send).toHaveBeenCalledOnce();
});
