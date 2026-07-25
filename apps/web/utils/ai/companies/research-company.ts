import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { createGenerateObject, createGenerateText } from "@/utils/llms";
import { getEmailListPrompt, getUserInfoPrompt } from "@/utils/ai/helpers";
import { getWebSearchConfig } from "@/utils/ai/web-search";
import type { Logger } from "@/utils/logger";

const schema = z.object({
  name: z
    .string()
    .nullable()
    .describe(
      'The company\'s properly formatted official name — real capitalization and spacing (e.g. "700Credit", "Route 24 Auto Group"), no legal suffix unless it\'s part of how they brand themselves. Null only if the company can\'t be identified.',
    ),
  summary: z
    .string()
    .describe(
      "2-4 sentences: who this company is and what they do — products/services, industry, and anything notable (size, location, who they serve). Ground every claim in the research or the emails.",
    ),
  label: z
    .object({
      name: z
        .string()
        .describe(
          "An existing label's exact name when one fits, otherwise a short new label name.",
        ),
      parentName: z
        .string()
        .nullable()
        .describe(
          "The exact name of the existing top-level label to nest under, or null for top level.",
        ),
    })
    .nullable()
    .describe(
      "The label this company belongs under, given the user's label structure. Strongly prefer an existing label; only propose a new one (optionally nested under an existing top-level label) when nothing fits. Null when there's no sensible fit at all.",
    ),
});
export type CompanyResearchResult = z.infer<typeof schema>;

const MAX_SAMPLE_EMAILS = 10;

// Researches who a company is: web research on its domain (when the
// deployment has a web-search-capable model) combined with the user's email
// history with that domain. Returns the properly formatted name and a
// summary of what the company does.
export async function aiResearchCompany({
  emailAccount,
  companyName,
  domains,
  emails,
  labels,
  logger,
}: {
  emailAccount: EmailAccountWithAI;
  companyName: string;
  domains: string[];
  emails: EmailForLLM[];
  // The user's label structure ("Factory", "Factory › Toyota", …) so the
  // AI can suggest where this company belongs
  labels: { name: string; parentName: string | null }[];
  logger: Logger;
}): Promise<CompanyResearchResult | null> {
  const webNotes = await runWebResearch({
    emailAccount,
    companyName,
    domains,
    logger,
  });
  if (!webNotes && !emails.length) return null;

  const system = `You are an AI assistant that researches companies for the user's contact book.

<instructions>
You are given research material about the company currently saved as "${companyName}"${domains.length ? ` (email domain${domains.length > 1 ? "s" : ""}: ${domains.join(", ")})` : ""}.

Your task:
1. Determine the company's properly formatted official name — the capitalization and spacing they actually use, which domain names lose (e.g. the domain "700credit.com" belongs to "700Credit", "route24autogroup.com" to "Route 24 Auto Group").
2. Write a short summary of who they are and what they do, so the user can read about them at a glance.
3. Suggest which of the user's labels this company belongs under. Strongly prefer an existing label (use its exact name). Only propose a new label — optionally nested under an existing top-level label — when nothing existing fits; keep new names short and consistent with the user's naming style. Return null when no label makes sense.

Rules:
- Only state what the research material or emails support. Never invent facts about the company.
- If the material doesn't identify the company, return null for the name and summarize only what the emails show about the relationship.
</instructions>

<existing_labels>
${
  labels.length
    ? labels
        .map((label) =>
          label.parentName ? `${label.parentName} › ${label.name}` : label.name,
        )
        .join("\n")
    : "(none yet)"
}
</existing_labels>

${getUserInfoPrompt({ emailAccount })}

<outputFormat>
Respond with a JSON object:
- "name": string or null — the properly formatted company name.
- "summary": string — 2-4 sentences on who they are and what they do.
- "label": { "name": string, "parentName": string or null } or null — where this company belongs in the user's labels; an existing label's exact name, or a new one when nothing fits.
</outputFormat>`;

  const prompt = `${
    webNotes
      ? `<web_research>
${webNotes}
</web_research>

`
      : ""
  }${
    emails.length
      ? `<sample_emails>
${getEmailListPrompt({
  messages: emails,
  messageMaxLength: 1000,
  maxMessages: MAX_SAMPLE_EMAILS,
})}
</sample_emails>`
      : ""
  }`;

  const modelOptions = getModelForUseCase(
    emailAccount.user,
    LlmUseCase.ResearchCompany,
  );

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Research company",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "compact" },
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema,
  });

  return aiResponse.object;
}

// Free-text web research on the company's domain via the deployment's
// web-search mechanism (native search tools or OpenRouter :online). Null
// when unavailable or failed — the caller falls back to email history.
async function runWebResearch({
  emailAccount,
  companyName,
  domains,
  logger,
}: {
  emailAccount: EmailAccountWithAI;
  companyName: string;
  domains: string[];
  logger: Logger;
}): Promise<string | null> {
  const config = getWebSearchConfig();
  if (!config || !domains.length) return null;

  try {
    const modelOptions = getModelForUseCase(
      emailAccount.user,
      LlmUseCase.MeetingWebSearch,
      config.useOnlineVariant,
    );

    const generateText = createGenerateText({
      emailAccount,
      label: "Company web research",
      modelOptions,
      promptHardening: { trust: "untrusted", level: "full" },
    });

    const result = await generateText({
      model: modelOptions.model,
      prompt: `Research the company that operates the email domain ${domains[0]} (saved in my contacts as "${companyName}"). Check their website (https://${domains[0]}) and other sources. Report concise notes: their properly formatted official name, what they do or sell, their industry, and anything notable (size, headquarters, who they serve).`,
      ...(config.getSearchTools && { tools: config.getSearchTools() }),
    });

    return result.text?.trim() || null;
  } catch (error) {
    logger.warn("Company web research failed; using email history only", {
      error,
    });
    return null;
  }
}
