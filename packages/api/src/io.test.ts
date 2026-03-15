import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readJsonInput } from "./io";

describe("readJsonInput", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("accepts JSON files with a UTF-8 BOM", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "inbox-zero-api-io-"));
    const filePath = join(tempDir, "rule.json");

    await writeFile(filePath, '\uFEFF{"name":"Rule"}');

    await expect(readJsonInput(filePath)).resolves.toEqual({ name: "Rule" });
  });
});
