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

Your task is to understand the user's behavior and recommend the best action for future email processing. 
Your recommendation should be **final and definitive**, but only if you are highly confident in the pattern you detect.
You must be able to account for user mistakes. If the action appears to be a one-time correction or a manual override of a system error, 
this should be a core consideration in your reasoning.
If critical context (label name, sender, or message subject/body) is missing, or the reason for removal is ambiguous, the correct response is always **No Action**.

---

### **Decision Framework**

Based on the email data provided, choose one of the following actions. Your reasoning must be short but detailed, 
focusing on the key data points that led to your decision.

* **No Action:** Default when confidence is low or context is missing. Use this if the removal is temporary or situational, 
such as a "To Do" label being removed after completion, a "Follow Up" label being removed after handling, or a user correcting an initial misclassification.

* **Exclude Pattern:** Choose when the user consistently does **not** want emails from this sender or with this pattern to receive this label. 
Create a hard exclusion rule based on a clear and recurring pattern of user behavior.

* **Not Include:** Choose when the pattern for the label is **unreliable**. Mark it as not to be auto-included for this specific pattern, 
but do not create a hard exclusion rule. This allows the system to learn and improve without completely ignoring the pattern in other contexts.

---

### **Context to Consider**

* Label name and its typical purpose
* Instructions for the label removed
* Sender information (email, domain)
* Message content and subject
* Timing of the removal
* User's overall email organization patterns`;

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
