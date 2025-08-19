import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import { stringifyEmail } from "@/utils/stringify-email";
import { GroupItemType } from "@prisma/client";

const logger = createScopedLogger("ai-label-removal-analysis");

export const LabelRemovalAction = {
  NO_ACTION: "no_action",
  EXCLUDE_PATTERN: "exclude_pattern",
  NOT_INCLUDE: "not_include",
} as const;

export type LabelRemovalAction =
  (typeof LabelRemovalAction)[keyof typeof LabelRemovalAction];

const schema = z.object({
  action: z
    .nativeEnum(LabelRemovalAction)
    .describe("The recommended action based on the label removal analysis"),
  reasoning: z
    .string()
    .describe(
      "Detailed explanation of why this action was chosen, including context about the user's behavior",
    ),
  patternType: z
    .nativeEnum(GroupItemType)
    .optional()
    .describe("Type of pattern to learn from this removal (if applicable)"),
  patternValue: z
    .string()
    .optional()
    .describe(
      "Specific value for the pattern (e.g., email address, domain, subject keyword)",
    ),
  exclude: z
    .boolean()
    .optional()
    .describe(
      "Whether this pattern should be excluded (true) or just not included (false)",
    ),
});

export type LabelRemovalAnalysis = z.infer<typeof schema>;

export async function aiAnalyzeLabelRemoval({
  label: { name, instructions },
  email,
  emailAccount,
}: {
  label: {
    name: string;
    instructions: string | null;
  };
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
}): Promise<LabelRemovalAnalysis> {
  const system = `You are an **email organization expert** analyzing why a user removed a specific label from an email.  

Your task is to understand the user's behavior and **recommend the best action for future email processing — but only if you are highly confident in the pattern you detect**.  
If critical context (label name, sender, or message subject/body) is missing, always choose **No Action**.
Always include a detailed reasoning for your decision.

---

## Decision Framework
- **No Action**
  - Default when confidence is low or context is missing or removal is temporary/situational.
  - Examples: "To Do" removed after completion, "Follow Up" removed after handling.  

- **Exclude Pattern**  
  - Choose when the user consistently does **not** want emails from this sender/pattern to get this label.  
  - Create a hard exclusion rule.  

- **Not Include**  
  - Choose when the pattern is **unreliable** for this label.  
  - Mark it as not to be auto-included, but don't exclude entirely.  


## Context to Consider
- Label name and its typical purpose
- Instructions for the label removed
- Sender information (email, domain)  
- Message content and subject  
- Timing of the removal  
- User's overall email organization patterns`;

  const prompt = `### Context of why the label was added initially

<label>
  <label_name>${name}</label_name>
  <instructions_for_adding_label>${instructions || "No instructions provided"}</instructions_for_adding_label>
</label>

### Message Content
<email>
${stringifyEmail(email, 1000)}
</email>`;

  logger.trace("Input", { system, prompt });

  const modelOptions = getModel(emailAccount.user, "economy");

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "label-removal-analysis",
    modelOptions,
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema,
  });

  logger.trace("Output", aiResponse.object);

  return aiResponse.object;
}
