import { z } from "zod";
import { getTinybird } from "./client";

const aiGenerationCountSchema = z.object({
  count: z.number(),
});

const adminAiModelSpendSchema = z.object({
  provider: z.string(),
  model: z.string(),
  cost: z.number(),
  calls: z.number().int(),
});

const adminAiUserModelSpendSchema = adminAiModelSpendSchema.extend({
  userId: z.string(),
});

const tb = getTinybird();

const getAiGenerationsByAccountsAndPeriod = tb
  ? tb.buildPipe({
      pipe: "ai_generations_by_accounts_and_period",
      parameters: z.object({
        emailAccountIdsCsv: z.string().min(1),
        startTimestampMs: z.number().int(),
        endTimestampMs: z.number().int(),
      }),
      data: aiGenerationCountSchema,
    })
  : null;

const getAdminAiModelSpendByPeriodPipe = tb
  ? tb.buildPipe({
      pipe: "admin_ai_model_spend_by_period",
      parameters: z.object({
        startTimestampMs: z.number().int(),
        endTimestampMs: z.number().int(),
        limit: z.number().int(),
      }),
      data: adminAiModelSpendSchema,
    })
  : null;

const getAdminAiUserModelSpendByPeriodPipe = tb
  ? tb.buildPipe({
      pipe: "admin_ai_user_model_spend_by_period",
      parameters: z.object({
        userIdsCsv: z.string().min(1),
        startTimestampMs: z.number().int(),
        endTimestampMs: z.number().int(),
        perUserLimit: z.number().int(),
      }),
      data: adminAiUserModelSpendSchema,
    })
  : null;

export async function getAiGenerationCountByEmailAccounts(options: {
  emailAccountIds: string[];
  startTimestampMs: number;
  endTimestampMs: number;
}): Promise<number> {
  const { emailAccountIds, startTimestampMs, endTimestampMs } = options;

  if (!getAiGenerationsByAccountsAndPeriod || emailAccountIds.length === 0) {
    return 0;
  }

  const result = await getAiGenerationsByAccountsAndPeriod({
    emailAccountIdsCsv: emailAccountIds.join(","),
    startTimestampMs,
    endTimestampMs,
  });

  return result.data.at(0)?.count ?? 0;
}

export async function getAdminAiModelSpendByPeriod(options: {
  startTimestampMs: number;
  endTimestampMs: number;
  limit: number;
}) {
  if (!getAdminAiModelSpendByPeriodPipe) return [];

  const result = await getAdminAiModelSpendByPeriodPipe(options);
  return result.data;
}

export async function getAdminAiUserModelSpendByPeriod(options: {
  userIds: string[];
  startTimestampMs: number;
  endTimestampMs: number;
  perUserLimit: number;
}) {
  const { userIds, startTimestampMs, endTimestampMs, perUserLimit } = options;

  if (!getAdminAiUserModelSpendByPeriodPipe || userIds.length === 0) {
    return [];
  }

  return (
    await getAdminAiUserModelSpendByPeriodPipe({
      userIdsCsv: userIds.join(","),
      startTimestampMs,
      endTimestampMs,
      perUserLimit,
    })
  ).data;
}
