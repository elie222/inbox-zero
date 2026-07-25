import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModelForUseCase, LlmUseCase } from "@/utils/llms/use-cases";
import { createGenerateObject } from "@/utils/llms";
import { getUserInfoPrompt } from "@/utils/ai/helpers";

const schema = z.object({
  folderName: z
    .string()
    .describe(
      "The folder this kind of mail should be filed into — an existing folder's exact name when one fits, otherwise a short new folder name.",
    ),
  matchType: z
    .enum(["sender", "domain"])
    .describe(
      '"domain" when everything from this domain belongs together (one company or service); "sender" when only this specific address does (e.g. a person at gmail.com or a mixed-purpose domain).',
    ),
  matchValue: z
    .string()
    .describe(
      'The exact sender address, or the domain with a leading @ (e.g. "@pettys-garage.com").',
    ),
  skipInbox: z
    .boolean()
    .describe(
      "True when this mail doesn't need to interrupt the inbox (newsletters, notifications, promotions, receipts); false when the user should still see it arrive.",
    ),
  markRead: z
    .boolean()
    .describe("True only for mail that's never worth reading individually."),
  reason: z
    .string()
    .describe("One concise sentence explaining the suggestion."),
});
export type ProposedRule = z.infer<typeof schema>;

// Proposes a filing rule from one email: where mail like it belongs and how
// broadly to match. The user reviews and edits before anything is created.
export async function aiProposeRuleFromEmail({
  emailAccount,
  from,
  subject,
  snippet,
  folders,
}: {
  emailAccount: EmailAccountWithAI;
  from: string;
  subject: string;
  snippet: string | null;
  folders: string[];
}): Promise<ProposedRule | null> {
  const system = `You are an AI assistant that proposes email filing rules.

<instructions>
The user right-clicked an email and asked for a rule that files mail like it automatically. Propose:
1. The destination folder — strongly prefer one of the user's existing folders (exact name); suggest a short new folder name only when nothing fits.
2. How to match: the whole sender domain when it's a single company or service, or just this sender address when the domain is shared (freemail, marketplaces) or only this correspondent belongs in the folder.
3. Whether matching mail should skip the inbox, and whether it should be marked read.
</instructions>

<existing_folders>
${folders.length ? folders.join("\n") : "(none yet)"}
</existing_folders>

${getUserInfoPrompt({ emailAccount })}

<outputFormat>
Respond with a JSON object: "folderName", "matchType" ("sender" or "domain"), "matchValue", "skipInbox", "markRead", "reason".
</outputFormat>`;

  const prompt = `<email>
From: ${from}
Subject: ${subject}${snippet ? `\nSnippet: ${snippet}` : ""}
</email>`;

  const modelOptions = getModelForUseCase(
    emailAccount.user,
    LlmUseCase.ProposeRuleFromEmail,
  );

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Propose rule from email",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "compact" },
  });

  const response = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema,
  });

  return response.object;
}
