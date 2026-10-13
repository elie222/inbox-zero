import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { simpleParser } from "mailparser";
import prisma from "@/utils/prisma";
import { readCorpusLines } from "@/utils/spam/import-stream";
import { tokenizeMessage } from "@/utils/spam/tokenizer";
import { resolveSpamTokens } from "@/utils/spam/store";
import { scoreTokens, tokenProbability } from "@/utils/spam/scoring";
import type { ParsedMessage } from "@/utils/types";

async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: "string" },
      "user-id": { type: "string" },
      limit: { type: "string", default: "100" },
    },
  });
  if (!values.source || !values["user-id"])
    throw new Error(
      "Use --source PRIVATE_BUNDLE --user-id OWNER_ID [--limit PER_CLASS]",
    );
  const limit = Number(values.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2000)
    throw new Error("Limit must be 1..2000");
  const model = await prisma.spamModel.findUniqueOrThrow({
    where: { userId: values["user-id"] },
  });
  if (model.status !== "READY")
    throw new Error("Corpus import is not verified yet");
  const report = {
    scope:
      "Retained training examples, text/header extraction only; diagnostic resubstitution, not independent accuracy",
    good: { messages: 0, classifiedSpam: 0 },
    spam: { messages: 0, classifiedSpam: 0 },
    features: 0,
    matchedFeatures: 0,
    languageDifferences: 0,
  };
  for await (const line of readCorpusLines(
    resolve(values.source, "messages.jsonl"),
  )) {
    const row = JSON.parse(line) as {
      sourceId: number;
      label: "good" | "spam";
      rawMessage: string | null;
    };
    if (!row.rawMessage || report[row.label].messages >= limit) continue;
    const parsed = await simpleParser(Buffer.from(row.rawMessage, "base64"));
    const headers: Record<string, string> = {};
    for (const header of parsed.headerLines ?? []) {
      const value = header.line.replace(/^[^:]+:\s*/u, "");
      headers[header.key] = headers[header.key]
        ? `${headers[header.key]}\n${value}`
        : value;
    }
    const message: ParsedMessage = {
      id: String(row.sourceId),
      threadId: String(row.sourceId),
      historyId: "",
      date: parsed.date?.toISOString() ?? "",
      subject: parsed.subject ?? "",
      snippet: "",
      inline: [],
      headers: {
        ...headers,
        from: headers.from ?? "",
        to: headers.to ?? "",
        subject: headers.subject ?? "",
        date: headers.date ?? "",
      },
      textHtml: typeof parsed.html === "string" ? parsed.html : undefined,
      textPlain: parsed.text ?? undefined,
    };
    const features = tokenizeMessage(message);
    const resolved = await resolveSpamTokens(model.id, features.tokens);
    const result = scoreTokens(
      resolved.map((word) => ({
        token: word.token,
        occurrences: word.occurrences,
        probability: tokenProbability(word, {
          good: model.goodMessages,
          spam: model.spamMessages,
          bias: model.bias,
        }),
      })),
    );
    report[row.label].messages++;
    if (result.score >= model.threshold) report[row.label].classifiedSpam++;
    report.features += resolved.length;
    report.matchedFeatures += resolved.filter(
      (word) => word.good + word.spam > 0,
    ).length;
    if (features.warnings.size) report.languageDifferences++;
    if (report.good.messages >= limit && report.spam.messages >= limit) break;
  }
  console.log(JSON.stringify(report, null, 2));
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Evaluation failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
