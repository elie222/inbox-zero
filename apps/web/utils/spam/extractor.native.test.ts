import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import language from "./fixtures/language-segments.json";
import pdfs from "./fixtures/native-pdfs/expected.json";
import html from "./fixtures/html-tokens.json";
import { collectPdf } from "./media";
import { segmentText } from "./extractor";
import { SpamTokenizer } from "./tokenizer";
import { tokenizeWithLanguage } from "./native-tokenizer";
import { runIsolatedExtractor } from "./isolated-process";

describe.skipIf(
  process.platform !== "darwin" || process.env.RUN_NATIVE_SPAM_TESTS !== "true",
)("restricted native extraction", () => {
  const fixtures = join(import.meta.dirname, "fixtures");
  const probe = resolve(".native/spam-extractor-probe");
  let directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "spam-extraction-test-"));
    execFileSync(
      "/usr/bin/xcrun",
      ["swiftc", join(fixtures, "extractor-probe.swift"), "-o", probe],
      { timeout: 120_000 },
    );
  }, 125_000);
  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it.each(pdfs)("matches the complete PDF reference: $id", async ({
    id,
    tokens,
  }) => {
    const tokenizer = new SpamTokenizer();
    await collectPdf(
      await readFile(join(fixtures, "native-pdfs", `${id}.pdf`)),
      tokenizer,
    );
    expect(Object.fromEntries(tokenizer.tokens)).toEqual(tokens);
  });
  it("matches the saved Apple language layer, including leading BOMs", async () => {
    const result = await segmentText(language.map((row) => row.text));
    for (const row of language)
      expect(result.get(row.text), row.id).toEqual(row.expected);
  });
  it("runs the portable PDF fallback inside the same OS sandbox", async () => {
    const data = await readFile(
      join(fixtures, "native-pdfs/synthetic-four-pages.pdf"),
    );
    const result = await runIsolatedExtractor(
      process.execPath,
      [resolve("scripts/spam/portable-worker.mjs")],
      { operation: "pdf", data: data.toString("base64") },
    );
    expect(result).toMatchObject({
      backend: "portable-2",
      valid: true,
      pageCount: 4,
    });
  });
  it("matches full HTML feature dictionaries with native segmentation", async () => {
    for (const row of html) {
      const result = await tokenizeWithLanguage((tokens) =>
        tokens.html(row.html),
      );
      expect(Object.fromEntries(result.tokens), row.id).toEqual(row.expected);
    }
  });
  it("denies filesystem, network, credential and child-process access", async () => {
    const file = join(directory, "private-secret");
    await writeFile(file, "preserved");
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    try {
      process.env.SPAM_TEST_SECRET = "not-for-the-worker";
      const result = await runIsolatedExtractor(probe, [], {
        operation: "probe",
        file,
        port: typeof address === "object" && address ? address.port : 0,
      });
      expect(result).toEqual({
        readDenied: true,
        writeDenied: true,
        networkDenied: true,
        forkDenied: true,
        secretStripped: true,
      });
      expect(await readFile(file, "utf8")).toBe("preserved");
    } finally {
      delete process.env.SPAM_TEST_SECRET;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("terminates and reaps a stalled parser", async () => {
    await expect(
      runIsolatedExtractor(
        probe,
        [],
        { operation: "sleep" },
        { timeoutMs: 200 },
      ),
    ).rejects.toThrow("timed out");
  });
  it("terminates a parser that exceeds the output budget", async () => {
    await expect(
      runIsolatedExtractor(
        probe,
        [],
        { operation: "flood" },
        { outputBytes: 128 },
      ),
    ).rejects.toThrow("output exceeds");
  });
  it("terminates a parser that exceeds the memory budget", async () => {
    await expect(
      runIsolatedExtractor(probe, [], { operation: "sleep" }, { memoryKb: 1 }),
    ).rejects.toThrow("memory budget");
  });
});
