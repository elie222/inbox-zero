import { readCorpusLines } from "@/utils/spam/import-stream";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { tokenHash, lookupToken } from "@/utils/spam/identity";
import { TOKENIZER_VERSION } from "@/utils/spam/tokenizer";

const nonnegative = z.number().int().nonnegative();
const manifestSchema = z.object({
  version: z.literal(1),
  totals: z.object({
    good: nonnegative,
    spam: nonnegative,
    words: nonnegative,
    messages: nonnegative,
    goodOccurrences: nonnegative,
    spamOccurrences: nonnegative,
    bodies: nonnegative,
  }),
  files: z.object({ "words.jsonl": z.string(), "messages.jsonl": z.string() }),
  sourceDigests: z.record(z.string(), z.string()),
});
const wordSchema = z.object({
  token: z.string().min(1),
  normalized: z.string(),
  good: nonnegative,
  spam: nonnegative,
  probability: z.number().min(0).max(1),
  lastUsed: z.number().nullable(),
});
const messageSchema = z.object({
  sourceId: nonnegative,
  label: z.enum(["good", "spam"]),
  sourceData: z.record(z.string(), z.json()),
  rawMessage: z.string().nullable(),
});

async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: "string" },
      "user-id": { type: "string" },
      bias: { type: "string", default: "0" },
    },
  });
  if (!values.source || !values["user-id"])
    throw new Error(
      "Use --source PRIVATE_BUNDLE_DIRECTORY --user-id OWNER_ID [--bias NUMBER]",
    );
  const root = resolve(values.source);
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8")),
  );
  const digest = tokenHash(JSON.stringify(manifest));
  const owner = await prisma.user.findUnique({
    where: { id: values["user-id"] },
    select: { id: true },
  });
  if (!owner) throw new Error("Unknown model owner");
  const bias = Number(values.bias);
  if (!Number.isFinite(bias) || Math.abs(bias) > 1)
    throw new Error("Bias must be between -1 and 1");
  for (const name of ["words.jsonl", "messages.jsonl"] as const) {
    const hash = createHash("sha256");
    for await (const block of createReadStream(resolve(root, name)))
      hash.update(block);
    if (hash.digest("hex") !== manifest.files[name])
      throw new Error("Migration bundle digest mismatch");
  }
  let model = await prisma.spamModel.findUnique({
    where: { userId: owner.id },
  });
  if (model && model.sourceDigest !== digest)
    throw new Error("A different corpus is already staged for this owner");
  if (model?.status === "READY") {
    console.log("Corpus already imported and verified");
    return;
  }
  model ??= await prisma.spamModel.create({
    data: {
      userId: owner.id,
      sourceDigest: digest,
      sourceMetadata: manifest,
      goodMessages: manifest.totals.good,
      spamMessages: manifest.totals.spam,
      bias,
      tokenizerVersion: TOKENIZER_VERSION,
    },
  });
  let words: z.infer<typeof wordSchema>[] = [];
  async function flushWords() {
    await prisma.spamToken.createMany({
      data: words.map((row) => ({
        modelId: model!.id,
        hash: tokenHash(row.token),
        lookupHash: tokenHash(lookupToken(row.token)),
        token: row.token,
        normalized: row.normalized,
        good: row.good,
        spam: row.spam,
        originalProbability: row.probability,
        originalLastUsed: row.lastUsed,
      })),
      skipDuplicates: true,
    });
    words = [];
  }
  for await (const line of readCorpusLines(resolve(root, "words.jsonl"))) {
    words.push(wordSchema.parse(parseLine(line, "words")));
    if (words.length >= 1000) await flushWords();
  }
  if (words.length) await flushWords();
  for await (const line of readCorpusLines(resolve(root, "messages.jsonl"))) {
    const row = messageSchema.parse(parseLine(line, "messages"));
    await prisma.spamHistoricalMessage.upsert({
      where: {
        modelId_sourceId: { modelId: model.id, sourceId: row.sourceId },
      },
      create: {
        modelId: model.id,
        sourceId: row.sourceId,
        label: row.label,
        sourceData: row.sourceData,
        rawMessage: row.rawMessage
          ? Buffer.from(row.rawMessage, "base64")
          : null,
      },
      update: {},
    });
  }
  const [counts, messages, bodies, good, spam] = await Promise.all([
    prisma.spamToken.aggregate({
      where: { modelId: model.id },
      _count: true,
      _sum: { good: true, spam: true },
    }),
    prisma.spamHistoricalMessage.count({ where: { modelId: model.id } }),
    prisma.spamHistoricalMessage.count({
      where: { modelId: model.id, rawMessage: { not: null } },
    }),
    prisma.spamHistoricalMessage.count({
      where: { modelId: model.id, label: "good" },
    }),
    prisma.spamHistoricalMessage.count({
      where: { modelId: model.id, label: "spam" },
    }),
  ]);
  const totals = manifest.totals;
  if (
    counts._count !== totals.words ||
    counts._sum.good !== totals.goodOccurrences ||
    counts._sum.spam !== totals.spamOccurrences ||
    messages !== totals.messages ||
    bodies !== totals.bodies ||
    good !== totals.good ||
    spam !== totals.spam
  )
    throw new Error("Imported corpus does not reconcile; it remains inactive");
  await prisma.spamModel.update({
    where: { id: model.id },
    data: {
      status: "READY",
      importedWords: counts._count,
      importedMessages: messages,
    },
  });
  console.log(JSON.stringify({ status: "READY", ...totals, enabled: false }));
}
function parseLine(line: string, stage: string) {
  try {
    return JSON.parse(line);
  } catch {
    throw new Error(`Invalid ${stage} JSON record (length ${line.length})`);
  }
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Import failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
