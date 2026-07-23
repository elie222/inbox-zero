import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ThunderbirdBridgeAction } from "@/utils/redis/thunderbird-actions";
import type { Logger } from "@/utils/logger";

export const thunderbirdTriageCategorySchema = z.enum([
  "newsletter",
  "receipt",
  "needs_attention",
  "junk",
  "keep",
]);

export type ThunderbirdTriageCategory = z.infer<
  typeof thunderbirdTriageCategorySchema
>;

const triageResultSchema = z.object({
  category: thunderbirdTriageCategorySchema,
  reason: z
    .string()
    .describe("One short sentence explaining the triage choice."),
});

type TriageMessageRef = {
  messageId: string;
  threadId: string;
  thunderbirdMessageId?: number;
  thunderbirdAccountId?: string;
};

/**
 * Structured triage for Thunderbird when rules did not propose actions.
 * Categories map to tag/archive/trash proposals the user still must Approve.
 */
export async function suggestThunderbirdTriage({
  emailAccount,
  subject,
  from,
  snippet,
  textPlain,
  messageRef,
  logger,
}: {
  emailAccount: EmailAccountWithAI;
  subject: string;
  from: string;
  snippet?: string;
  textPlain?: string;
  messageRef: TriageMessageRef;
  logger: Logger;
}): Promise<{
  category: ThunderbirdTriageCategory;
  reason: string;
  actions: ThunderbirdBridgeAction[];
}> {
  const bodyPreview = (textPlain || snippet || "").slice(0, 1200);

  const system = `You triage one inbound email for an Inbox Zero Thunderbird bridge.
Pick exactly one category. Prefer archive+tag for bulk/automated mail; trash only for clear junk/phishing; needs_attention when a real person is waiting; keep when unsure.`;

  const prompt = `<email>
<from>${from}</from>
<subject>${subject}</subject>
<body>${bodyPreview}</body>
</email>

<categories>
- newsletter: marketing, digests, product updates, mass mail I can archive
- receipt: invoices, order confirmations, shipping, payment notices I may search later
- needs_attention: a real person needs a decision, answer, or follow-up
- junk: phishing, scam, obvious spam worth trashing
- keep: leave in inbox when none of the above fits clearly
</categories>`;

  try {
    const modelOptions = getModelForUseCase(
      emailAccount.user,
      LlmUseCase.ThunderbirdTriage,
    );

    const generateObject = createGenerateObject({
      emailAccount,
      label: "Thunderbird triage",
      modelOptions,
      promptHardening: { trust: "untrusted", level: "compact" },
    });

    const aiResponse = await generateObject({
      ...modelOptions,
      system,
      prompt,
      schema: triageResultSchema,
    });

    const { category, reason } = aiResponse.object;
    return {
      category,
      reason,
      actions: buildThunderbirdTriageActions(category, messageRef),
    };
  } catch (error) {
    logger.warn("Thunderbird triage LLM failed; falling back to archive", {
      error,
    });
    return {
      category: "newsletter",
      reason:
        "Triage model unavailable. Suggested Archive + Mark read — use quick actions to Label/Delete if better.",
      actions: buildThunderbirdTriageActions("newsletter", messageRef),
    };
  }
}

export function buildThunderbirdTriageActions(
  category: ThunderbirdTriageCategory,
  messageRef: TriageMessageRef,
): ThunderbirdBridgeAction[] {
  const base = {
    messageId: messageRef.messageId,
    thunderbirdMessageId: messageRef.thunderbirdMessageId,
    thunderbirdAccountId: messageRef.thunderbirdAccountId,
  };

  if (category === "keep") {
    return [];
  }

  if (category === "junk") {
    return [
      {
        type: "trash" as const,
        id: randomUUID(),
        ...base,
        threadId: messageRef.threadId,
      },
    ];
  }

  if (category === "needs_attention") {
    return [
      {
        type: "label" as const,
        id: randomUUID(),
        ...base,
        labelName: "needs-attention",
      },
      {
        type: "mark_read" as const,
        id: randomUUID(),
        ...base,
        threadId: messageRef.threadId,
        read: true,
      },
    ];
  }

  const labelName = category === "receipt" ? "receipt" : "newsletter";
  return [
    {
      type: "label" as const,
      id: randomUUID(),
      ...base,
      labelName,
    },
    {
      type: "archive" as const,
      id: randomUUID(),
      ...base,
      threadId: messageRef.threadId,
    },
    {
      type: "mark_read" as const,
      id: randomUUID(),
      ...base,
      threadId: messageRef.threadId,
      read: true,
    },
  ];
}
