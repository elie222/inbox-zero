import { createReadStream } from "node:fs";

// Node's readline also splits U+2028/U+2029, which are valid inside JSON strings.
export async function* readCorpusLines(path: string) {
  let pending = "";
  for await (const block of createReadStream(path, { encoding: "utf8" })) {
    pending += block;
    let start = 0;
    for (
      let end = pending.indexOf("\n", start);
      end >= 0;
      end = pending.indexOf("\n", start)
    ) {
      const line = pending.slice(start, end);
      start = end + 1;
      if (line.length > 64 * 1024 * 1024)
        throw new Error("Migration record exceeds size limit");
      if (line.trim()) yield line;
    }
    pending = pending.slice(start);
    if (pending.length > 64 * 1024 * 1024)
      throw new Error("Migration record exceeds size limit");
  }
  if (pending.trim()) yield pending;
}
