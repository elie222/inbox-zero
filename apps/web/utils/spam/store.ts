import { Pool } from "pg";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import { env } from "@/env";
import { lookupToken, spamMessageKey, tokenHash } from "./identity";
import { TOKENIZER_VERSION } from "./tokenizer";
import type { ParsedMessage } from "@/utils/types";

const pool = new Pool({
  connectionString: env.PREVIEW_DATABASE_URL ?? env.DATABASE_URL,
  max: 4,
  connectionTimeoutMillis: 10_000,
  query_timeout: 20_000,
  idleTimeoutMillis: 10_000,
  allowExitOnIdle: true,
});

export async function enabledSpamModel(emailAccountId: string) {
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { userId: true, spamFilterEnabled: true },
  });
  if (!account?.spamFilterEnabled) return null;
  const model = await prisma.spamModel.findUnique({
    where: { userId: account.userId },
  });
  if (model?.status !== "READY") throw new Error("Spam model is not ready");
  return model;
}

export async function withSpamMessageLock<T>(
  emailAccountId: string,
  messageKey: string,
  action: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  const key = `spam:${emailAccountId}:${messageKey}`;
  let acquired = false;
  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
      [key],
    );
    acquired = result.rows[0].locked;
    if (!acquired)
      throw new Error(
        "Spam processing is already in progress; retry this message",
      );
    return await action();
  } finally {
    let destroy = false;
    if (acquired) {
      try {
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
          [key],
        );
      } catch {
        destroy = true;
      }
    }
    client.release(destroy);
  }
}

export async function resolveSpamTokens(
  modelId: string,
  tokens: Map<string, number>,
) {
  const hashes = [
    ...new Set(
      [...tokens.keys()].map((token) => tokenHash(lookupToken(token))),
    ),
  ];
  const rows = await prisma.spamToken.findMany({
    where: { modelId, lookupHash: { in: hashes } },
  });
  const byLookup = new Map<string, typeof rows>();
  for (const row of rows)
    byLookup.set(row.lookupHash, [
      ...(byLookup.get(row.lookupHash) ?? []),
      row,
    ]);
  const resolved = new Map<
    string,
    {
      token: string;
      hash: string;
      lookupHash: string;
      good: number;
      spam: number;
      occurrences: number;
    }
  >();
  for (const [token, occurrences] of tokens) {
    const hash = tokenHash(token);
    const lookupHash = tokenHash(lookupToken(token));
    const candidates = byLookup.get(lookupHash) ?? [];
    const row =
      candidates.find((item) => item.hash === hash) ??
      candidates
        .filter((item) => lookupToken(item.token) === lookupToken(token))
        .sort((a, b) => a.hash.localeCompare(b.hash))[0];
    const key = row?.hash ?? hash;
    const previous = resolved.get(key);
    resolved.set(key, {
      token: row?.token ?? token,
      hash: key,
      lookupHash,
      good: row?.good ?? 0,
      spam: row?.spam ?? 0,
      occurrences: occurrences + (previous?.occurrences ?? 0),
    });
  }
  return [...resolved.values()];
}

export async function applySpamTraining({
  emailAccountId,
  message,
  label,
  observedAt,
  tokens,
  tokenizerVersion = TOKENIZER_VERSION,
}: {
  emailAccountId: string;
  message: ParsedMessage;
  label: "good" | "spam";
  observedAt: Date;
  tokens: Map<string, number>;
  tokenizerVersion?: string;
}) {
  const messageKey = spamMessageKey(message);
  return withSpamMessageLock(emailAccountId, messageKey, async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const model = await enabledSpamModel(emailAccountId);
      if (!model) return false;
      const key = { emailAccountId, messageKey };
      const previous = await prisma.spamTraining.findUnique({
        where: { emailAccountId_messageKey: key },
      });
      if (previous && previous.observedAt >= observedAt) return false;
      if (previous?.label === label) {
        await prisma.spamTraining.update({
          where: { emailAccountId_messageKey: key },
          data: { observedAt },
        });
        return false;
      }
      const resolved = await resolveSpamTokens(model.id, tokens);
      const current = resolved.map((row) => ({
        token: row.token,
        hash: row.hash,
        lookup: row.lookupHash,
        normalized: row.token.toLowerCase(),
        good: label === "good" ? 1 : 0,
        spam: label === "spam" ? 1 : 0,
      }));
      const deltas = new Map(current.map((row) => [row.hash, row]));
      if (previous) {
        const old = previous.tokens as {
          token: string;
          hash: string;
          lookup: string;
          normalized: string;
        }[];
        for (const row of old) {
          const delta = deltas.get(row.hash) ?? { ...row, good: 0, spam: 0 };
          if (previous.label === "good") delta.good--;
          else delta.spam--;
          deltas.set(row.hash, delta);
        }
      }
      const changed = await prisma.$queryRaw<{ changed: bigint }[]>(Prisma.sql`
        WITH model AS (
          UPDATE "SpamModel" SET "revision"="revision"+1, "updatedAt"=NOW(),
            "goodMessages"="goodMessages"+${Number(label === "good") - Number(previous?.label === "good")},
            "spamMessages"="spamMessages"+${Number(label === "spam") - Number(previous?.label === "spam")}
          WHERE "id"=${model.id} AND "revision"=${model.revision} AND "status"='READY' RETURNING "id"
        ), deltas AS (
          SELECT * FROM jsonb_to_recordset(${JSON.stringify([...deltas.values()])}::jsonb)
            AS d(hash text,token text,lookup text,normalized text,good integer,spam integer)
        ), adjusted AS (
          UPDATE "SpamToken" w SET "good"=w."good"+d.good, "spam"=w."spam"+d.spam
          FROM deltas d WHERE w."modelId"=${model.id} AND w."hash"=d.hash
            AND EXISTS(SELECT 1 FROM model) RETURNING w."hash"
        ), inserted AS (
          INSERT INTO "SpamToken" ("modelId","hash","token","lookupHash","normalized","good","spam")
          SELECT ${model.id},d.hash,d.token,d.lookup,d.normalized,d.good,d.spam FROM deltas d
          WHERE EXISTS(SELECT 1 FROM model)
            AND NOT EXISTS(SELECT 1 FROM "SpamToken" w WHERE w."modelId"=${model.id} AND w."hash"=d.hash)
        ), learned AS (
          INSERT INTO "SpamTraining" ("emailAccountId","messageKey","modelId","label","tokens","tokenizerVersion","observedAt")
          SELECT ${emailAccountId},${messageKey},${model.id},${label},${JSON.stringify(current)}::jsonb,${tokenizerVersion},${observedAt}
          WHERE EXISTS(SELECT 1 FROM model)
          ON CONFLICT ("emailAccountId","messageKey") DO UPDATE SET "label"=EXCLUDED."label","tokens"=EXCLUDED."tokens","tokenizerVersion"=EXCLUDED."tokenizerVersion","observedAt"=EXCLUDED."observedAt"
        ) SELECT count(*) AS changed FROM model
      `);
      if (Number(changed[0].changed)) return true;
    }
    throw new Error("Spam model changed during training; retry the correction");
  });
}
