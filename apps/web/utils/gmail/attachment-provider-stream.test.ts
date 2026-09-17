import { PassThrough } from "node:stream";
import type { gmail_v1 } from "@googleapis/gmail";
import { expect, it, vi } from "vitest";
import { getGmailAttachmentStream } from "./attachment";

it("asks the SDK for streaming authenticated JSON and destroys its response on abort", async () => {
  const input = new PassThrough();
  const get = vi.fn().mockResolvedValue({ data: input });
  const gmail = {
    users: { messages: { attachments: { get } } },
  } as unknown as gmail_v1.Gmail;
  const controller = new AbortController();
  const output = await getGmailAttachmentStream(
    gmail,
    "message",
    "file",
    controller.signal,
  );
  expect(get).toHaveBeenCalledWith(
    { userId: "me", messageId: "message", id: "file" },
    { responseType: "stream", signal: controller.signal },
  );
  input.write(`{"data":"${"YWJj".repeat(1024)}`);
  const reader = output.getReader();
  expect((await reader.read()).value!.length).toBeGreaterThan(0);
  controller.abort();
  await expect.poll(() => input.destroyed).toBe(true);
  expect(get).toHaveBeenCalledTimes(1);
});
it("fails a broken response without replaying any already streamed attachment bytes", async () => {
  const input = new PassThrough();
  const get = vi.fn().mockResolvedValue({ data: input });
  const gmail = {
    users: { messages: { attachments: { get } } },
  } as unknown as gmail_v1.Gmail;
  const output = await getGmailAttachmentStream(gmail, "message", "file");
  input.end('{"data":"YWJj');
  await expect(new Response(output).arrayBuffer()).rejects.toThrow();
  expect(get).toHaveBeenCalledTimes(1);
});
