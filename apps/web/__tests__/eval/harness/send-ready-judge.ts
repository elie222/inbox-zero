import { generateObject } from "ai";
import { getHarnessJudgeModel } from "@/__tests__/eval/harness/judge-model";
import {
  applyConsistencyGuards,
  buildJudgeSystemPrompt,
  buildPrompt,
  judgeSchema,
  type SendReadyVerdict,
} from "@/__tests__/eval/harness/send-ready-judge-contract";

export async function judgeSendReady({
  inboundThread,
  draft,
  groundTruth,
  context,
  signal,
}: {
  inboundThread: string;
  draft: string;
  groundTruth: string;
  context?: string | null;
  signal?: AbortSignal;
}): Promise<SendReadyVerdict> {
  const { model, providerOptions } = getHarnessJudgeModel();

  const { object } = await generateObject({
    model,
    providerOptions,
    schema: judgeSchema,
    system: buildJudgeSystemPrompt(),
    prompt: buildPrompt({ inboundThread, draft, groundTruth, context }),
    temperature: 0,
    maxRetries: 2,
    abortSignal: signal,
  });

  return applyConsistencyGuards(object);
}
