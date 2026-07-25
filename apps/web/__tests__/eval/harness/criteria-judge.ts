import { generateObject } from "ai";
import { z } from "zod";
import { getHarnessJudgeModel } from "@/__tests__/eval/harness/judge-model";

const MAX_TEXT_CHARS = 12_000;

const criteriaResultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string().describe("The id of the criterion being judged."),
      reasoning: z
        .string()
        .describe(
          "One sentence pointing at the specific span of the draft that decides this criterion.",
        ),
      pass: z
        .boolean()
        .describe("True only if the criterion is fully satisfied."),
    }),
  ),
});

export type CriterionVerdict = {
  id: string;
  criterion: string;
  pass: boolean;
  reasoning: string;
};

export type CriteriaVerdict = {
  results: CriterionVerdict[];
  failures: string[];
};

const SYSTEM_PROMPT = `You check an email draft against a short list of case-specific criteria.

Each criterion is judged independently and answered with a plain yes or no. There is no partial credit and no benefit of the doubt: if the draft only arguably satisfies a criterion, it does not satisfy it.

Rules:
- Judge only what the criterion asks. Do not fail a criterion because of some other flaw in the draft.
- Judge the draft as written, not the intent you infer behind it.
- A criterion phrased as a prohibition ("does not state a price") passes when the draft does not do the thing.
- A criterion about language or tone is judged semantically, not by looking for particular words. These drafts appear in many languages.
- Return exactly one result per criterion id you were given, using the ids verbatim.`;

export async function judgeCriteria({
  inboundThread,
  draft,
  criteria,
  groundTruth,
  context,
  signal,
}: {
  inboundThread: string;
  draft: string;
  criteria: { id: string; criterion: string }[];
  groundTruth: string;
  context?: string | null;
  signal?: AbortSignal;
}): Promise<CriteriaVerdict> {
  if (criteria.length === 0) return { results: [], failures: [] };

  const { model, providerOptions } = getHarnessJudgeModel();

  const { object } = await generateObject({
    model,
    providerOptions,
    schema: criteriaResultSchema,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt({
      inboundThread,
      draft,
      criteria,
      groundTruth,
      context,
    }),
    temperature: 0,
    maxRetries: 2,
    abortSignal: signal,
  });

  const byId = new Map(object.results.map((result) => [result.id, result]));

  // A criterion the judge failed to return is a criterion nobody checked.
  // Fail closed rather than silently shrinking the bar.
  const results = criteria.map((criterion) => {
    const returned = byId.get(criterion.id);
    if (!returned) {
      return {
        id: criterion.id,
        criterion: criterion.criterion,
        pass: false,
        reasoning: "judge returned no verdict for this criterion",
      };
    }
    return {
      id: criterion.id,
      criterion: criterion.criterion,
      pass: returned.pass,
      reasoning: returned.reasoning,
    };
  });

  return {
    results,
    failures: results.filter((result) => !result.pass).map((r) => r.id),
  };
}

function buildPrompt({
  inboundThread,
  draft,
  criteria,
  groundTruth,
  context,
}: {
  inboundThread: string;
  draft: string;
  criteria: { id: string; criterion: string }[];
  groundTruth: string;
  context?: string | null;
}): string {
  return `<thread>
${truncate(inboundThread)}
</thread>

<context_available_to_the_assistant>
${context?.trim() ? truncate(context) : "No context beyond the thread was provided."}
</context_available_to_the_assistant>

<ground_truth>
${truncate(groundTruth)}
</ground_truth>

<draft>
${truncate(draft)}
</draft>

<criteria>
${criteria.map((criterion) => `- ${criterion.id}: ${criterion.criterion}`).join("\n")}
</criteria>

Judge each criterion.`;
}

function truncate(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_TEXT_CHARS)}\n[truncated]`;
}
