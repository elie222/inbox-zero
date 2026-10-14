import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import prisma from "@/utils/prisma";
import { readCorpusLines } from "@/utils/spam/import-stream";

const modulus = BigInt(1) << BigInt(256);
function fingerprint(parts: unknown[]) {
  return BigInt(
    `0x${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`,
  );
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
async function main() {
  const { values } = parseArgs({
    options: { source: { type: "string" }, "user-id": { type: "string" } },
  });
  if (!values.source || !values["user-id"])
    throw new Error("Use --source PRIVATE_BUNDLE --user-id OWNER_ID");
  const model = await prisma.spamModel.findUniqueOrThrow({
    where: { userId: values["user-id"] },
  });
  if (model.revision !== 0)
    throw new Error(
      "Model has new training; baseline verification must precede activation",
    );
  let sourceWords = BigInt(0),
    storedWords = BigInt(0),
    sourceMessages = BigInt(0),
    storedMessages = BigInt(0);
  let wordCount = 0,
    messageCount = 0;
  for await (const line of readCorpusLines(
    resolve(values.source, "words.jsonl"),
  )) {
    const row = JSON.parse(line);
    sourceWords =
      (sourceWords +
        fingerprint([
          row.token,
          row.normalized,
          row.good,
          row.spam,
          row.probability,
          row.lastUsed,
        ])) %
      modulus;
    wordCount++;
  }
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.spamToken.findMany({
      where: { modelId: model.id, ...(cursor ? { hash: { gt: cursor } } : {}) },
      orderBy: { hash: "asc" },
      take: 5000,
    });
    if (!rows.length) break;
    for (const row of rows)
      storedWords =
        (storedWords +
          fingerprint([
            row.token,
            row.normalized,
            row.good,
            row.spam,
            row.originalProbability,
            row.originalLastUsed,
          ])) %
        modulus;
    cursor = rows[rows.length - 1].hash;
  }
  for await (const line of readCorpusLines(
    resolve(values.source, "messages.jsonl"),
  )) {
    const row = JSON.parse(line);
    sourceMessages =
      (sourceMessages +
        fingerprint([
          row.sourceId,
          row.label,
          canonical(row.sourceData),
          row.rawMessage,
        ])) %
      modulus;
    messageCount++;
  }
  let messageCursor = 0;
  for (;;) {
    const rows = await prisma.spamHistoricalMessage.findMany({
      where: { modelId: model.id, sourceId: { gt: messageCursor } },
      orderBy: { sourceId: "asc" },
      take: 200,
    });
    if (!rows.length) break;
    for (const row of rows)
      storedMessages =
        (storedMessages +
          fingerprint([
            row.sourceId,
            row.label,
            canonical(row.sourceData),
            row.rawMessage
              ? Buffer.from(row.rawMessage).toString("base64")
              : null,
          ])) %
        modulus;
    messageCursor = rows[rows.length - 1].sourceId;
  }
  if (sourceWords !== storedWords || sourceMessages !== storedMessages)
    throw new Error("Imported field fingerprints differ from source bundle");
  console.log(
    JSON.stringify(
      {
        verified: true,
        wordCount,
        messageCount,
        wordFields:
          "raw token, normalized token, counts, probability, last use",
        messageFields:
          "source ID, label, all metadata, full retained body bytes",
        method:
          "Order-independent sums of SHA-256 record fingerprints; baseline counts reconciled during import",
      },
      null,
      2,
    ),
  );
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Verification failed",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
