export const COMPLETE_THREAD_MESSAGE_LIMIT = 1000;
const COMPLETE_THREAD_BYTES = 32 * 1024 * 1024;

export function createCompleteThreadBudget() {
  return { remainingBytes: COMPLETE_THREAD_BYTES, remainingPages: 100 };
}

export async function readCompleteThreadJson<T>(
  source: ReadableStream<Uint8Array>,
  budget: ReturnType<typeof createCompleteThreadBudget>,
  signal?: AbortSignal,
): Promise<T> {
  if (budget.remainingPages-- <= 0) {
    await source.cancel();
    throw new Error("Conversation exceeds the offline snapshot page limit");
  }
  const reader = source
    .pipeThrough(new TransformStream<Uint8Array, Uint8Array>(), { signal })
    .getReader();
  const chunks: Uint8Array[] = [];
  let buffer = new Uint8Array(64 * 1024);
  let offset = 0;
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      if (value.byteLength > budget.remainingBytes)
        throw new Error("Conversation exceeds the offline snapshot byte limit");
      budget.remainingBytes -= value.byteLength;
      total += value.byteLength;
      let index = 0;
      while (index < value.byteLength) {
        const size = Math.min(
          buffer.byteLength - offset,
          value.byteLength - index,
        );
        buffer.set(value.subarray(index, index + size), offset);
        index += size;
        offset += size;
        if (offset === buffer.byteLength) {
          chunks.push(buffer);
          buffer = new Uint8Array(64 * 1024);
          offset = 0;
        }
      }
    }
    if (offset) chunks.push(buffer.subarray(0, offset));
    const bytes = new Uint8Array(total);
    let written = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, written);
      written += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
