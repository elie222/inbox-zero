import { createGenerateObject } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import { captureException } from "@/utils/error";
import { digestContentSchema, type DigestContent } from "./digest-schema";
import {
  DIGEST_SYSTEM_PROMPT,
  buildDigestPrompt,
  type Bucketed,
} from "./digest-prompt";

const logger = createScopedLogger("ai/digest/generate-digest-content");

export async function generateDigestContent({
  emailAccount,
  todayDate,
  bucketed,
}: {
  emailAccount: EmailAccountWithAI;
  todayDate: string;
  bucketed: Bucketed;
}): Promise<DigestContent> {
  const itemCount = Object.values(bucketed).reduce((n, b) => n + b.length, 0);
  const scoped = logger.with({
    emailAccountId: emailAccount.id,
    itemCount,
  });
  const modelOptions = getModel(emailAccount.user, "default");

  const generateObject = createGenerateObject({
    emailAccount,
    label: "digest-batch-content",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "full" },
  });

  scoped.info("digest.generate.start", { model: modelOptions.modelName });

  try {
    const aiResponse = await generateObject({
      ...modelOptions,
      system: DIGEST_SYSTEM_PROMPT,
      prompt: buildDigestPrompt({ todayDate, bucketed }),
      schema: digestContentSchema,
    });
    scoped.info("digest.generate.success");
    return aiResponse.object;
  } catch (err) {
    scoped.error("digest.generate.failure", {
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err);
    throw err;
  }
}
