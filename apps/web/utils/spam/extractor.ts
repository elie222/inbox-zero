import { join } from "node:path";
import { release } from "node:os";
import { z } from "zod";
import { runIsolatedExtractor } from "./isolated-process";

const envelope = {
  version: z.literal(1),
  backend: z.enum(["apple-1", "portable-2"]),
  osVersion: z.string().max(256),
};
const pdfSchema = z.object({
  ...envelope,
  valid: z.boolean(),
  pageCount: z.number().int().min(0).max(200).optional(),
  attributes: z
    .array(z.string().max(4 * 1024 * 1024))
    .max(100)
    .optional(),
  pages: z
    .array(z.string().max(4 * 1024 * 1024))
    .max(200)
    .optional(),
  thumbnails: z
    .array(
      z.object({
        data: z.string().max(16 * 1024 * 1024),
        hasAlpha: z.boolean(),
      }),
    )
    .max(3)
    .optional(),
});
export function extractorVersion() {
  return process.platform === "darwin" ? `apple-1:${release()}` : "portable-2";
}

export async function extractPdf(data: Buffer) {
  if (data.length > 25 * 1024 * 1024)
    throw new Error("PDF exceeds spam inspection byte limit");
  const result = pdfSchema.parse(
    await run({ operation: "pdf", data: data.toString("base64") }),
  );
  if (
    result.valid &&
    (result.pageCount === undefined ||
      result.pages?.length !== result.pageCount ||
      !result.attributes ||
      !result.thumbnails)
  )
    throw new Error("Incomplete PDF extraction response");
  return result;
}

export async function segmentText(texts: string[]) {
  if (
    texts.length > 4096 ||
    texts.reduce((sum, text) => sum + Buffer.byteLength(text), 0) >
      4 * 1024 * 1024
  )
    throw new Error("Message exceeds language segmentation limit");
  if (!texts.length) return new Map<string, string[]>();
  const schema = z.object({
    ...envelope,
    segments: z
      .array(z.object({ tokens: z.array(z.string()).max(50_000) }))
      .length(texts.length),
  });
  const result = schema.parse(
    await run({
      operation: "segment",
      texts: texts.map((text) => Buffer.from(text).toString("base64")),
    }),
  );
  return new Map(
    texts.map((text, index) => [text, result.segments[index].tokens]),
  );
}

async function run(request: unknown) {
  if (process.platform === "darwin")
    return runIsolatedExtractor(
      join(process.cwd(), ".native/spam-extractor"),
      [],
      request,
    );
  return runIsolatedExtractor(
    process.execPath,
    [join(process.cwd(), "scripts/spam/portable-worker.mjs")],
    request,
  );
}
