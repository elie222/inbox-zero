import { describe, expect, it } from "vitest";
import { readRequestBytes } from "./request-body";

describe("readRequestBytes", () => {
  it("returns a body that matches its declared size", async () => {
    const bytes = await readRequestBytes(request([[1, 2], [3]], 3), 10);
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("rejects a declared size over the limit without reading", async () => {
    let pulled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled = true;
        controller.close();
      },
    });
    expect(await readRequestBytes(streamRequest(body, 11), 10)).toBeNull();
    expect(pulled).toBe(false);
  });

  it("stops reading a body that streams more than it declared", async () => {
    let chunksPulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksPulled++;
        controller.enqueue(new Uint8Array(4));
      },
    });
    expect(await readRequestBytes(streamRequest(body, 5), 10)).toBeNull();
    expect(chunksPulled).toBeLessThanOrEqual(3);
  });

  it("rejects a body shorter than declared", async () => {
    expect(await readRequestBytes(request([[1]], 3), 10)).toBeNull();
  });
});

function request(chunks: number[][], declared: number) {
  return streamRequest(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
        controller.close();
      },
    }),
    declared,
  );
}

function streamRequest(body: ReadableStream<Uint8Array>, declared: number) {
  return new Request("http://localhost/upload", {
    method: "POST",
    body,
    headers: { "content-length": String(declared) },
    duplex: "half",
  } as RequestInit);
}
