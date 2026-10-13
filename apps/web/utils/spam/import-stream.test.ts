import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readCorpusLines } from "./import-stream";

it("preserves Unicode line separators inside raw token identities", async () => {
  const directory = await mkdtemp(join(tmpdir(), "spam-import-"));
  try {
    const records = [
      { token: "before\u2028after" },
      { token: "before\u2029after" },
      { token: "\r\n" },
    ];
    const file = join(directory, "records.jsonl");
    await writeFile(file, records.map((x) => JSON.stringify(x)).join("\n"));
    const read = [];
    for await (const line of readCorpusLines(file)) read.push(JSON.parse(line));
    expect(read).toEqual(records);
  } finally {
    await rm(directory, { recursive: true });
  }
});
