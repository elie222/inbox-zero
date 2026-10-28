import { expect, it } from "vitest";
import { decodeGmailAttachmentStream } from "./attachment-stream";

it("decodes escaped JSON and base64url across every small chunk boundary", async () => {
  const bytes = Uint8Array.from({ length: 1025 }, (_, i) => i % 256);
  const json = JSON.stringify({
    ignored: "not attachment",
    data: Buffer.from(bytes).toString("base64url"),
    size: bytes.length,
  }).replace('"data"', '"d\\u0061ta"');
  const stream = source(
    [...json].map((char) => new TextEncoder().encode(char)),
  );
  expect(
    Buffer.from(
      await new Response(decodeGmailAttachmentStream(stream)).arrayBuffer(),
    ),
  ).toEqual(Buffer.from(bytes));
});
it("yields binary bytes before the response finishes and cancels upstream while stalled", async () => {
  const controller = new AbortController();
  let canceled = false;
  const raw = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(`{"data":"${"YWJj".repeat(256)}`));
    },
    cancel() {
      canceled = true;
    },
  });
  const reader = decodeGmailAttachmentStream(
    raw,
    controller.signal,
  ).getReader();
  expect((await reader.read()).value?.length).toBeGreaterThan(0);
  controller.abort();
  await expect.poll(() => canceled).toBe(true);
  await expect(reader.read()).rejects.toMatchObject({ name: "AbortError" });
});
it("applies downstream backpressure instead of reading the whole source", async () => {
  let reads = 0;
  let canceled = false;
  const raw = new ReadableStream<Uint8Array>({
    pull(c) {
      reads++;
      c.enqueue(
        new TextEncoder().encode(
          reads === 1 ? '{"data":"' : "YWJj".repeat(4096),
        ),
      );
    },
    cancel() {
      canceled = true;
    },
  });
  const reader = decodeGmailAttachmentStream(raw).getReader();
  await reader.read();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(reads).toBeLessThan(8);
  await reader.cancel();
  await expect.poll(() => canceled).toBe(true);
});
it.each([
  '{"data":"a"}',
  '{"data":"a$=="}',
  '{"size":3}',
  '{"data":"YWJj"',
  '{"data":5}',
  '{"data":"YQ==","data":"Yg=="}',
])("rejects malformed or absent attachment data: %s", async (json) => {
  await expect(
    new Response(
      decodeGmailAttachmentStream(source([new TextEncoder().encode(json)])),
    ).arrayBuffer(),
  ).rejects.toThrow();
});
it("accepts empty and padded attachment payloads", async () => {
  for (const encoded of ["", "YQ==", "YWI=", "YWJj"]) {
    const output = await new Response(
      decodeGmailAttachmentStream(
        source([new TextEncoder().encode(JSON.stringify({ data: encoded }))]),
      ),
    ).arrayBuffer();
    expect(Buffer.from(output)).toEqual(Buffer.from(encoded, "base64url"));
  }
});
function source(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
  });
}
