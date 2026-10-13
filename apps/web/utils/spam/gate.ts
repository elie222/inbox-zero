import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import {
  enabledSpamModel,
  resolveSpamTokens,
  withSpamMessageLock,
} from "./store";
import { spamMessageKey } from "./identity";
import { extractSpamFeatures } from "./media";
import { scoreTokens, tokenProbability } from "./scoring";
import { TOKENIZER_VERSION } from "./tokenizer";

export async function filterSpam({
  emailAccountId,
  message,
  provider,
  isTest = false,
}: {
  emailAccountId: string;
  message: ParsedMessage;
  provider: EmailProvider;
  isTest?: boolean;
}) {
  const model = await enabledSpamModel(emailAccountId);
  if (
    !model ||
    provider.isSentMessage(message) ||
    message.labelIds?.includes("DRAFT")
  )
    return null;
  const messageKey = spamMessageKey(message);
  return withSpamMessageLock(emailAccountId, messageKey, async () => {
    const where = { emailAccountId_messageKey: { emailAccountId, messageKey } };
    const correction = await prisma.spamTraining.findUnique({ where });
    if (correction?.label === "good")
      return { spam: false, score: 0, corrected: true };
    const existing = await prisma.spamDecision.findUnique({ where });
    if (
      existing &&
      !isTest &&
      !(correction?.label === "spam" && existing.verdict !== "spam")
    ) {
      if (existing.verdict === "spam" && !existing.movedAt) {
        await moveToJunk(
          emailAccountId,
          messageKey,
          message,
          provider,
          existing.moveStartedAt,
        );
      }
      return {
        spam: existing.verdict === "spam",
        score: existing.score,
        corrected: false,
      };
    }
    const features = await extractSpamFeatures(message, provider);
    const words = await resolveSpamTokens(model.id, features.tokens);
    const scored = scoreTokens(
      words.map((word) => ({
        token: word.token,
        occurrences: word.occurrences,
        probability: tokenProbability(word, {
          good: model.goodMessages,
          spam: model.spamMessages,
          bias: model.bias,
        }),
      })),
    );
    const spam =
      correction?.label === "spam" || scored.score >= model.threshold;
    if (!isTest) {
      const decision = await prisma.spamDecision.upsert({
        where,
        create: {
          emailAccountId,
          messageKey,
          modelId: model.id,
          modelRevision: model.revision,
          tokenizerVersion: features.version ?? TOKENIZER_VERSION,
          score: scored.score,
          verdict: spam ? "spam" : "good",
          evidence: scored.selected,
          warnings: [...features.warnings],
        },
        update: {
          tokenizerVersion: features.version ?? TOKENIZER_VERSION,
          score: scored.score,
          verdict: spam ? "spam" : "good",
          modelRevision: model.revision,
          evidence: scored.selected,
          warnings: [...features.warnings],
        },
      });
      if (spam && !decision.movedAt) {
        await moveToJunk(
          emailAccountId,
          messageKey,
          message,
          provider,
          decision.moveStartedAt,
        );
      }
    }
    return { spam, score: scored.score, corrected: Boolean(correction) };
  });
}

async function moveToJunk(
  emailAccountId: string,
  messageKey: string,
  message: ParsedMessage,
  provider: EmailProvider,
  startedAt: Date | null,
) {
  const where = { emailAccountId_messageKey: { emailAccountId, messageKey } };
  if (startedAt) {
    const current = await provider
      .getMessage(message.id)
      .catch(async (error) => {
        const id = message.headers["message-id"];
        const relocated = id
          ? await provider.getMessageByRfc822MessageId(id)
          : null;
        if (relocated) return relocated;
        throw error;
      });
    // A lost acknowledgement must not turn a later manual rescue into another Junk move.
    if (!current.labelIds?.includes("SPAM"))
      throw new Error(
        "Spam move outcome is uncertain; review the message before retrying",
      );
  } else {
    await prisma.spamDecision.update({
      where,
      data: { moveStartedAt: new Date() },
    });
    await provider.markMessageSpam(message.id);
  }
  await prisma.spamDecision.update({ where, data: { movedAt: new Date() } });
}
