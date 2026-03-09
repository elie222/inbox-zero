import { z } from "zod";
import { getTinybird } from "./client";

const aiGenerationCountSchema = z.object({
  count: z.number(),
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
