import { Readable } from "node:stream";
import { del, get, put } from "@vercel/blob";
import { createObjectBlobStore } from "./object-store";

export function createVercelBlobUploadStore(token?: string) {
  return createObjectBlobStore({
    async put(key, bytes) {
      const body = Readable.from(bytes, { objectMode: false });
      try {
        await put(key, body, {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/octet-stream",
          token,
          abortSignal: AbortSignal.timeout(60_000),
        });
      } finally {
        body.destroy();
      }
    },
    async read(key) {
      const response = await get(key, {
        access: "private",
        useCache: false,
        token,
        abortSignal: AbortSignal.timeout(60_000),
      });
      if (!response) return null;
      if (response.statusCode !== 200)
        throw new Error("Unexpected private blob response");
      return (async function* () {
        const reader = response.stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) return;
            yield value;
          }
        } finally {
          await reader.cancel();
          reader.releaseLock();
        }
      })();
    },
    async delete(key) {
      await del(key, { token, abortSignal: AbortSignal.timeout(10_000) });
    },
  });
}
